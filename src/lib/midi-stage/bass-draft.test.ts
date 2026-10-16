import { describe, expect, it } from "./test-compat.ts";
import { makeBassDraft, isReviewableBassDraft } from "./bass-draft.ts";

describe("bass audio draft", () => {
  it("creates a playable bass-only chart with full MIDI pitches", () => {
    const { chart } = makeBassDraft([
      { startTimeSeconds: 0.1, durationSeconds: 0.3, pitchMidi: 28, amplitude: 0.9 },
      { startTimeSeconds: 0.5, durationSeconds: 0.4, pitchMidi: 33, amplitude: 0.8 },
      { startTimeSeconds: 1.0, durationSeconds: 0.2, pitchMidi: 40, amplitude: 0.7 },
    ], 2, "bass.wav", "abc123");

    expect(chart.parts.find((part) => part.type === "bass")!.notes.map((note) => note.pitch)).toEqual([28, 33, 40]);
    expect(chart.parts.filter((part) => part.type !== "bass").every((part) => part.notes.length === 0)).toBe(true);
    expect(isReviewableBassDraft(chart)).toBe(true);
  });

  it("filters out-of-range harmonics and low-confidence events", () => {
    const { chart } = makeBassDraft([
      { startTimeSeconds: 0.1, durationSeconds: 0.2, pitchMidi: 20, amplitude: 0.9 },
      { startTimeSeconds: 0.3, durationSeconds: 0.2, pitchMidi: 35, amplitude: 0.2 },
      { startTimeSeconds: 0.5, durationSeconds: 0.2, pitchMidi: 45, amplitude: 0.9 },
    ], 2, "bass.wav", "abc123");

    expect(chart.parts.find((part) => part.type === "bass")!.notes.map((note) => note.pitch)).toEqual([45]);
  });
});
