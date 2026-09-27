import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultPlayers, Judge, LANE_COLORS, lanesFor, makeChart, WINDOWS } from "./engine.ts";
import { practiceSong } from "./practice.ts";
import type { ArcadeFret, Difficulty, JudgeResult, Note, Song } from "./types.ts";

const guitar = defaultPlayers().find((player) => player.type === "guitar")!;
const note = (time: number, arcadeFret: ArcadeFret, duration = 0.1, pitch = 52): Note => ({
  time, arcadeFret, duration, pitch, velocity: 90,
});

function song(notes: Note[]): Song {
  return {
    id: "fret-strum-fixture", name: "Fret / strum", subtitle: "Authored arcade chart", tag: "GUITAR",
    bpm: 120, duration: 10, original: true, art: "voltage", guitarMode: "fret-strum",
    parts: [{ id: "guitar", name: "Guitar", type: "guitar", channel: 1, notes }],
    beats: [], sections: [{ time: 0, name: "Intro" }, { time: 4, name: "Riff" }],
  };
}

function setup(notes: Note[], difficulty: Difficulty = "standard", speed = 1) {
  const events: JudgeResult[] = [];
  const judge = new Judge(makeChart(song(notes), guitar), {
    difficulty, speed, drums: false, onJudge: (event) => events.push(event),
  });
  return { judge, events };
}

describe("authored five-button guitar charts", () => {
  it("keeps five fixed lanes and original button indices in cropped practice passages", () => {
    const full = song([note(1, 0), note(5, 4)]);
    const before = structuredClone(full);
    const sliced = practiceSong(full, { id: "section:4", name: "Riff", start: 4, end: 8 });
    const expected = [52, 55, 57, 59, 62].map((pitch, index) => ({
      name: `Fret ${index + 1}`, short: String(index + 1), pitch, pc: pitch % 12, color: LANE_COLORS[index],
    }));
    assert.deepEqual(lanesFor(full, guitar), expected);
    assert.deepEqual(lanesFor(sliced, guitar), expected);
    assert.deepEqual(makeChart(sliced, guitar).notes.map(({ time, lane }) => [time, lane]), [[1, 4]]);
    assert.deepEqual(makeChart(full, guitar, 4, 8).notes.map(({ time, lane }) => [time, lane]), [[5, 4]]);
    assert.equal(sliced.guitarMode, "fret-strum");
    assert.deepEqual(full, before);
  });

  it("uses explicit fret metadata and connects unnamed simultaneous targets without collapsing pitches", () => {
    const full = song([
      note(1, 4, 1, 64), note(1, 0, 1, 52), note(1.0001, 1, 0.1, 53),
      { time: 2, duration: 0.1, pitch: 55, velocity: 90 },
    ]);
    const chart = makeChart(full, guitar);
    assert.deepEqual(chart.notes.map(({ time, lane }) => [time, lane]), [[1, 0], [1, 4], [1.0001, 1]]);
    for (const target of chart.notes.slice(0, 2)) {
      assert.equal(target.chord, true);
      assert.equal(target.name, undefined);
      assert.deepEqual(target.lanes, [0, 4]);
      assert.deepEqual(target.pitches, [52, 64]);
    }
    assert.equal(chart.notes[2]!.chord, undefined, "nearby attacks are not folded into an authored chord");
    assert.deepEqual(makeChart(song([]), guitar).lanes, lanesFor(full, guitar));
  });

  it("does not change normal pitch guitar or other instrument chart behavior", () => {
    const full = song([note(1, 0, 1, 52), note(1, 4, 2, 64)]);
    const ordinary = makeChart({ ...full, guitarMode: undefined }, guitar);
    assert.equal(ordinary.lanes.length, 1);
    assert.equal(ordinary.lanes[0]!.short, "E");
    assert.equal(ordinary.notes.length, 1);
    assert.equal(ordinary.notes[0]!.duration, 2);
    const keys = defaultPlayers().find((player) => player.type === "keys")!;
    assert.deepEqual(makeChart(full, keys), makeChart({ ...full, guitarMode: undefined }, keys));
  });
});

