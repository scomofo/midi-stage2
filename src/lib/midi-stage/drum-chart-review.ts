import { validateSharedChart, type SharedChart } from "./chart-format.ts";
import { DRUMS } from "./engine.ts";

export type DrumReviewRow = { id: number; time: string; pitch: string; velocity: number };
/** Origin is author-supplied metadata; rhythm charts can contain any MIDI pitch. */
export function isReviewableDrumDraft(chart: SharedChart | null | undefined): boolean {
  if (!chart || chart.origin !== "audio-drums-draft" || chart.matching === "rhythm") return false;
  const notes = chart.parts.find((part) => part.type === "drums")?.notes;
  return Boolean(notes?.length && notes.every((note) => DRUMS.some((lane) => lane.notes?.includes(note.pitch))));
}

export function drumReviewRows(chart: SharedChart): DrumReviewRow[] {
  if (!isReviewableDrumDraft(chart)) return [];
  return (chart.parts.find((part) => part.type === "drums")?.notes ?? []).map((note, id) => ({
    id, time: String(note.time), pitch: String(DRUMS.find((lane) => lane.notes?.includes(note.pitch))?.pitch ?? note.pitch), velocity: note.velocity,
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
    return { time, pitch, duration: Math.max(0.02, Math.min(0.06, source.duration - time)), velocity: row.velocity };
  }).sort((a, b) => a.time - b.time || a.pitch - b.pitch);
  const last = new Map<number, number>();
  for (const note of notes) {
    if (note.time - (last.get(note.pitch) ?? -Infinity) < 0.02 - 1e-8) throw new Error("Two hits on the same drum must be at least 0.02 seconds apart.");
    last.set(note.pitch, note.time);
  }
  return validateSharedChart({ ...source, bpm, firstBeat: notes[0]!.time, tempoMap: [{ time: 0, bpm }],
    parts: source.parts.map((part) => ({ ...part, notes: part.type === "drums" ? notes : part.notes })) });
}
