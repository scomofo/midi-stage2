import { it } from "node:test";
import assert from "node:assert/strict";
import { Judge } from "./engine.ts";
import { suggestedStrum, nextStrum } from "./strum-guide.ts";
import type { Chart, ChartNote, Difficulty } from "./types.ts";

const chart = { bpm: 120, beats: [0.2, 0.7, 1.2, 1.7].map((time) => ({ time, bar: false })) };

it("suggests downbeats and upbeats relative to the first beat", () => {
  assert.deepEqual(
    [0.2, 0.45, 0.7, 0.95, 1.2].map((t) => suggestedStrum(chart, t)),
    ["down", "up", "down", "up", "down"],
  );
});
it("keeps sparse rhythms and simultaneous chord notes on the same hand pattern", () => {
  assert.deepEqual(
    [0.2, 1.2, 1.2, 1.45, 2.2].map((t) => suggestedStrum(chart, t)),
    ["down", "down", "down", "up", "down"],
  );
});
it("uses authored beat spacing when it differs from the nominal BPM", () => {
  const song = { bpm: 120, beats: [0, 1, 2].map((time) => ({ time, bar: false })) };
  assert.equal(suggestedStrum(song, 0.5), "up");
  assert.equal(suggestedStrum(song, 1), "down");
});
it("handles pickups, empty beat grids, and small onset timing errors", () => {
  assert.equal(suggestedStrum(chart, -0.05), "up");
  assert.equal(suggestedStrum({ bpm: 120, beats: [] }, 0.25), "up");
  for (const t of [0.69, 0.7, 0.71]) assert.equal(suggestedStrum(chart, t), "down");
});

it("previews the next unplayed strum and skips scored chords and held notes", () => {
  const notes = [{ time: 0.2, state: 1 as const }, { time: 0.2, state: 1 as const },
    { time: 0.45, state: 0 as const }, { time: 0.7, state: 0 as const }];
  assert.equal(nextStrum(chart, notes, 0.2, 0.14), "up");
  assert.equal(nextStrum(chart, notes, 0.6, 0.14), "down");
  assert.equal(nextStrum(chart, notes, 1, 0.14), null);
  assert.equal(nextStrum(chart, [], 0, 0.14), null);
});

function note(time: number, lane = 0, duration = 0.06): ChartNote {
  return { id: time * 100 + lane, time, lane, duration, pitch: 60 + lane,
    velocity: 80, state: 0, hold: null };
}

function judgeFor(notes: ChartNote[], difficulty: Difficulty = "standard", speed = 1): Judge {
  const playable: Chart = {
    notes,
    lanes: [0, 1].map((lane) => ({
      name: `Lane ${lane}`, short: String(lane), pitch: 60 + lane, pc: lane, color: "#8fd4c4",
    })),
  };
  return new Judge(playable, { difficulty, speed, drums: false, onJudge: () => {} });
}

for (const difficulty of ["chill", "standard", "expert"] as const) {
  for (const speed of [0.5, 0.75, 1, 1.25]) {
    it(`keeps the strum through the ${difficulty} scoring boundary at ${speed}× speed`, () => {
      for (const beyondBoundary of [-1e-6, 0, 5e-9, 2e-8]) {
        const judge = judgeFor([note(0.2), note(1.45)], difficulty, speed);
        const lateWindow = judge.windows[2]!;
        const time = 0.2 + lateWindow + beyondBoundary;
        const accepted = beyondBoundary <= 1e-8;
        const direction = accepted ? "down" : "up";

        // The cue agrees with scoring both before and after the frame's tick.
        assert.equal(nextStrum(chart, judge.notes, time, lateWindow), direction);
        judge.tick(time);
        assert.equal(nextStrum(chart, judge.notes, time, lateWindow), direction);
        assert.equal(judge.notes[0]!.state, accepted ? 0 : 2);
        assert.equal(judge.hit(time, 0) !== null, accepted);
        assert.equal(nextStrum(chart, judge.notes, time, lateWindow), "up");
      }
    });
  }
}

it("advances after a hit while the previous sustain is still held", () => {
  const judge = judgeFor([note(0.2, 0, 2), note(1.45)]);
  const lateWindow = judge.windows[2]!;
  assert.equal(nextStrum(chart, judge.notes, 0.2, lateWindow), "down");
  judge.hit(0.2, 0, "held");
  assert.equal(judge.notes[0]!.hold, "held");
  assert.equal(nextStrum(chart, judge.notes, 0.2, lateWindow), "up");
});

it("keeps a partially played chord visible until its last lane is hit", () => {
  const notes = [note(0.2, 0, 2), note(0.2, 1, 2), note(1.45)];
  notes[0]!.chord = notes[1]!.chord = true;
  const judge = judgeFor(notes);
  const lateWindow = judge.windows[2]!;
  judge.hit(0.2, 0, "first");
  assert.equal(nextStrum(chart, judge.notes, 0.25, lateWindow), "down");
  judge.hit(0.25, 1, "second");
  assert.deepEqual(judge.notes.slice(0, 2).map((n) => n.hold), ["held", "held"]);
  assert.equal(nextStrum(chart, judge.notes, 0.25, lateWindow), "up");
});

it("stays fixed at paused song time and clears after the last note expires", () => {
  const judge = judgeFor([note(0.2), note(1.45)]);
  const lateWindow = judge.windows[2]!;
  const pausedTime = 0.2 + lateWindow;
  const before = structuredClone(judge.notes);
  for (let frame = 0; frame < 20; frame++) {
    assert.equal(nextStrum(chart, judge.notes, pausedTime, lateWindow), "down");
  }
  assert.deepEqual(judge.notes, before, "the cue does not consume or mutate notes");
  judge.tick(1.45 + lateWindow + 1e-6);
  assert.equal(nextStrum(chart, judge.notes, 2, lateWindow), null);
  assert.equal(judge.stats.miss, 2);
});
