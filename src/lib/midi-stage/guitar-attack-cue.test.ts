import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Judge } from "./engine.ts";
import { getGuitarAttackCue } from "./guitar-attack-cue.ts";
import { getGuitarPreview } from "./guitar-preview.ts";
import type { ChartNote, Difficulty, GuitarPosition } from "./types.ts";

function note(time: number, string: GuitarPosition["string"], fret = 0): ChartNote {
  return {
    id: time * 100 + string, time, duration: 2,
    pitch: [64, 59, 55, 50, 45, 40][string - 1]! + fret,
    velocity: 90, lane: 6 - string, state: 0, hold: null, guitarPosition: { string, fret },
  };
}

function judgeFor(notes: ChartNote[], difficulty: Difficulty = "standard", speed = 1) {
  return new Judge({
    notes,
    lanes: [40, 45, 50, 55, 59, 64].map((pitch, lane) => ({
      name: `String ${6 - lane}`, short: String(6 - lane), pitch, pc: pitch % 12,
      color: "#8fd4c4", guitarString: 6 - lane as GuitarPosition["string"],
    })),
  }, { difficulty, speed, drums: false, onJudge: () => {} });
}

describe("clock-driven guitar attack cue", () => {
  it("lets a player prepare early, then fills steadily over the final four musical beats", () => {
    assert.deepEqual(getGuitarAttackCue(3, 0, 120, 0.14), { kind: "prepare", beats: 6, progress: 0 });
    assert.deepEqual(getGuitarAttackCue(3, 1, 120, 0.14), { kind: "approach", beats: 4, progress: 0 });
    assert.deepEqual(getGuitarAttackCue(3, 2, 120, 0.14), { kind: "approach", beats: 2, progress: 0.5 });
    assert.deepEqual(getGuitarAttackCue(3, 2.5, 120, 0.14), { kind: "approach", beats: 1, progress: 0.75 });
    assert.deepEqual(getGuitarAttackCue(3, 3, 120, 0.14), { kind: "window", beats: 0, progress: 1 });
    assert.deepEqual(getGuitarAttackCue(3, 3.05, 120, 0.14), { kind: "window", beats: 0, progress: 1 });
  });

  it("uses the authored BPM and negative count-in clock without counting wall-clock seconds", () => {
    assert.deepEqual(getGuitarAttackCue(0, -4, 60, 0.14), { kind: "approach", beats: 4, progress: 0 });
    assert.deepEqual(getGuitarAttackCue(0, -2, 60, 0.14), { kind: "approach", beats: 2, progress: 0.5 });
    assert.deepEqual(getGuitarAttackCue(0, -2, 120, 0.14), { kind: "approach", beats: 4, progress: 0 });
    const cue = getGuitarAttackCue(4, 3, 120, 0.14);
    for (let frame = 0; frame < 10; frame++) assert.deepEqual(getGuitarAttackCue(4, 3, 120, 0.14), cue,
      "paused authored time must freeze the preparation cue");
  });

  it("marks no remaining attack as complete even while already scored sustains ring", () => {
    const judge = judgeFor([note(1, 6)]);
    judge.hitPitch(1, 40, "held");
    assert.equal(judge.notes[0]!.hold, "held");
    const preview = getGuitarPreview(judge.notes, 1.01, judge.windows[2]!);
    const cue = getGuitarAttackCue(preview.current?.time ?? null, 1.01, 120, judge.windows[2]!);
    assert.equal(preview.current, null);
    assert.deepEqual(cue, { kind: "complete", beats: 0, progress: 1 });
    assert.equal(judge.activeHolds.size, 1, "the cue must not end a ringing hold");
  });

  it("keeps the current attack cue during a partial chord, then prepares the following attack", () => {
    const judge = judgeFor([note(1, 6), note(1, 5, 2), note(2, 6, 3)]);
    const cue = () => {
      const preview = getGuitarPreview(judge.notes, 1.02, judge.windows[2]!);
      return getGuitarAttackCue(preview.current?.time ?? null, 1.02, 120, judge.windows[2]!);
    };
    assert.equal(cue()?.kind, "window");
    judge.hitPitch(1, 40, "first");
    const partialState = structuredClone({ notes: judge.notes, stats: judge.stats, held: judge.held });
    assert.equal(cue()?.kind, "window");
    assert.deepEqual({ notes: judge.notes, stats: judge.stats, held: judge.held }, partialState,
      "the timing cue and preview must not consume the remaining chord tone");
    judge.hitPitch(1.02, 47, "second");
    assert.equal(cue()?.kind, "approach");
    assert.equal(cue()?.beats, 1.96);
    assert.equal(judge.activeHolds.size, 2);
  });

  for (const difficulty of ["chill", "standard", "expert"] as const) {
    for (const speed of [0.5, 0.75, 1, 1.25]) {
      it(`agrees with both inclusive ${difficulty} Judge boundaries at ${speed}× speed`, () => {
        for (const direction of [-1, 1]) {
          for (const beyond of [0, 5e-9, 2e-8]) {
            const judge = judgeFor([note(1, 6)], difficulty, speed);
            const time = 1 + direction * (judge.windows[2]! + beyond);
            const accepted = beyond <= 1e-8;
            const before = structuredClone({ notes: judge.notes, stats: judge.stats });
            const cue = getGuitarAttackCue(1, time, 120, judge.windows[2]!);
            assert.equal(cue?.kind ?? null, accepted ? "window" : direction < 0 ? "approach" : null);
            assert.deepEqual({ notes: judge.notes, stats: judge.stats }, before);
            assert.equal(judge.hitPitch(time, 40) !== null, accepted);
          }
        }
        // Speed changes the acceptance edge, never the musical beat distance.
        assert.equal(getGuitarAttackCue(1, 0, 120, 0.14 * speed)?.beats, 2);
        assert.equal(getGuitarAttackCue(1, 0, 120, 0.14 * speed)?.progress, 0.5);
      });
    }
  }

  it("handles a zero-width window and expires a stale target after its late edge", () => {
    assert.equal(getGuitarAttackCue(1, 1, 120, 0)?.kind, "window");
    assert.equal(getGuitarAttackCue(1, 1 + 5e-9, 120, 0)?.kind, "window");
    assert.equal(getGuitarAttackCue(1, 1 + 2e-8, 120, 0), null);
    assert.equal(getGuitarAttackCue(1, 1.3, 120, 0.14), null);
    assert.equal(getGuitarAttackCue(null, 1.3, 120, 0.14)?.kind, "complete");
  });

  it("keeps the active window authoritative when four fast beats are shorter than it", () => {
    const judge = judgeFor([note(1, 6)], "chill", 1.25);
    const cue = getGuitarAttackCue(1, 0.8, 2000, judge.windows[2]!);
    assert.ok(cue && cue.beats > 4);
    assert.equal(cue.kind, "window");
    assert.equal(judge.hitPitch(0.8, 40)?.grade, "good");
  });

  it("rejects invalid clocks, targets, BPM and windows before presenting completion", () => {
    for (const time of [NaN, Infinity, -Infinity]) assert.equal(getGuitarAttackCue(null, time, 120, 0.14), null);
    for (const target of [NaN, Infinity, -Infinity]) assert.equal(getGuitarAttackCue(target, 0, 120, 0.14), null);
    for (const bpm of [0, -1, NaN, Infinity]) assert.equal(getGuitarAttackCue(null, 0, bpm, 0.14), null);
    for (const window of [-1, NaN, Infinity]) assert.equal(getGuitarAttackCue(null, 0, 120, window), null);
    assert.deepEqual(getGuitarAttackCue(null, -2, 120, 0.14), { kind: "complete", beats: 0, progress: 1 });
  });
});
