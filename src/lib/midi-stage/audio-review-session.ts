import type { SharedChart } from "./chart-format.ts";
import type { AudioReviewInstrument } from "./audio-part-review.ts";
import { guitarReviewRows, applyGuitarReview } from "./guitar-chart-review.ts";
import { drumReviewRows, applyDrumReview } from "./drum-chart-review.ts";
import { keyboardReviewRows, applyKeyboardReview } from "./keyboard-chart-review.ts";
import { confidenceBand } from "./transcription-confidence.ts";

export type AudioReviewRow = {
  id: number; time: string; duration: string; pitch: string; string: string; fret: string;
  velocity: number; confidence?: number; originalPitch?: number;
};
export type AudioReviewDraft = { rows: AudioReviewRow[]; tempo: string; selectedId: number | null };
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
  return JSON.stringify([draft.tempo, draft.rows]);
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
export function createAudioReviewHistory(chart: SharedChart, instrument: AudioReviewInstrument): AudioReviewHistory {
  const rows = audioReviewRows(chart, instrument);
  return { past: [], present: { rows, tempo: String(chart.bpm), selectedId: rows[0]?.id ?? null }, future: [] };
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
