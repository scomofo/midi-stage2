import type { ChartNote } from "./types.ts";

export type HighwayReadability = {
  visibleDensity: number;
  attackScale: number;
  sustainScale: number;
  showChordLabels: boolean;
};

export function highwayReadability(notes: ChartNote[], now: number, speed: number): HighwayReadability {
  const windowSeconds = Math.max(1.2, 2.8 * speed);
  const visible = notes.filter((n) => n.state === 0 && n.time >= now - 0.15 && n.time <= now + windowSeconds);
  const onsetBuckets = new Set(visible.map((n) => Math.round(n.time / 0.035)));
  const visibleDensity = onsetBuckets.size / windowSeconds;
  if (visibleDensity >= 10) return { visibleDensity, attackScale: 0.84, sustainScale: 0.82, showChordLabels: false };
  if (visibleDensity >= 7) return { visibleDensity, attackScale: 0.92, sustainScale: 0.9, showChordLabels: true };
  return { visibleDensity, attackScale: 1, sustainScale: 1, showChordLabels: true };
}

export function sectionApproach(
  sections: Array<{ time: number; name: string }>,
  now: number,
  horizon = 4,
): { name: string; seconds: number } | null {
  const next = sections.find((section) => section.time > now + 0.05 && section.time <= now + horizon);
  return next ? { name: next.name, seconds: next.time - now } : null;
}
