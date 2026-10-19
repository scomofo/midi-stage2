import { CHART_SCHEMA, validateSharedChart, type SharedChart } from "./chart-format.ts";
import { INSTRUMENTS, type GuitarPosition } from "./types.ts";
import { solveGuitarFingering } from "./guitar-fingering-solver.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";

export const STANDARD_GUITAR_TUNING = [40, 45, 50, 55, 59, 64] as const;
export const MAX_GUITAR_DRAFT_NOTES = 6000;
export type GuitarEvent = KeyboardEvent & { shortAttackVerified?: true };

export function makeGuitarDraft(
  events: GuitarEvent[],
  duration: number,
  filename: string,
  fingerprint: string,
  tuning: readonly number[] = STANDARD_GUITAR_TUNING,
): { chart: SharedChart; warnings: string[] } {
  if (!/^[a-z0-9_-]{1,96}$/i.test(fingerprint)) throw new Error("The audio fingerprint is invalid. Please import the file again.");
  if (tuning.length !== 6 || tuning.some((pitch) => !Number.isInteger(pitch) || pitch < 0 || pitch > 127)) {
    throw new Error("Guitar tuning must contain six MIDI pitches from low string 6 to high string 1.");
  }

  const candidates = events
    .filter((event) =>
      [event.startTimeSeconds, event.durationSeconds, event.pitchMidi, event.amplitude].every(Number.isFinite) &&
      Number.isInteger(event.pitchMidi) &&
      event.pitchMidi >= Math.min(...tuning) &&
      event.pitchMidi <= Math.max(...tuning) + 24 &&
      event.amplitude >= 0.42 &&
      event.durationSeconds >= (event.shortAttackVerified ? 0.035 : 0.07) &&
      event.startTimeSeconds < duration - 0.02,
    )
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || b.amplitude - a.amplitude);

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
    guitarMode: "strings",
    guitarTuning: [...tuning],
    id: `chart-audio-guitar-${fingerprint}`,
    title: filename.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim().slice(0, 160) || "Guitar draft",
    bpm: 120,
    duration,
    firstBeat: notes[0]!.time,
    audioOffset: 0,
    audioName: filename.slice(0, 256),
    origin: "audio-guitar-draft",
    parts: INSTRUMENTS.map((type) => ({ type, notes: type === "guitar" ? notes : [] })),
  });

  return {
    chart,
    warnings: [
      "Guitar draft: pitches, onsets and holds are estimated from Basic Pitch. String/fret positions are suggested for playability and are not a claim about the performer's actual fingering.",
      "Review every uncertain chord, position jump and sustain in the six-string editor before adding the chart. Clean isolated guitar stems work best.",
      "Review the count-in tempo. Changing it keeps the detected notes aligned with the original recording; it does not stretch the backing audio.",
      ...(droppedUnplayable ? [`${droppedUnplayable} detected notes were omitted because no non-overlapping position was available in the selected tuning.`] : []),
      ...(limited ? ["This draft reached 6,000 detected notes; only the earliest retained candidates were considered."] : []),
    ],
  };
}

export function isReviewableGuitarDraft(chart: SharedChart | null | undefined): boolean {
  return Boolean(
    chart &&
    chart.origin === "audio-guitar-draft" &&
    chart.guitarMode === "strings" &&
    chart.guitarTuning?.length === 6 &&
    chart.parts.find((part) => part.type === "guitar")?.notes.length,
  );
}
