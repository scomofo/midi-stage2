import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { approachingPitches, defaultPlayers, expectedPitches, Judge, laneForPitch, makeChart } from "./engine.ts";
import { makeOpenStage } from "./songs.ts";
import type { Instrument, Note, Player, Song } from "./types.ts";

const player = (type: Instrument): Player => defaultPlayers().find((p) => p.type === type)!;

function fixture(notes: Note[], type: Instrument = "keys"): Song {
  const song = makeOpenStage();
  return { ...song, parts: [{ id: type, name: type, type, channel: 1, notes }] };
}

function note(time: number, pitch: number, duration = 1, velocity = 80): Note {
  return { time, pitch, duration, velocity };
}

describe("rhythm-only charts", () => {
  for (const type of ["drums", "keys", "guitar", "bass"] as const) {
    it(`accepts any MIDI note on the ${type} rhythm lane without requiring a hold`, () => {
      const song: Song = { ...fixture([note(1, 60, 2)], type), matching: "rhythm" };
      const chart = makeChart(song, player(type));
      assert.equal(chart.lanes.length, 1);
      assert.equal(chart.lanes[0]!.short, "HIT");
      assert.equal(chart.lanes[0]!.any, true);
      for (let pitch = 0; pitch <= 127; pitch++) {
        const lane = laneForPitch(pitch, player(type), chart.lanes);
        assert.equal(lane, 0);
        const judge = new Judge(chart, { difficulty: "expert", speed: 0.5, drums: type === "drums", onJudge: () => {} });
        judge.hit(1, lane, `midi:${pitch}`, pitch);
        judge.release(`midi:${pitch}`, 1.001);
        const result = judge.finish(4);
        assert.equal(result.perfect, 1);
        assert.equal(result.miss, 0);
        assert.equal(result.holds, 0);
        assert.equal(result.holdBreaks, 0);
      }
    });
  }

  it("grades simultaneous source pitches once while retaining separate later onsets", () => {
    const song: Song = { ...fixture([note(1, 60), note(1, 64, 2, 100), note(2, 67)]), matching: "rhythm" };
    const original = structuredClone(song);
    const chart = makeChart(song, player("keys"));
    assert.deepEqual(chart.notes.map((n) => [n.time, n.duration, n.lane]), [[1, 0.06, 0], [2, 0.06, 0]]);
    assert.equal(chart.notes[0]!.velocity, 100);
    assert.equal(chart.notes[0]!.chord, undefined);
    const judge = new Judge(chart, { difficulty: "standard", speed: 1, drums: false, onJudge: () => {} });
    judge.hit(1, 0, "first", 42);
    judge.hit(2, 0, "second", 83);
    const result = judge.finish(4);
    assert.equal(result.perfect, 2);
    assert.equal(result.score, 200);
    assert.equal(result.miss, 0);
    assert.deepEqual(song, original);
  });

  it("does not invent a pitch target or playable lane for an empty rhythm part", () => {
    const song: Song = { ...fixture([]), matching: "rhythm" };
    assert.deepEqual(makeChart(song, player("keys")), { lanes: [], notes: [] });
    const populated = { ...fixture([note(1, 60)]), matching: "rhythm" as const };
    assert.deepEqual(expectedPitches(populated, 1, player("keys")), []);
    assert.deepEqual(approachingPitches(populated, 0.8, player("keys")), []);
  });

  it("keeps tap timing within a cropped section", () => {
    const song: Song = { ...fixture([note(0, 60), note(1, 64), note(2, 67)]), matching: "rhythm" };
    const chart = makeChart(song, player("keys"), 1, 1.03);
    assert.equal(chart.notes.length, 1);
    assert.equal(chart.notes[0]!.time, 1);
    assert.ok(Math.abs(chart.notes[0]!.duration - 0.03) < 1e-8);
  });
});

