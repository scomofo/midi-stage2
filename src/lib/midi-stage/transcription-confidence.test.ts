import { describe, expect, it } from "vitest";
import { confidenceBand, transcriptionConfidenceSummary } from "./transcription-confidence.ts";

describe("transcription confidence", () => {
  it("groups model confidence into review bands", () => {
    expect(confidenceBand(undefined)).toBe("unknown");
    expect(confidenceBand(0.4)).toBe("low");
    expect(confidenceBand(0.6)).toBe("medium");
    expect(confidenceBand(0.9)).toBe("high");
  });

  it("counts notes that deserve review", () => {
    expect(transcriptionConfidenceSummary([
      { confidence: 0.4 },
      { confidence: 0.6 },
      { confidence: 0.9 },
      {},
    ])).toEqual({ scored: 3, low: 1, medium: 1, high: 1, needsReview: 2 });
  });
});
