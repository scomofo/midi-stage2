import { it } from "node:test";
import assert from "node:assert/strict";
import { suggestedStrum, nextStrum } from "./strum-guide.ts";

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
  assert.equal(nextStrum(chart, notes, 0.2), "up");
  assert.equal(nextStrum(chart, notes, 0.6), "down");
  assert.equal(nextStrum(chart, notes, 1), null);
  assert.equal(nextStrum(chart, [], 0), null);
});
