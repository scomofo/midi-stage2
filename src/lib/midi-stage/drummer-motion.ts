import { lowerBound } from "./engine";
import type { ChartNote } from "./types";

/** Presentation only: chart-time strokes never modify note judgments. */
export function drummerStroke(
  notes: Pick<ChartNote, "time" | "lane">[],
  time: number,
  bpm: number,
  enabled: boolean,
) {
  const pose = { left: 0, right: 0 };
  if (!enabled || time < 0 || !Number.isFinite(time) || !(bpm > 0)) return pose;
  const duration = Math.min(0.22, 30 / bpm);
  const start = lowerBound(notes, time - duration);
  for (let i = start; i < notes.length && notes[i]!.time <= time; i++) {
    const note = notes[i]!;
    const phase = (time - note.time) / duration;
    // Smooth return to the raised-stick pose; simultaneous hits can use both arms.
    const strike = Math.sin(Math.PI * phase);
    if (note.lane === 1 || note.lane === 3) pose.left = Math.max(pose.left, strike);
    if (note.lane === 2 || note.lane === 4 || note.lane === 5)
      pose.right = Math.max(pose.right, strike);
  }
  return pose;
}
