import { describe, expect, it } from "./test-compat.ts";
import { solveGuitarFingering } from "./guitar-fingering-solver.ts";
import { makeGuitarDraft } from "./guitar-draft.ts";

const tuning = [40, 45, 50, 55, 59, 64];

describe("guitar fingering solver", () => {
  it("puts simultaneous chord tones on distinct strings", () => {
    const result = solveGuitarFingering([
      { startTimeSeconds: 0, durationSeconds: 0.5, pitchMidi: 52, amplitude: 0.9 },
      { startTimeSeconds: 0, durationSeconds: 0.5, pitchMidi: 55, amplitude: 0.9 },
      { startTimeSeconds: 0, durationSeconds: 0.5, pitchMidi: 59, amplitude: 0.9 },
    ], tuning);
    expect(result.assignments).toHaveLength(3);
    expect(new Set(result.assignments.map((a) => a.string)).size).toBe(3);
  });

  it("prefers compact shapes over wide fret spreads", () => {
    const result = solveGuitarFingering([
      { startTimeSeconds: 0, durationSeconds: 0.4, pitchMidi: 52, amplitude: 0.8 },
      { startTimeSeconds: 0, durationSeconds: 0.4, pitchMidi: 59, amplitude: 0.8 },
      { startTimeSeconds: 0, durationSeconds: 0.4, pitchMidi: 64, amplitude: 0.8 },
    ], tuning);
    const frets = result.assignments.map((a) => a.fret).filter((f) => f > 0);
    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(5);
  });

  it("avoids a string that is still sustaining", () => {
    const result = solveGuitarFingering([
      { startTimeSeconds: 0, durationSeconds: 1, pitchMidi: 40, amplitude: 0.9 },
      { startTimeSeconds: 0.3, durationSeconds: 0.2, pitchMidi: 45, amplitude: 0.8 },
    ], tuning);
    expect(result.assignments[0]!.string).not.toBe(result.assignments[1]!.string);
  });

  it("reports notes that have no playable standard-tuning position", () => {
    const result = solveGuitarFingering([
      { startTimeSeconds: 0, durationSeconds: 0.2, pitchMidi: 20, amplitude: 0.8 },
    ], tuning);
    expect(result.assignments).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
  });

  it("ends an estimated release overlap at the next attack on the same string", () => {
    const events = [
      { startTimeSeconds: 0.5, durationSeconds: 0.3, pitchMidi: 40, amplitude: 0.9 },
      { startTimeSeconds: 0.79, durationSeconds: 0.2, pitchMidi: 40, amplitude: 0.9 },
    ];
    const solved = solveGuitarFingering(events, tuning);
    expect(solved.assignments).toHaveLength(2);
    expect(solved.assignments[0]!.startTimeSeconds + solved.assignments[0]!.durationSeconds).toBe(0.79);
    expect(events[0]!.durationSeconds).toBe(0.3);
    const { chart } = makeGuitarDraft(events, 2, "reattack.wav", "test");
    expect(chart.parts.find((part) => part.type === "guitar")!.notes).toHaveLength(2);
  });
});
