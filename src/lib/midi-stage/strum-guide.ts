import type { Song } from "./types";

export type StrumDirection = "down" | "up";

/** Suggested eighth-note hand motion, not a transcription or scoring rule.
 * Follow the chart's beat grid (including its first-beat offset). Notes on a
 * beat get a downstroke, notes halfway between beats get an upstroke. Sparse
 * rhythms therefore do not change direction just because a note is missing.
 */
export function suggestedStrum(song: Pick<Song, "beats" | "bpm">, time: number): StrumDirection {
  const beats = song.beats;
  let lo = 0;
  let hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (beats[mid]!.time <= time) lo = mid + 1;
    else hi = mid;
  }
  const previous = beats[Math.max(0, lo - 1)];
  const next = beats[lo === 0 ? 1 : lo];
  const duration =
    previous && next && next.time > previous.time ? next.time - previous.time : 60 / song.bpm;
  const phase = (time - (previous?.time ?? 0)) / duration;
  return Math.abs(Math.round(phase * 2)) % 2 === 0 ? "down" : "up";
}
