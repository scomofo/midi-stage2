import type { SharedChart } from "./chart-format.ts";
import { isReviewableKeyboardDraft, MAX_KEYBOARD_NOTES } from "./keyboard-draft.ts";
import { isReviewableBassDraft, MAX_BASS_DRAFT_NOTES, STANDARD_BASS_RANGE } from "./bass-draft.ts";
import { withReviewedAudioPart } from "./audio-part-review.ts";

export type KeyboardReviewRow = { id: number; time: string; duration: string; pitch: string; velocity: number; confidence?: number };
export function keyboardReviewRows(chart: SharedChart, instrument: "keys" | "bass" = "keys"): KeyboardReviewRow[] {
  if (!(instrument === "bass" ? isReviewableBassDraft(chart) : isReviewableKeyboardDraft(chart))) return [];
  return (chart.parts.find((part) => part.type === instrument)?.notes ?? []).map((n, id) => ({ id, time: String(n.time), duration: String(n.duration), pitch: String(n.pitch), velocity: n.velocity, confidence: n.confidence }));
}
export function applyKeyboardReview(source: SharedChart, rows: KeyboardReviewRow[], tempo: string, instrument: "keys" | "bass" = "keys"): SharedChart {
  const bass = instrument === "bass";
  const name = bass ? "bass" : "keyboard";
  if (!(bass ? isReviewableBassDraft(source) : isReviewableKeyboardDraft(source))) throw new Error(`This chart is not a pitch-matched ${name} draft.`);
  if (!rows.length) throw new Error(`Keep at least one ${name} note.`);
  if (rows.length > (bass ? MAX_BASS_DRAFT_NOTES : MAX_KEYBOARD_NOTES)) throw new Error(`Keep at most 6,000 ${name} notes.`);
  const number = (text: string, label: string) => { if (!text.trim() || !Number.isFinite(Number(text))) throw new Error(`${label} needs a number.`); return Number(text); };
  const bpm = number(tempo, "Count-in tempo");
  if (bpm < 20 || bpm > 400) throw new Error("Count-in tempo must be between 20 and 400 BPM.");
  const notes = rows.map((r, i) => {
    const time = number(r.time, `Note ${i + 1} time`), duration = number(r.duration, `Note ${i + 1} length`), pitch = number(r.pitch, `Note ${i + 1} pitch`);
    if (!Number.isInteger(pitch) || pitch < (bass ? STANDARD_BASS_RANGE.min : 21) || pitch > (bass ? STANDARD_BASS_RANGE.max : 108)) {
      throw new Error(`Note ${i + 1} needs a ${bass ? "bass pitch from E1 (28) to G4 (67)" : "piano pitch from A0 (21) to C8 (108)"}.`);
    }
    if (time < 0 || duration < 0.02 || time + duration > source.duration + 1e-8) throw new Error(`Note ${i + 1} must fit inside the recording, with a length of at least 0.02 seconds.`);
    return { time, duration, pitch, velocity: r.velocity, ...(r.confidence !== undefined ? { confidence: r.confidence } : {}) };
  }).sort((a, b) => a.time - b.time || a.pitch - b.pitch);
  const last = new Map<number, number>();
  for (const n of notes) {
    if (n.time - (last.get(n.pitch) ?? -Infinity) < 0.02 - 1e-8) throw new Error("Two attacks on the same pitch must be at least 0.02 seconds apart.");
    last.set(n.pitch, n.time);
  }
  return withReviewedAudioPart(source, instrument, notes, bpm);
}
