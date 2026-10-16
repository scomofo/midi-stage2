import type { SharedNote } from "./chart-format.ts";

export const LOW_CONFIDENCE = 0.55;
export const MEDIUM_CONFIDENCE = 0.75;

export function confidenceBand(confidence: number | undefined): "unknown" | "low" | "medium" | "high" {
  if (confidence === undefined) return "unknown";
  if (confidence < LOW_CONFIDENCE) return "low";
  if (confidence < MEDIUM_CONFIDENCE) return "medium";
  return "high";
}

export function transcriptionConfidenceSummary(notes: Pick<SharedNote, "confidence">[]) {
  const scored = notes.filter((note) => typeof note.confidence === "number");
  const low = scored.filter((note) => confidenceBand(note.confidence) === "low").length;
  const medium = scored.filter((note) => confidenceBand(note.confidence) === "medium").length;
  const high = scored.filter((note) => confidenceBand(note.confidence) === "high").length;
  return {
    scored: scored.length,
    low,
    medium,
    high,
    needsReview: low + medium,
  };
}