describe("atomic guitar strums", () => {
  it("scores every gem once for an exact held-fret set, irrespective of held order", () => {
    const { judge, events } = setup([note(1, 0), note(1, 2), note(1, 4)]);
    const hit = judge.strum(1, [4, 0, 2]);
    assert.deepEqual(hit.map((target) => target.lane), [0, 2, 4]);
    assert.equal(judge.stats.score, 300);
    assert.equal(judge.stats.perfect, 3);
    assert.equal(judge.stats.combo, 3);
    assert.deepEqual(events.map((event) => event.grade), ["perfect", "perfect", "perfect"]);
    assert.ok(judge.notes.every((target) => target.state === 1));
  });

  it("rejects missing, extra, wrong, empty, duplicate and invalid frets with one extra and no partial hits", () => {
    for (const frets of [[0], [0, 2, 4], [0, 1], [], [0, 2, 2], [-1, 2], [0, 5], [0, 2.5], [0, NaN]]) {
      const { judge, events } = setup([note(1, 0), note(1, 2)]);
      judge.stats.combo = 4;
      assert.deepEqual(judge.strum(1, frets), []);
      assert.equal(judge.stats.score, 0);
      assert.equal(judge.stats.combo, 0);
      assert.equal(judge.stats.extra, 1);
      assert.equal(judge.stats.perfect, 0);
      assert.deepEqual(events.map((event) => event.grade), ["extra"]);
      assert.ok(judge.notes.every((target) => target.state === 0));
      assert.equal(judge.strum(1.01, [0, 2]).length, 2, "a failed attack leaves the complete target available");
    }
  });

  it("selects the nearest onset before comparing frets and never assembles a chord across onsets", () => {
    const { judge, events } = setup([note(1, 0), note(1, 2), note(1.1, 1), note(1.1, 3)]);
    assert.deepEqual(judge.strum(1.01, [1, 3]), [], "do not fall through to a farther matching chord");
    assert.deepEqual(judge.strum(1.02, [0, 3]), [], "nearby notes cannot become a synthetic chord");
    assert.equal(judge.stats.score, 0);
    assert.equal(events.length, 2);
    assert.deepEqual(judge.strum(1.09, [1, 3]).map((target) => target.time), [1.1, 1.1]);
    assert.ok(judge.notes.slice(0, 2).every((target) => target.state === 0));
  });

  it("matches hit's earlier-onset tie break and can reach a later unresolved target on a subsequent strum", () => {
    const { judge } = setup([note(1, 0), note(1.125, 0)]);
    assert.equal(judge.strum(1.0625, [0])[0]!.time, 1);
    assert.equal(judge.strum(1.0625, [0])[0]!.time, 1.125);
    const score = judge.stats.score;
    assert.deepEqual(judge.strum(1.0625, [0]), []);
    assert.equal(judge.stats.extra, 1);
    assert.equal(judge.stats.score, score);
    assert.equal(judge.stats.perfect + judge.stats.great + judge.stats.good, 2);
  });

  it("does not shrink a partially consumed chord to its remaining frets", () => {
    const { judge, events } = setup([note(1, 0), note(1, 2)]);
    judge.hit(1, 0);
    assert.deepEqual(judge.strum(1.01, [2]), []);
    assert.deepEqual(judge.strum(1.01, [0, 2]), []);
    assert.equal(judge.stats.score, 100);
    assert.deepEqual(judge.notes.map((target) => target.state), [1, 0]);
    assert.deepEqual(events.map((event) => event.grade), ["perfect", "extra", "extra"]);
  });

  for (const difficulty of ["chill", "standard", "expert"] as const) {
    for (const speed of [0.5, 0.75, 1, 1.25]) {
      it(`preserves timing grades and both window boundaries at ${difficulty}, ${speed} speed`, () => {
        for (const [gradeIndex, grade] of ["perfect", "great", "good"].entries()) {
          for (const sign of [-1, 1]) {
            const { judge, events } = setup([note(1, 0), note(1, 4)], difficulty, speed);
            const delta = sign * WINDOWS[difficulty][gradeIndex]! * speed;
            assert.equal(judge.strum(1 + delta, [0, 4]).length, 2);
            assert.deepEqual(events.map((event) => event.grade), [grade, grade]);
            for (const event of events) assert.ok(Math.abs(event.delta - delta / speed * 1000) < 1e-8);
          }
        }
        for (const sign of [-1, 1]) {
          const { judge, events } = setup([note(1, 0), note(1, 4)], difficulty, speed);
          assert.deepEqual(judge.strum(1 + sign * (WINDOWS[difficulty][2] * speed + 1e-6), [0, 4]), []);
          assert.equal(judge.stats.score, 0);
          assert.equal(judge.stats.extra, 1);
          assert.equal(events.filter((event) => event.grade === "extra").length, 1);
          assert.equal(judge.stats.miss, sign > 0 ? 2 : 0, "normal expiry still runs before a late strum");
        }
      });
    }
  }

  it("ties sustains to stable per-fret tokens so releasing one fret only breaks its own hold", () => {
    const { judge, events } = setup([note(1, 0, 2), note(1, 4, 2)]);
    judge.strum(1, [0, 4], (lane) => `key:guitar:${lane}`);
    assert.equal(judge.activeHolds.size, 2);
    judge.release("strum-button", 1.1);
    assert.equal(judge.activeHolds.size, 2, "releasing the attack input cannot release the frets");
    judge.release("key:guitar:0", 1.2);
    assert.deepEqual(judge.notes.map((target) => target.hold), ["broken", "held"]);
    judge.release("key:guitar:4", 3);
    assert.deepEqual(judge.notes.map((target) => target.hold), ["broken", "complete"]);
    assert.equal(judge.stats.holdBreaks, 1);
    assert.equal(judge.stats.holds, 1);
    assert.equal(judge.stats.score, 250);
    assert.deepEqual(events.map((event) => event.grade), ["perfect", "perfect", "release"]);
  });

  it("reuses default lane tokens across repeated attacks and preserves successful hold completion", () => {
    const { judge } = setup([note(1, 2, 0.5), note(2, 2, 1)]);
    judge.strum(1, [2]);
    assert.equal(judge.notes[0]!.token, "strum:2");
    judge.strum(2, [2]);
    assert.equal(judge.notes[0]!.hold, "complete");
    assert.equal(judge.notes[1]!.token, "strum:2");
    judge.release("strum:2", 3);
    assert.equal(judge.stats.holds, 2);
    assert.equal(judge.stats.holdBreaks, 0);
    assert.equal(judge.stats.score, 300);
  });
});
