import type { KeyboardEvent } from "./keyboard-draft.ts";

const SAME_PITCH_JOIN_GAP = 0.045;
const GHOST_WINDOW = 0.035;

/**
 * Conservative post-processing for guitar-oriented Basic Pitch output.
 * It only merges same-pitch flicker and removes very short, much-weaker
 * octave ghosts near a stronger lower attack. Sustained chord tones survive.
 */
export function cleanGuitarEvents(events: KeyboardEvent[]): KeyboardEvent[] {
  const valid = events
    .filter((event) => [event.startTimeSeconds, event.durationSeconds, event.pitchMidi, event.amplitude].every(Number.isFinite))
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.pitchMidi - b.pitchMidi);

  const merged: KeyboardEvent[] = [];
  for (const event of valid) {
    const previous = [...merged].reverse().find((candidate) => candidate.pitchMidi === event.pitchMidi);
    if (previous) {
      const previousEnd = previous.startTimeSeconds + previous.durationSeconds;
      if (event.startTimeSeconds - previousEnd >= -0.015 && event.startTimeSeconds - previousEnd <= SAME_PITCH_JOIN_GAP) {
        const end = Math.max(previousEnd, event.startTimeSeconds + event.durationSeconds);
        previous.durationSeconds = end - previous.startTimeSeconds;
        previous.amplitude = Math.max(previous.amplitude, event.amplitude);
        continue;
      }
    }
    merged.push({ ...event });
  }

  return merged.filter((event, index) => {
    if (event.durationSeconds >= 0.16) return true;
    for (let i = Math.max(0, index - 12); i < Math.min(merged.length, index + 13); i++) {
      if (i === index) continue;
      const other = merged[i]!;
      if (Math.abs(other.startTimeSeconds - event.startTimeSeconds) > GHOST_WINDOW) continue;
      if (event.pitchMidi - other.pitchMidi !== 12 && event.pitchMidi - other.pitchMidi !== 24) continue;
      if (other.amplitude >= event.amplitude / 0.6 && other.durationSeconds >= event.durationSeconds) {
        return false;
      }
    }
    return true;
  });
}
