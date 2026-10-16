import { CHART_SCHEMA, validateSharedChart, type SharedChart } from "./chart-format.ts";
import { INSTRUMENTS, type GuitarPosition } from "./types.ts";
import { solveGuitarFingering } from "./guitar-fingering-solver.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";

export const STANDARD_GUITAR_TUNING = [40, 45, 50, 55, 59, 64] as const;
export const MAX_GUITAR_DRAFT_NOTES = 6000;

type Candidate = {
  startTimeSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number;
};

export function makeGuitarDraft(
  events: KeyboardEvent[],
  duration: number,
  tuning: readonly number[] = STANDARD_GUITAR_TUNING,
  filename = "guitar.wav",
  fingerprint = "",
) {
  if (!/^[a-z0-9_-]{1,96}$/i.test(fingerprint)) throw new Error("The audio fingerprint is invalid. Please import the file again.");

  const candidates = events
    .filter((e) => [e.startTimeSeconds, e.durationSeconds, e.pitchMidi, e.amplitude].every(Number.isFinite))
    .sort((a, b) => b.amplitude - a.amplitude);

  const limited = candidates.length > MAX_GUITAR_DRAFT_NOTES;
  const selectedEvents = candidates.slice(0, MAX_GUITAR_DRAFT_NOTES);
  const solved = solveGuitarFingering(selectedEvents, tuning);
  const droppedUnplayable = solved.dropped.length;
  const notes: Array<{
    time: number;
    duration: number;
    pitch: number;
    velocity: number;
    confidence?: number;
    guitarPosition: GuitarPosition;
  }> = solved.assignments.map((event) => {
    const time = Math.max(0, Math.round(event.startTimeSeconds * 1e6) / 1e6);
    const end = Math.min(duration, event.startTimeSeconds + event.durationSeconds);
    return {
      time,
      duration: Math.max(0.02, Math.round((end - time) * 1e6) / 1e6),
      pitch: event.pitchMidi,
      velocity: Math.max(1, Math.min(127, Math.round(event.amplitude * 127))),
      confidence: Math.max(0, Math.min(1, event.amplitude)),
      guitarPosition: { string: event.string, fret: event.fret },
    };
  });

  if (!notes.length) {
    throw new Error("No playable guitar notes were found. Try a clean isolated guitar stem, or import authored tablature.");
  }

  const chart = validateSharedChart({
    schema: CHART_SCHEMA,
    version: 4,
    id: `chart-audio-guitar-${fingerprint}`,
    title: filename.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim().slice(0, 160) || "Guitar draft",
    bpm: 120,
    duration,
    firstBeat: notes[0]!.time,
    audioOffset: 0,
    audioName: filename.slice(0, 256),
    origin: "audio-guitar-draft",
    guitarMode: "strings",
    guitarTuning: tuning as number[],
    parts: INSTRUMENTS.map((type) => ({ type, notes: type === "guitar" ? notes : [] })),
  });

  return {
    chart,
    warnings: [
      "Guitar draft: estimated pitches, onsets and holds from Basic Pitch. A fingering solver suggested playable strings/frets; review the result before playing.",
      ...(limited ? ["This draft reached 6,000 notes; only the strongest candidates were retained."] : []),
      ...(droppedUnplayable ? [`${droppedUnplayable} notes could not be assigned a playable standard-tuning position and were omitted.`] : []),
    ],
  };
}
