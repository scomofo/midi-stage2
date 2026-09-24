import { it } from "node:test";
import assert from "node:assert/strict";
import { concertCue } from "./concert-cues.ts";

const song = {
  bpm: 120,
  beats: [0.2, 0.7, 1.2, 1.7, 2.2].map((time, i) => ({ time, bar: i % 4 === 0 })),
  sections: [{ time: 0, name: "Intro" }, { time: 1.2, name: "Verse" }],
};

it("pulses at authored beats, respects their offset, and accents bars", () => {
  assert.equal(concertCue(song, 0.1, false).pulse, 0);
  assert.equal(concertCue(song, 0.2, false).pulse, 1);
  assert.equal(concertCue(song, 0.7, false).pulse, 0.62);
  assert.ok(concertCue(song, 0.69, false).pulse < 0.01);
  assert.equal(concertCue(song, 2.2, false).pulse, 1);
});
it("returns the same choreography after a seek or resume", () => {
  const before = concertCue(song, 1.45, false);
  concertCue(song, 50, false);
  assert.deepEqual(concertCue(song, 1.45, false), before);
  assert.equal(before.beatPosition, 2.5);
});
it("fades section colors continuously and settles after two beats", () => {
  const before = concertCue(song, 1.199999, false);
  const boundary = concertCue(song, 1.2, false);
  assert.equal(boundary.primary, before.primary);
  assert.equal(concertCue(song, 2.2, false).primary, "#8aa4c4");
  assert.notEqual(concertCue(song, 1.7, false).primary, before.primary);
});
it("quiet mode ignores music, section transitions and elapsed time", () => {
  assert.deepEqual(concertCue(song, 0.2, true), concertCue(song, 90, true, { level: 1, bass: 1 }));
  assert.equal(concertCue(song, -1, false, { level: 1, bass: 1 }).drive, 0);
});
it("audio raises bounded light energy without altering beat phase or colors", () => {
  const plain = concertCue(song, 0.3, false);
  const music = concertCue(song, 0.3, false, { level: 1, bass: 1 });
  assert.ok(music.drive > plain.drive && music.drive <= 1);
  assert.equal(music.primary, plain.primary);
  assert.equal(music.beatPosition, plain.beatPosition);
  assert.equal(concertCue(song, 0.3, false, { level: NaN, bass: -1 }).drive, plain.drive);
});
it("handles empty beat/section lists and stops pulsing beyond the grid", () => {
  const empty = concertCue({ bpm: 100, beats: [], sections: [] }, 3, false);
  assert.equal(empty.pulse, 0);
  assert.equal(empty.primary, "#8fd4c4");
  assert.equal(concertCue(song, 20, false).pulse, 0);
});
