import type { SharedChart } from "./chart-format.ts";
import type { AudioReviewInstrument } from "./audio-part-review.ts";
import { guitarReviewRows, applyGuitarReview } from "./guitar-chart-review.ts";
import { drumReviewRows, applyDrumReview } from "./drum-chart-review.ts";
import { keyboardReviewRows, applyKeyboardReview } from "./keyboard-chart-review.ts";
import { confidenceBand } from "./transcription-confidence.ts";
import type { GuitarCandidateDecisions, ShortChordCandidate } from "./guitar-short-chord-audit.ts";

export type AudioReviewRow = {
  id: number; time: string; duration: string; pitch: string; string: string; fret: string;
  velocity: number; confidence?: number; originalPitch?: number;
};
export type AudioReviewDraft = { rows: AudioReviewRow[]; tempo: string; selectedId: number | null; candidateDecisions?: GuitarCandidateDecisions };
export type AudioReviewHistory = { past: AudioReviewDraft[]; present: AudioReviewDraft; future: AudioReviewDraft[] };

export function audioReviewRows(chart: SharedChart, instrument: AudioReviewInstrument): AudioReviewRow[] {
  if (instrument === "guitar") return guitarReviewRows(chart).map((row) => ({ ...row, pitch: "" }));
  const rows = instrument === "drums" ? drumReviewRows(chart) : keyboardReviewRows(chart, instrument);
  return rows.map((row) => ({ ...row, duration: row.duration ?? "0.06", string: "6", fret: "0" }));
}
export function applyAudioReviewDraft(chart: SharedChart, instrument: AudioReviewInstrument, draft: AudioReviewDraft): SharedChart {
  return instrument === "guitar" ? applyGuitarReview(chart, draft.rows, draft.tempo)
    : instrument === "drums" ? applyDrumReview(chart, draft.rows, draft.tempo)
      : applyKeyboardReview(chart, draft.rows, draft.tempo, instrument);
}
export function audioReviewPitch(row: AudioReviewRow, instrument: AudioReviewInstrument, tuning?: readonly number[]): number {
  if (instrument !== "guitar") return row.pitch.trim() ? Number(row.pitch) : NaN;
  const string = Number(row.string), fret = Number(row.fret);
  return tuning && row.string.trim() && row.fret.trim() && Number.isInteger(string) && string >= 1 && string <= 6
    && Number.isInteger(fret) && fret >= 0 && fret <= 24 ? tuning[6 - string]! + fret : NaN;
}
export function needsAudioReview(row: Pick<AudioReviewRow, "confidence">): boolean {
  return confidenceBand(row.confidence) !== "high";
}
export function audioReviewDraftKey(draft: AudioReviewDraft): string {
  return JSON.stringify([draft.tempo, draft.rows, draft.candidateDecisions ?? {}]);
}
/** Validation sorts and renumbers rows. Preserve the actual chord tone, not just its onset. */
export function selectedAudioReviewRow(rows: AudioReviewRow[], previous: AudioReviewRow | undefined, instrument: AudioReviewInstrument): AudioReviewRow | undefined {
  const time = Number(previous?.time);
  if (!previous || !Number.isFinite(time)) return rows[0];
  const exact = rows.find((row) => Math.abs(Number(row.time) - time) < 1e-6 && (instrument === "guitar"
    ? Number(row.string) === Number(previous.string) && Number(row.fret) === Number(previous.fret)
    : Number(row.pitch) === Number(previous.pitch)));
  return exact ?? rows.reduce<AudioReviewRow | undefined>((best, row) => !best || Math.abs(Number(row.time) - time) < Math.abs(Number(best.time) - time) ? row : best, undefined);
}
export function createAudioReviewHistory(chart: SharedChart, instrument: AudioReviewInstrument, candidateDecisions?: GuitarCandidateDecisions): AudioReviewHistory {
  const rows = audioReviewRows(chart, instrument);
  return { past: [], present: { rows, tempo: String(chart.bpm), selectedId: rows[0]?.id ?? null, candidateDecisions }, future: [] };
}

/** Keep every existing fingering and hold. Offer only a free string for this tone. */
export function guitarCandidateRow(chart: SharedChart, draft: AudioReviewDraft, candidate: ShortChordCandidate, id: number): AudioReviewRow {
  if (draft.rows.length >= 6000) throw new Error("The guitar draft has reached its 6,000-note review limit.");
  if (chart.guitarMode !== "strings" || !chart.guitarTuning || !Number.isInteger(candidate.pitchMidi) || !Number.isFinite(candidate.time)
      || !Number.isFinite(candidate.estimatedDuration) || candidate.time < 0 || candidate.estimatedDuration < 0.02
      || candidate.time + candidate.estimatedDuration > chart.duration + 1e-6) throw new Error("This suggestion does not fit the guitar recording.");
  const applied = applyAudioReviewDraft(chart, "guitar", draft);
  const notes = applied.parts.find((part) => part.type === "guitar")!.notes;
  if (notes.some((note) => note.pitch === candidate.pitchMidi && Math.abs(note.time - candidate.time) <= 0.06)) {
    throw new Error("This pitch is already in the draft near this attack. Review the existing note.");
  }
  const positions = chart.guitarTuning.map((pitch, low) => ({ string: 6 - low, fret: candidate.pitchMidi - pitch }))
    .filter((position) => position.fret >= 0 && position.fret <= 24 && !notes.some((note) => note.guitarPosition!.string === position.string
      && note.time < candidate.time + candidate.estimatedDuration - 1e-6 && candidate.time < note.time + note.duration - 1e-6))
    .sort((a, b) => a.fret - b.fret || b.string - a.string);
  const position = positions[0];
  if (!position) throw new Error("No free string can play this suggestion. Adjust the nearby notes or their lengths first.");
  const time = Math.round(candidate.time * 1e6) / 1e6;
  return { id, time: String(time), duration: String(Math.min(chart.duration - time, Math.round(candidate.estimatedDuration * 1e6) / 1e6)), pitch: "",
    string: String(position.string), fret: String(position.fret), velocity: 90 };
}

export function acceptGuitarCandidate(chart: SharedChart, draft: AudioReviewDraft, candidate: ShortChordCandidate, id: number): AudioReviewDraft {
  if (draft.candidateDecisions?.[candidate.id]) throw new Error("Reopen this suggestion before accepting it again.");
  const row = guitarCandidateRow(chart, draft, candidate, id);
  const rows = [...draft.rows, row].sort((a, b) => Number(a.time) - Number(b.time) || a.id - b.id);
  const next = { ...draft, rows, selectedId: id, candidateDecisions: { ...draft.candidateDecisions, [candidate.id]: "accepted" as const } };
  applyAudioReviewDraft(chart, "guitar", next);
  return next;
}
export function pushAudioReviewHistory(history: AudioReviewHistory, draft: AudioReviewDraft): AudioReviewHistory {
  if (audioReviewDraftKey(draft) === audioReviewDraftKey(history.present)) return { ...history, present: draft };
  return { past: [...history.past.slice(-49), history.present], present: draft, future: [] };
}
export function undoAudioReview(history: AudioReviewHistory): AudioReviewHistory {
  const previous = history.past.at(-1);
  return previous ? { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] } : history;
}
export function redoAudioReview(history: AudioReviewHistory): AudioReviewHistory {
  const next = history.future[0];
  return next ? { past: [...history.past, history.present], present: next, future: history.future.slice(1) } : history;
}