describe("playable melodic charts", () => {
  it("scores every visible lane of the expert opening chord without hidden octave misses", () => {
    const chart = makeChart(makeOpenStage("expert"), player("keys"), 0, 1);
    assert.equal(chart.notes.length, 4, "five source pitches occupy four playable lanes");
    const judge = new Judge(chart, { difficulty: "expert", speed: 1, drums: false, onJudge: () => {} });
    for (const lane of new Set(chart.notes.map((n) => n.lane))) {
      judge.hit(0, lane, `key:${lane}`);
    }
    const result = judge.finish(1);
    assert.equal(result.perfect, 4);
    assert.equal(result.miss, 0);
    assert.equal(result.accuracy, 100);
    assert.equal(result.holds, 4);
  });

  it("preserves full chord voicings and leaves the source arrangement unchanged", () => {
    const song = makeOpenStage("expert");
    const before = structuredClone(song);
    const opening = makeChart(song, player("keys"), 0, 1).notes;
    for (const n of opening) {
      assert.equal(n.name, "Cmaj7");
      assert.deepEqual(n.pitches, [48, 60, 64, 67, 71]);
      assert.equal(n.lanes?.length, 4);
    }
    assert.deepEqual(song, before);
  });

  it("accepts the full expert MIDI voicing while scoring each lane once", () => {
    const chart = makeChart(makeOpenStage("expert"), player("keys"), 0, 1);
    const judgements: string[] = [];
    const judge = new Judge(chart, {
      difficulty: "expert", speed: 1, drums: false, onJudge: (r) => judgements.push(r.grade),
    });
    for (const [index, pitch] of [48, 60, 64, 67, 71].entries()) {
      const lane = chart.lanes.findIndex((l) => l.pc === pitch % 12);
      judge.hit(index * 0.003, lane, `midi:${pitch}`, pitch);
    }
    assert.deepEqual(judgements, ["perfect", "perfect", "perfect", "perfect"]);
    assert.equal(judge.stats.extra, 0);
    assert.equal(judge.stats.combo, 4);
    assert.equal(judge.stats.score, 400);
    assert.equal(judge.accuracy, 100);
  });

  it("keeps a doubled lane's sustain with its first physical key", () => {
    const chart = makeChart(fixture([note(0, 60), note(0, 72)]), player("keys"));
    const judge = new Judge(chart, { difficulty: "standard", speed: 1, drums: false, onJudge: () => {} });
    judge.hit(0, 0, "first", 72);
    judge.hit(0.02, 0, "octave", 60);
    judge.release("octave", 0.1);
    assert.equal(judge.notes[0]!.hold, "held");
    judge.release("first", 1);
    assert.equal(judge.stats.holds, 1);
    assert.equal(judge.stats.holdBreaks, 0);
    assert.equal(judge.stats.score, 150);
  });

  it("does not forgive repeated pitches, unrelated octaves, or late doubled strikes", () => {
    for (const [firstPitch, secondPitch, secondTime] of [[60, 60, 0.01], [60, 84, 0.01], [60, 72, 0.05]]) {
      const chart = makeChart(fixture([note(0, 60), note(0, 72)]), player("keys"));
      const judge = new Judge(chart, { difficulty: "standard", speed: 1, drums: false, onJudge: () => {} });
      judge.hit(0, 0, "first", firstPitch);
      judge.hit(secondTime!, 0, "second", secondPitch);
      assert.equal(judge.stats.extra, 1);
      assert.equal(judge.stats.score, 100);
    }
  });

  it("prefers an octave double over a more distant next note but keeps closer next targets playable", () => {
    const chart = makeChart(fixture([note(0, 60), note(0, 72), note(0.04, 60)]), player("keys"));
    const judge = new Judge(chart, { difficulty: "standard", speed: 1, drums: false, onJudge: () => {} });
    judge.hit(0, 0, "first", 60);
    judge.hit(0.01, 0, "octave", 72);
    assert.equal(judge.stats.perfect, 1);
    judge.hit(0.04, 0, "next", 72);
    assert.equal(judge.stats.perfect, 2);
    assert.equal(judge.stats.extra, 0);
  });

  for (const type of ["keys", "guitar", "bass"] as const) {
    it(`keeps the longest clipped tail for simultaneous ${type} octave doubles`, () => {
      const chart = makeChart(fixture([note(0, 60, 0.5), note(0, 72, 2, 100)], type), player(type), 0, 1.5);
      assert.equal(chart.notes.length, 1);
      assert.equal(chart.notes[0]!.duration, 1.5);
      assert.equal(chart.notes[0]!.velocity, 100);
      assert.deepEqual(chart.notes[0]!.pitches, [60, 72]);
      const judge = new Judge(chart, { difficulty: "standard", speed: 1, drums: false, onJudge: () => {} });
      judge.hit(0, 0, "key");
      judge.tick(0.5);
      assert.equal(judge.notes[0]!.hold, "held", "the shorter octave must not end the hold");
      judge.release("key", 1.5);
      assert.equal(judge.stats.holds, 1);
    });
  }

  it("keeps staggered same-lane notes separate and orders the chart without sorting the source", () => {
    const input = [note(2, 60), note(0.0001, 72), note(0, 60)];
    const chart = makeChart(fixture(input), player("keys"));
    assert.deepEqual(chart.notes.map((n) => n.time), [0, 0.0001, 2]);
    assert.deepEqual(input.map((n) => n.time), [2, 0.0001, 0]);
    assert.equal(new Set(chart.notes.map((n) => n.id)).size, 3);
  });

  it("retains simultaneous percussion targets sharing a drum lane", () => {
    const chart = makeChart(fixture([note(0, 42), note(0, 46)], "drums"), player("drums"));
    assert.equal(chart.notes.length, 2);
    assert.equal(chart.notes[0]!.lane, chart.notes[1]!.lane);
    assert.deepEqual(chart.notes.map((n) => n.pitch), [42, 46]);
  });
});
