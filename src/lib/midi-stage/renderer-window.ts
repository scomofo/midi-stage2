import { lowerBound } from "./engine";
import type { ChartNote, Song } from "./types";

/** Preserve the renderer's candidate order and budget, including its small
 * look-behind. Active holds older than this range are drawn separately. */
export function rendererNoteWindow(notes: Pick<ChartNote, "time">[], time: number, speed: number) {
  const found = lowerBound(notes, time - 0.5 * speed);
  // Match the previous findIndex fallback after the final note. The separate
  // hold pass continues to own sustained notes whose heads are far behind us.
  const anchor = found === notes.length ? 0 : found;
  const end = Math.min(notes.length, anchor + 900);
  // The existing loop stopped after its counter exceeded 900, not at 900.
  const start = Math.max(0, anchor - 8, end - 901);
  return { start, end };
}

/** Only notes in the lookahead can light an approaching receptor. Resolved
 * notes must not hide a later unresolved note on the same lane. */
export function nextVisibleLaneTimes(
  notes: Pick<ChartNote, "time" | "lane" | "state">[],
  laneCount: number,
  time: number,
  look: number,
) {
  const next = Array.from({ length: laneCount }, () => Infinity);
  for (let i = lowerBound(notes, time - 0.08); i < notes.length; i++) {
    const note = notes[i]!;
    if (note.time >= time + look) break;
    if (note.state === 0 && note.time < next[note.lane]!) next[note.lane] = note.time;
  }
  return next;
}

export function rendererBeatStart(beats: Song["beats"], time: number, look: number) {
  const found = lowerBound(beats, time - 0.2);
  // Past the final beat, the former findIndex fallback revisited every beat.
  // Keep its remaining apron lines with a conservative local range; the
  // renderer's unchanged progress check rejects anything already offscreen.
  return found === beats.length ? lowerBound(beats, time - look) : found;
}
