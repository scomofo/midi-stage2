import { describe, expect, it } from "./test-compat.ts";
import { validateSharedChart, CHART_SCHEMA } from "./chart-format.ts";
import { INSTRUMENTS } from "./types.ts";
import { generateDifficultySet } from "./difficulty-generator.ts";

const chart = validateSharedChart({
  schema: CHART_SCHEMA, version: 1, id: "song", title: "Song", bpm: 120, duration: 4,
  firstBeat: 0, audioOffset: 0, audioName: "", origin: "test",
  parts: INSTRUMENTS.map((type) => ({ type, notes: type === "keys" ? [
    { time: 0, duration: .2, pitch: 48, velocity: 100 },
    { time: 0, duration: .2, pitch: 52, velocity: 100 },
    { time: 0, duration: .2, pitch: 55, velocity: 100 },
    { time: 0, duration: .2, pitch: 60, velocity: 100 },
    { time: .06, duration: .2, pitch: 62, velocity: 100 },
    { time: .2, duration: .2, pitch: 64, velocity: 100 },
  ] : [] })),
});

describe("difficulty generator", () => {
  it("retains the full expert chart", () => {
    const set = generateDifficultySet(chart);
    expect(set.expert.parts.find((p) => p.type === "keys")!.notes).toHaveLength(6);
  });
  it("reduces dense chords and rapid attacks progressively", () => {
    const set = generateDifficultySet(chart);
    const standard = set.standard.parts.find((p) => p.type === "keys")!.notes.length;
    const chill = set.chill.parts.find((p) => p.type === "keys")!.notes.length;
    expect(standard).toBeLessThan(6);
    expect(chill).toBeLessThanOrEqual(standard);
  });
  it("is deterministic", () => {
    expect(generateDifficultySet(chart)).toEqual(generateDifficultySet(chart));
  });
});
