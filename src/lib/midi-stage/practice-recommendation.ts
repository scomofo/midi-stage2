import type { PracticeSection } from "./practice";
import type { ChartNote } from "./types";

export type PracticeRecommendation = {
  section: PracticeSection;
  notes: number;
  misses: number;
  brokenHolds: number;
};

// A coaching heuristic, not a grading rule: avoid singling out a passage on
// fewer than eight resolved targets across the instruments that were played.
const MIN_PRACTICE_TARGETS = 8;

/** Compare finished full-song targets on their original clock. Callers exclude
 * autoplay and practice takes. Holds belong to their onset's [start, end)
 * passage, even when their release falls in the next passage.
 */
export function recommendPractice(
  sections: readonly PracticeSection[],
  notes: readonly Pick<ChartNote, "time" | "state" | "hold">[],
): PracticeRecommendation | null {
  if (sections.length < 2 || !notes.some((note) => note.state === 1)) return null;

  let best: PracticeRecommendation | null = null;
  for (const section of sections) {
    let resolved = 0;
    let misses = 0;
    let brokenHolds = 0;
    for (const note of notes) {
      if (note.time < section.start || note.time >= section.end || !Number.isFinite(note.time)) continue;
      if (note.state === 2) {
        resolved++;
        misses++;
      } else if (note.state === 1) {
        resolved++;
        if (note.hold === "broken") brokenHolds++;
      }
    }
    const affected = misses + brokenHolds;
    if (resolved < MIN_PRACTICE_TARGETS || affected === 0) continue;
    const candidate = { section, notes: resolved, misses, brokenHolds };
    if (!best) {
      best = candidate;
      continue;
    }
    const bestAffected = best.misses + best.brokenHolds;
    const rateDifference = affected * best.notes - bestAffected * resolved;
    if (rateDifference > 0 || (rateDifference === 0 && (
      affected > bestAffected || (affected === bestAffected && section.start < best.section.start)
    ))) best = candidate;
  }
  return best;
}
