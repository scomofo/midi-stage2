import type { SharedChart } from "./chart-format.ts";
import { DRUMS } from "./engine.ts";
import { withReviewedAudioPart } from "./audio-part-review.ts";

export type DrumReviewRow = { id: number; time: string; pitch: string; velocity: number; originalPitch?: number; duration?: string; confidence?: number };
/** Origin is author-supplied metadata; rhythm charts can contain any MIDI pitch. */
export function isReviewableDrumDraft(chart: SharedChart | null | undefined): boolean {
  if (!chart || !["audio-drums-draft", "audio-full-band-draft"].includes(chart.origin) || chart.matching === "rhythm") return false;
  const notes = chart.parts.find((part) => part.type === "drums")?.notes;
  return Boolean(notes?.length && notes.every((note) => DRUMS.some((lane) => lane.notes?.includes(note.pitch))));
}

export function drumReviewRows(chart: SharedChart): DrumReviewRow[] {
  if (!isReviewableDrumDraft(chart)) return [];
  return (chart.parts.find((part) => part.type === "drums")?.notes ?? []).map((note, id) => ({
    id, time: String(note.time), pitch: String(DRUMS.find((lane) => lane.notes?.includes(note.pitch))?.pitch ?? note.pitch), velocity: note.velocity,
    originalPitch: note.pitch, duration: String(note.duration), confidence: note.confidence,
  }));
}

/** Audio time never stretches when the estimated count-in tempo is corrected. */
export function applyDrumReview(source: SharedChart, rows: DrumReviewRow[], tempo: string): SharedChart {
  if (!isReviewableDrumDraft(source)) throw new Error("This chart is not a pitch-matched audio drum draft.");
  if (!rows.length) throw new Error("Keep at least one drum hit.");
  if (rows.length > 6000) throw new Error("Keep at most 6,000 drum hits.");
  const number = (text: string, label: string) => {
    if (!text.trim() || !Number.isFinite(Number(text))) throw new Error(`${label} needs a number.`);
    return Number(text);
  };
  const bpm = number(tempo, "Count-in tempo");
  if (bpm < 20 || bpm > 400) throw new Error("Count-in tempo must be between 20 and 400 BPM.");
  const notes = rows.map((row, i) => {
    const time = number(row.time, `Hit ${i + 1} time`);
    const pitch = number(row.pitch, `Hit ${i + 1} drum`);
    if (time < 0 || time > source.duration - 0.02 + 1e-8) throw new Error(`Hit ${i + 1} must fall inside the recording.`);
    if (!DRUMS.some((lane) => lane.pitch === pitch)) throw new Error(`Hit ${i + 1} needs a supported drum type.`);
    const originalLane = DRUMS.find((lane) => lane.notes?.includes(row.originalPitch ?? -1));
    return { time, pitch: originalLane?.pitch === pitch ? row.originalPitch! : pitch,
      duration: Math.max(0.02, Math.min(row.duration === undefined ? 0.06 : number(row.duration, `Hit ${i + 1} length`), source.duration - time)), velocity: row.velocity,
      ...(row.confidence !== undefined ? { confidence: row.confidence } : {}) };
  }).sort((a, b) => a.time - b.time || a.pitch - b.pitch);
  const last = new Map<number, number>();
  for (const note of notes) {
    const lane = DRUMS.find((lane) => lane.notes?.includes(note.pitch))!.pitch;
    if (note.time - (last.get(lane) ?? -Infinity) < 0.02 - 1e-8) throw new Error("Two hits on the same drum must be at least 0.02 seconds apart.");
    last.set(lane, note.time);
  }
  return withReviewedAudioPart(source, "drums", notes, bpm);
}
