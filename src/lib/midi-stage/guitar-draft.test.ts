import { describe, expect, it } from "./test-compat.ts";
import { makeGuitarDraft, isReviewableGuitarDraft } from "./guitar-draft.ts";

const fp = "abc123";

describe("guitar audio draft", () => {
  it("maps detected pitches into a valid six-string version-4 chart", () => {
    const { chart } = makeGuitarDraft([
      { startTimeSeconds: 0.1, durationSeconds: 0.4, pitchMidi: 40, amplitude: 0.9 },
      { startTimeSeconds: 0.7, durationSeconds: 0.3, pitchMidi: 45, amplitude: 0.8 },
      { startTimeSeconds: 1.1, durationSeconds: 0.25, pitchMidi: 52, amplitude: 0.8 },
    ], 3, "guitar.wav", fp);

    expect(chart.version).toBe(4);
    expect(chart.guitarMode).toBe("strings");
    expect(chart.guitarTuning).toEqual([40, 45, 50, 55, 59, 64]);
    expect(chart.parts.find((part) => part.type === "guitar")!.notes).toHaveLength(3);
    expect(isReviewableGuitarDraft(chart)).toBe(true);
  });

  it("assigns simultaneous pitches to distinct strings when playable", () => {
    const { chart } = makeGuitarDraft([
      { startTimeSeconds: 0.2, durationSeconds: 0.5, pitchMidi: 52, amplitude: 0.9 },
      { startTimeSeconds: 0.2, durationSeconds: 0.5, pitchMidi: 55, amplitude: 0.9 },
      { startTimeSeconds: 0.2, durationSeconds: 0.5, pitchMidi: 59, amplitude: 0.9 },
    ], 2, "chord.wav", fp);

    const notes = chart.parts.find((part) => part.type === "guitar")!.notes;
    expect(new Set(notes.map((note) => note.guitarPosition!.string)).size).toBe(notes.length);
  });

  it("drops notes that cannot fit without overlapping one physical string", () => {
    const { chart, warnings } = makeGuitarDraft([
      { startTimeSeconds: 0.1, durationSeconds: 1.5, pitchMidi: 40, amplitude: 0.9 },
      { startTimeSeconds: 0.4, durationSeconds: 0.4, pitchMidi: 40, amplitude: 0.9 },
    ], 3, "overlap.wav", fp);

    expect(chart.parts.find((part) => part.type === "guitar")!.notes).toHaveLength(1);
    expect(warnings.some((warning) => warning.includes("omitted"))).toBe(true);
  });

  it("rejects audio with no notes playable on a standard guitar", () => {
    expect(() => makeGuitarDraft([
      { startTimeSeconds: 0.1, durationSeconds: 0.2, pitchMidi: 20, amplitude: 0.9 },
    ], 2, "bad.wav", fp)).toThrow("No playable guitar notes were found");
  });
});
