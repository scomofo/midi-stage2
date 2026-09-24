export const TIMING_CENTER_MS = 20;
export const MIN_TIMING_HITS = 8;

export type TimingSummary = {
  count: number;
  early: number;
  centered: number;
  late: number;
  medianMs: number | null;
  tendency: "insufficient" | "early" | "centered" | "late" | "mixed";
};

// Timing is already in real milliseconds in Judge.stats.offsets. These bands
// describe recent successful hits for coaching; they do not change grading.
export function summarizeTiming(offsets: readonly number[]): TimingSummary {
  const samples = offsets.filter(Number.isFinite).slice(-200);
  const count = samples.length;
  let early = 0;
  let centered = 0;
  let late = 0;
  // Subtracting song-clock values can put an exact 20 ms hit just over the edge.
  const edge = TIMING_CENTER_MS + 1e-5;
  for (const offset of samples) {
    if (offset < -edge) early++;
    else if (offset > edge) late++;
    else centered++;
  }

  const sorted = samples.sort((a, b) => a - b);
  const middle = Math.floor(count / 2);
  const medianMs = count === 0 ? null : count % 2
    ? sorted[middle]!
    : sorted[middle - 1]! / 2 + sorted[middle]! / 2;
  const tendency = count < MIN_TIMING_HITS ? "insufficient"
    : early * 5 >= count * 3 ? "early"
      : centered * 5 >= count * 3 ? "centered"
        : late * 5 >= count * 3 ? "late"
          : "mixed";

  return { count, early, centered, late, medianMs, tendency };
}
