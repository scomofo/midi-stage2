import { CHART_SCHEMA, validateSharedChart, type SharedChart } from "./chart-format.ts";
import { INSTRUMENTS } from "./types.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";

export const STANDARD_BASS_RANGE = { min: 28, max: 67 } as const;
export const MAX_BASS_DRAFT_NOTES = 6000;

export function makeBassDraft(
  events: KeyboardEvent[],
  duration: number,
  filename: string,
  fingerprint: string,
): { chart: SharedChart; warnings: string[] } {
  if (!/^[a-z0-9_-]{1,96}$/i.test(fingerprint)) throw new Error("The audio fingerprint is invalid. Please import the file again.");

  const candidates = events
    .filter((event) =>
      [event.startTimeSeconds, event.durationSeconds, event.pitchMidi, event.amplitude].every(Number.isFinite) &&
      Number.isInteger(event.pitchMidi) &&
      event.pitchMidi >= STANDARD_BASS_RANGE.min &&
      event.pitchMidi <= STANDARD_BASS_RANGE.max &&
      event.amplitude >= 0.4 &&
      event.durationSeconds >= 0.07 &&
      event.startTimeSeconds < duration - 0.02,
    )
    .sort((a, b) => b.amplitude - a.amplitude);

  const limited = candidates.length > MAX_BASS_DRAFT_NOTES;
  const notes = candidates.slice(0, MAX_BASS_DRAFT_NOTES)
    .map((event) => {
      const time = Math.max(0, Math.round(event.startTimeSeconds * 1e6) / 1e6);
      const end = Math.min(duration, event.startTimeSeconds + event.durationSeconds);
      return {
        time,
        duration: Math.max(0.02, Math.round((end - time) * 1e6) / 1e6),
        pitch: event.pitchMidi,
        velocity: Math.max(1, Math.min(127, Math.round(event.amplitude * 127))),
      };
    })
    .sort((a, b) => a.time - b.time || a.pitch - b.pitch);

  if (!notes.length) {
    throw new Error("No clear bass notes were found. Try a clean isolated bass stem or import MIDI.");
  }

  const chart = validateSharedChart({
    schema: CHART_SCHEMA,
    version: 1,
    id: `chart-audio-bass-${fingerprint}`,
    title: filename.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim().slice(0, 160) || "Bass draft",
    bpm: 120,
    duration,
    firstBeat: notes[0]!.time,
    audioOffset: 0,
    audioName: filename.slice(0, 256),
    origin: "audio-bass-draft",
    parts: INSTRUMENTS.map((type) => ({ type, notes: type === "bass" ? notes : [] })),
  });

  return {
    chart,
    warnings: [
      "Bass draft: estimated pitches, onsets and holds from Basic Pitch. Harmonics, slides and stem bleed can add or miss notes; review the result before playing.",
      "The draft keeps detected MIDI pitches and song time. It does not claim a physical string/fret fingering.",
      "Review the count-in tempo. Changing it does not move detected notes.",
      ...(limited ? ["This draft reached 6,000 notes; only the strongest candidates were retained."] : []),
    ],
  };
}

export function isReviewableBassDraft(chart: SharedChart | null | undefined): boolean {
  if (!chart || chart.origin !== "audio-bass-draft" || chart.matching === "rhythm" || chart.guitarMode) return false;
  const notes = chart.parts.find((part) => part.type === "bass")?.notes;
  return Boolean(notes?.length && notes.every((note) => Number.isInteger(note.pitch)
    && note.pitch >= STANDARD_BASS_RANGE.min && note.pitch <= STANDARD_BASS_RANGE.max));
}
