import type { AudioImportMode } from "./audio-file-types.ts";

export type ImportWorkflowStep = "source" | "instrument" | "analyze" | "review" | "ready";

export function importWorkflowState({
  mode,
  reading,
  hasCandidate,
  reviewRequired,
  reviewPending,
}: {
  mode: AudioImportMode;
  reading: boolean;
  hasCandidate: boolean;
  reviewRequired: boolean;
  reviewPending: boolean;
}): { current: ImportWorkflowStep; steps: Array<{ id: ImportWorkflowStep; label: string; done: boolean }> } {
  const current: ImportWorkflowStep = reading
    ? "analyze"
    : !hasCandidate
      ? (mode === "rhythm" ? "source" : "instrument")
      : reviewRequired && reviewPending
        ? "review"
        : "ready";

  const order: ImportWorkflowStep[] = ["source", "instrument", "analyze", "review", "ready"];
  const labels: Record<ImportWorkflowStep, string> = {
    source: "Song",
    instrument: "Instrument",
    analyze: "Analyze",
    review: "Review",
    ready: "Ready",
  };
  const currentIndex = order.indexOf(current);
  return {
    current,
    steps: order.map((id, index) => ({
      id,
      label: labels[id],
      done: index < currentIndex || id === "instrument" && mode === "rhythm",
    })),
  };
}
