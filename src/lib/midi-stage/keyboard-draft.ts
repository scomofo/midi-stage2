import { CHART_SCHEMA, validateSharedChart, type SharedChart } from "./chart-format.ts";
import { INSTRUMENTS } from "./types.ts";

export type KeyboardEvent = { startTimeSeconds: number; durationSeconds: number; pitchMidi: number; amplitude: number };
export const MAX_KEYBOARD_NOTES = 6000;

/** Model output is an estimate; preserve recording seconds and full MIDI octaves. */
export function makeKeyboardDraft(events: KeyboardEvent[], duration: number, filename: string, fingerprint: string) {
  if (!/^[a-z0-9_-]{1,96}$/i.test(fingerprint)) throw new Error("The audio fingerprint is invalid. Please import the file again.");
  const candidates = events.filter((n) => [n.startTimeSeconds, n.durationSeconds, n.pitchMidi, n.amplitude].every(Number.isFinite)
    && Number.isInteger(n.pitchMidi) && n.pitchMidi >= 21 && n.pitchMidi <= 108 && n.amplitude >= 0.4
    && n.durationSeconds >= 0.09 && n.startTimeSeconds + n.durationSeconds > 0.02 && n.startTimeSeconds < duration - 0.02)
    .sort((a, b) => b.amplitude - a.amplitude);
  const limited = candidates.length > MAX_KEYBOARD_NOTES;
  const notes = candidates.slice(0, MAX_KEYBOARD_NOTES).map((n) => {
    const time = Math.round(Math.max(0, n.startTimeSeconds) * 1e6) / 1e6;
    const end = Math.min(duration, n.startTimeSeconds + n.durationSeconds);
    return { time, duration: Math.max(0.02, Math.round((end - time) * 1e6) / 1e6), pitch: n.pitchMidi,
      velocity: Math.max(1, Math.min(127, Math.round(n.amplitude * 127))), confidence: Math.max(0, Math.min(1, n.amplitude)) };
  }).sort((a, b) => a.time - b.time || a.pitch - b.pitch);
  if (!notes.length) throw new Error("No clear keyboard notes were found. Try a clean piano/keyboard stem, or import a MIDI arrangement.");
  const chart = validateSharedChart({ schema: CHART_SCHEMA, version: 1, id: `chart-audio-keys-${fingerprint}`,
    title: filename.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim().slice(0, 160) || "Keyboard draft",
    bpm: 120, duration, firstBeat: notes[0]!.time, audioOffset: 0, audioName: filename.slice(0, 256), origin: "audio-keys-draft",
    parts: INSTRUMENTS.map((type) => ({ type, notes: type === "keys" ? notes : [] })),
  });
  return { chart, warnings: [
    "Keyboard draft: estimated pitches, chords and holds from Basic Pitch. Harmonics, pedal and other instruments can create extra or missed notes. Review pitches, timing and lengths before adding; a clean keyboard stem works best.",
    "Review the count-in tempo. Changing it does not move notes or stretch the recording.",
    "The existing keyboard highway uses pitch-class lanes. Octaves are preserved in the chart and review, while MIDI scoring follows those lanes.",
    ...(limited ? ["This draft reached 6,000 notes; only the strongest candidates were retained."] : []),
  ] };
}

export function isReviewableKeyboardDraft(chart: SharedChart | null | undefined): boolean {
  if (!chart || !["audio-keys-draft", "audio-full-band-draft"].includes(chart.origin) || chart.matching === "rhythm"
    || (chart.guitarMode && chart.origin !== "audio-full-band-draft")) return false;
  const notes = chart.parts.find((part) => part.type === "keys")?.notes;
  return Boolean(notes?.length && notes.every((n) => Number.isInteger(n.pitch) && n.pitch >= 21 && n.pitch <= 108));
}
