import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Judge } from "./engine.ts";
import { getGuitarPitchFeedback } from "./guitar-pitch-feedback.ts";
import type { ChartNote, Difficulty, GuitarPosition } from "./types.ts";

function note(time: number, string: GuitarPosition["string"], fret = 0): ChartNote {
  return {
    id: time * 100 + string, time, duration: 1,
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

function input(judge: Judge, time: number, pitch: number, token = "input") {
  const matched = judge.hitPitch(time, pitch, token);
  const before = structuredClone({ notes: judge.notes, stats: judge.stats, held: judge.held });
  const feedback = getGuitarPitchFeedback(judge.notes, time, judge.windows[2]!, pitch, matched);
  assert.deepEqual({ notes: judge.notes, stats: judge.stats, held: judge.held }, before,
    "feedback must not change the actual score, targets, timing or sustain ownership");
  return feedback;
}

describe("honest real-guitar pitch feedback", () => {
  it("distinguishes a wrong octave from a different pitch, then reports a real successful retry", () => {
    const judge = judgeFor([note(1, 6)]);
    assert.deepEqual(input(judge, 1, 52), {
      kind: "octave", pitch: 52, targetPitches: [40], detail: "Octave differs · target E2",
    });
    assert.equal(judge.stats.extra, 1);
    assert.equal(judge.stats.score, 0);
    assert.equal(judge.notes[0]!.state, 0);
    assert.deepEqual(input(judge, 1, 41), {
      kind: "different", pitch: 41, targetPitches: [40], detail: "Different pitch · target E2",
    });
    assert.equal(judge.stats.extra, 2);
    assert.deepEqual(input(judge, 1, 40), {
      kind: "matched", pitch: 40, targetPitches: [40], detail: "Perfect · target matched",
    });
    assert.equal(judge.stats.perfect, 1);
    assert.equal(judge.stats.score, 100);
  });

  it("uses the matched note and its actual grade even when another attack is nearer", () => {
    const judge = judgeFor([note(1, 6), note(1.125, 6, 12)]);
    const feedback = input(judge, 1.015, 52);
    assert.equal(feedback.kind, "matched", "a valid overlapping-window match must not be called a wrong octave");
    assert.deepEqual(feedback.targetPitches, [52]);
    assert.equal(feedback.detail, "Good · target matched");
    assert.deepEqual(judge.notes.map((target) => target.state), [0, 1]);
    assert.equal(judge.stats.good, 1);
    const great = judgeFor([note(1, 6)]);
    assert.equal(input(great, 1.06, 40).detail, "Great · target matched");
  });

  it("recognizes a duplicate chord tone while leaving the other tone available", () => {
    const judge = judgeFor([note(1, 6), note(1, 5, 2)]);
    assert.equal(input(judge, 1, 40, "first-tone").kind, "matched");
    assert.deepEqual(input(judge, 1.01, 40, "duplicate"), {
      kind: "repeat", pitch: 40, targetPitches: [47], detail: "Already matched · play the remaining targets",
    });
    assert.deepEqual(judge.notes.map((target) => target.state), [1, 0]);
    assert.equal(judge.stats.extra, 1);
    const pending = input(judge, 1.01, 59, "wrong-octave-pending");
    assert.deepEqual(pending, {
      kind: "octave", pitch: 59, targetPitches: [47], detail: "Octave differs · target B2",
    });
    assert.equal(input(judge, 1.02, 47, "second-tone").kind, "matched");
    assert.equal(judge.stats.perfect, 2);
  });

  it("accepts equal pitches on two authored strings before identifying a third input as a repeat", () => {
    const judge = judgeFor([note(1, 6, 5), note(1, 5)]);
    assert.equal(input(judge, 1, 45, "string-six").kind, "matched");
    assert.equal(input(judge, 1.02, 45, "string-five").kind, "matched");
    assert.deepEqual(input(judge, 1.03, 45, "third"), {
      kind: "repeat", pitch: 45, targetPitches: [], detail: "Already matched · wait for the next target",
    });
    assert.equal(judge.stats.perfect, 2);
    assert.equal(judge.stats.extra, 1);
    assert.equal(judge.stats.score, 200);
    assert.equal(judge.held.size, 2);
  });

  it("shows unique pending pitches in chart order, and names octave-related targets precisely", () => {
    const judge = judgeFor([note(1, 6, 5), note(1, 5), note(1, 4)]);
    const different = input(judge, 1, 41);
    assert.deepEqual(different.targetPitches, [45, 50]);
    assert.equal(different.detail, "Different pitch · targets A2 · D3");
    const octaves = input(judge, 1, 57);
    assert.deepEqual(octaves.targetPitches, [45, 50]);
    assert.equal(octaves.detail, "Octave differs · target A2");
  });

  it("chooses the earlier attack for an exact distance tie and the closer attack otherwise", () => {
    const notes = [note(1, 6), note(1.125, 5)];
    assert.deepEqual(getGuitarPitchFeedback(notes, 1.0625, 0.14, 41, null).targetPitches, [40]);
    assert.deepEqual(getGuitarPitchFeedback(notes, 1.063, 0.14, 41, null).targetPitches, [45]);
  });

  it("does not describe count-in or input between active windows as a wrong pitch", () => {
    const judge = judgeFor([note(1, 6), note(3, 5)]);
    assert.equal(input(judge, -1, 52).kind, "between");
    assert.equal(input(judge, 0.5, 52).kind, "between");
    assert.equal(input(judge, 2, 45).kind, "between");
    assert.equal(judge.stats.score, 0);
    assert.equal(judge.stats.extra, 3, "the presentation must not forgive actual extra inputs");
    assert.equal(judge.notes[0]!.state, 2);
  });

  it("ignores missed groups and does not infer a repeated pitch from a settled different note", () => {
    const judge = judgeFor([note(1, 6), note(2, 5)]);
    assert.equal(input(judge, 1.5, 40).kind, "between");
    assert.equal(judge.notes[0]!.state, 2);
    assert.equal(input(judge, 2, 45).kind, "matched");
    assert.equal(input(judge, 2.01, 52).kind, "between");
    assert.equal(input(judge, 2.01, 45).kind, "repeat");
    assert.equal(input(judge, 2.5, 45).kind, "between", "a distant settled target must not produce stale repeat advice");
  });

  for (const difficulty of ["chill", "standard", "expert"] as const) {
    for (const speed of [0.5, 0.75, 1, 1.25]) {
      it(`agrees with both inclusive ${difficulty} timing edges at ${speed}× speed`, () => {
        for (const direction of [-1, 1]) {
          for (const beyond of [0, 5e-9, 2e-8]) {
            const judge = judgeFor([note(1, 6)], difficulty, speed);
            const time = 1 + direction * (judge.windows[2]! + beyond);
            assert.equal(input(judge, time, 41).kind, beyond <= 1e-8 ? "different" : "between");
            const exact = judgeFor([note(1, 6)], difficulty, speed);
            assert.equal(input(exact, time, 40).kind, beyond <= 1e-8 ? "matched" : "between");
          }
        }
      });
    }
  }

  it("bounds a long-chart lookup to the live timing window without rescanning elapsed history", () => {
    const notes = Array.from({ length: 20_000 }, (_, index) => note(index, 6));
    let reads = 0;
    const observed = new Proxy(notes, { get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) reads++;
      return Reflect.get(target, key, receiver);
    } });
    assert.deepEqual(getGuitarPitchFeedback(observed, 19_998, 0.14, 52, null), {
      kind: "octave", pitch: 52, targetPitches: [40], detail: "Octave differs · target E2",
    });
    assert.ok(reads < 40, `a binary seek plus live-window scan should need few reads, got ${reads}`);
  });
});
