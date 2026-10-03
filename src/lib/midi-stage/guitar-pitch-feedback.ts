import { noteName, pc } from "./engine";
import type { ChartNote } from "./types";

export type GuitarPitchFeedback = {
  kind: "matched" | "octave" | "different" | "repeat" | "between";
  pitch: number;
  targetPitches: number[];
  detail: string;
};

/** Describe the actual Judge result, without scoring or inferring a string.
 * Call after hitPitch: its mutations distinguish pending tones from repeats.
 * A nearest pending attack is a coaching reference, not a new pitch match. */
export function getGuitarPitchFeedback(
  notes: readonly ChartNote[],
  time: number,
  lateWindow: number,
  pitch: number,
  matched: ChartNote | null,
): GuitarPitchFeedback {
  if (matched) {
    const grade = matched.grade === "perfect" ? "Perfect" : matched.grade === "great" ? "Great"
      : matched.grade === "good" ? "Good" : null;
    return {
      kind: "matched", pitch, targetPitches: [matched.pitch],
      detail: grade ? `${grade} · target matched` : "Target matched",
    };
  }
  const between: GuitarPitchFeedback = {
    kind: "between", pitch, targetPitches: [], detail: "Between targets · watch the strike line",
  };
  if (!Number.isFinite(time) || !Number.isFinite(lateWindow) || lateWindow < 0
    || !Number.isInteger(pitch) || pitch < 0 || pitch > 127) return between;

  const earliest = time - lateWindow - 1e-8;
  const latest = time + lateWindow + 1e-8;
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid]!.time < earliest) lo = mid + 1;
    else hi = mid;
  }

  let repeated = false;
  let nearestTime: number | null = null;
  let nearestDistance = Infinity;
  let targetPitches: number[] = [];
  for (let index = lo; index < notes.length; index++) {
    const note = notes[index]!;
    if (note.time > latest) break;
    if (note.state === 1 && note.pitch === pitch) repeated = true;
    if (note.state !== 0) continue;
    const distance = Math.abs(note.time - time);
    // Strictly closer wins; equal-distance attacks retain the earlier chart
    // time, matching the Judge's ordered closest-target rule.
    if (distance < nearestDistance) {
      nearestTime = note.time;
      nearestDistance = distance;
      targetPitches = [];
    }
    if (note.time === nearestTime && !targetPitches.includes(note.pitch)) targetPitches.push(note.pitch);
  }
  if (repeated) {
    return {
      kind: "repeat", pitch, targetPitches,
      detail: targetPitches.length ? "Already matched · play the remaining targets" : "Already matched · wait for the next target",
    };
  }
  if (!targetPitches.length) return between;

  const octaves = targetPitches.filter((target) => target !== pitch && pc(target) === pc(pitch));
  const names = (octaves.length ? octaves : targetPitches).map(noteName).join(" · ");
  const targetLabel = (octaves.length || targetPitches.length) === 1 ? "target" : "targets";
  return {
    kind: octaves.length ? "octave" : "different", pitch, targetPitches,
    detail: `${octaves.length ? "Octave differs" : "Different pitch"} · ${targetLabel} ${names}`,
  };
}
