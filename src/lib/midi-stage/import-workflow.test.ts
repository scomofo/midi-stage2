import { describe, expect, it } from "./test-compat.ts";
import { importWorkflowState } from "./import-workflow.ts";

describe("instrument import workflow", () => {
  it("starts at song selection for rhythm imports", () => {
    expect(importWorkflowState({
      mode: "rhythm", reading: false, hasCandidate: false, reviewRequired: false, reviewPending: false,
    }).current).toBe("source");
  });

  it("starts at instrument source selection for stem-capable modes", () => {
    expect(importWorkflowState({
      mode: "guitar", reading: false, hasCandidate: false, reviewRequired: true, reviewPending: false,
    }).current).toBe("instrument");
  });

  it("shows analysis while any import is running", () => {
    expect(importWorkflowState({
      mode: "bass", reading: true, hasCandidate: false, reviewRequired: false, reviewPending: false,
    }).current).toBe("analyze");
  });

  it("keeps correction work in review until applied", () => {
    expect(importWorkflowState({
      mode: "keys", reading: false, hasCandidate: true, reviewRequired: true, reviewPending: true,
    }).current).toBe("review");
  });

  it("ends ready when the candidate has no unapplied corrections", () => {
    expect(importWorkflowState({
      mode: "drums", reading: false, hasCandidate: true, reviewRequired: true, reviewPending: false,
    }).current).toBe("ready");
  });
});
