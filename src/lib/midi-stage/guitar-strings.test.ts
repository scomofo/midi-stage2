import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultPlayers, Judge, laneForPitch, lanesFor, makeChart } from "./engine.ts";
import { practiceSong } from "./practice.ts";
import type { GuitarPosition, JudgeResult, Note, Song } from "./types.ts";

const tuning = [40, 45, 50, 55, 59, 64] as const;
const guitar = defaultPlayers().find((player) => player.type === "guitar")!;
const note = (time: number, string: GuitarPosition["string"], fret = 0, duration = 0.1): Note => ({
  time, duration, pitch: tuning[6 - string]! + fret, velocity: 90, guitarPosition: { string, fret },
});

function song(notes: Note[], overrides: Partial<Song> = {}): Song {
  return {
    id: "strings-fixture", name: "Six strings", subtitle: "Authored fingering", tag: "GUITAR",
    bpm: 120, duration: 10, original: true, art: "voltage", guitarMode: "strings",
    parts: [{ id: "guitar", name: "Guitar", type: "guitar", channel: 1, notes }],
    beats: [], sections: [{ time: 0, name: "Intro" }, { time: 4, name: "Riff" }],
    ...overrides,
  };
}

function setup(notes: Note[]) {
  const events: JudgeResult[] = [];
  const judge = new Judge(makeChart(song(notes), guitar), {
    difficulty: "standard", speed: 1, drums: false, onJudge: (event) => events.push(event),
  });
  return { judge, events };
}

describe("authored string and fret charts", () => {
  it("keeps six fixed strings low to high and preserves fret positions in practice", () => {
    const full = song([note(1, 6, 3), note(5, 1, 7)]);
    const before = structuredClone(full);
    const sliced = practiceSong(full, { id: "section:4", name: "Riff", start: 4, end: 8 });
    const lanes = lanesFor(full, guitar);
    assert.deepEqual(lanes.map((lane) => lane.guitarString), [6, 5, 4, 3, 2, 1]);
    assert.deepEqual(lanes.map((lane) => lane.pitch), tuning);
    assert.deepEqual(lanes.map((lane) => lane.name), [
      "String 6 · E2", "String 5 · A2", "String 4 · D3", "String 3 · G3", "String 2 · B3", "String 1 · E4",
    ]);
    assert.deepEqual(lanesFor(sliced, guitar), lanes);
    assert.deepEqual(makeChart(sliced, guitar).notes.map(({ time, lane, pitch, guitarPosition }) =>
      ({ time, lane, pitch, guitarPosition })), [{ time: 1, lane: 5, pitch: 71, guitarPosition: { string: 1, fret: 7 } }]);
    assert.deepEqual(makeChart(song([]), guitar).lanes, lanes);
    assert.equal(laneForPitch(64, guitar, lanes), -1, "open-string pitch classes cannot identify a physical string");
    assert.deepEqual(full, before);
  });

  it("uses explicit alternate tuning and includes open strings and the 24th fret", () => {
    const dropD = [38, 45, 50, 55, 59, 64];
    const notes = [note(1, 6, 0), note(2, 6, 24)].map((target) => ({ ...target, pitch: target.pitch - 2 }));
    const chart = makeChart(song(notes, { guitarTuning: dropD }), guitar);
    assert.equal(chart.lanes[0]!.pitch, 38);
    assert.equal(chart.lanes[0]!.name, "String 6 · D2");
    assert.deepEqual(chart.notes.map((target) => [target.lane, target.pitch, target.guitarPosition?.fret]), [[0, 38, 0], [0, 62, 24]]);
  });

  it("rejects missing or invalid positions and pitch mismatches without inferring a string", () => {
    const base = note(1, 6, 3);
    for (const guitarPosition of [undefined, { string: 0, fret: 3 }, { string: 7, fret: 3 },
      { string: 5.5, fret: 3 }, { string: 6, fret: -1 }, { string: 6, fret: 25 },
      { string: 6, fret: 1.5 }, { string: 6, fret: NaN }]) {
      assert.throws(() => makeChart(song([{ ...base, guitarPosition } as Note]), guitar), RangeError);
    }
    for (const pitch of [base.pitch + 12, base.pitch + 1, -1, 128, NaN]) {
      assert.throws(() => makeChart(song([{ ...base, pitch }]), guitar), RangeError);
    }
    for (const guitarTuning of [[], [40, 45, 50, 55, 59], [40, 45, 50, 55, 59, 128],
      [40, 45, 50, 55, 59, 64.5], [40, 45, 50, 55, 59, NaN], new Array<number>(6)]) {
      assert.throws(() => makeChart(song([base], { guitarTuning }), guitar), RangeError);
    }
  });

  it("rejects simultaneous different frets on one string but retains equal pitches on separate strings", () => {
    assert.throws(() => makeChart(song([note(1, 6, 0), note(1, 6, 12)]), guitar), /two frets on the same string/);
    const chart = makeChart(song([note(1, 6, 5), note(1, 5, 0)]), guitar);
    assert.deepEqual(chart.notes.map((target) => [target.lane, target.pitch]), [[0, 45], [1, 45]]);
    for (const target of chart.notes) {
      assert.equal(target.chord, true);
      assert.deepEqual(target.lanes, [0, 1]);
    }
    const duplicate = makeChart(song([note(1, 6, 5, 0.4), note(1, 6, 5, 1)]), guitar);
    assert.equal(duplicate.notes.length, 1);
    assert.equal(duplicate.notes[0]!.duration, 1);
  });

  it("retains arcade and ordinary pitch matching when notes also carry physical-position metadata", () => {
    const notes: Note[] = [{ ...note(1, 6, 0), arcadeFret: 0 }, { ...note(1, 4, 2), arcadeFret: 4 }];
    const arcade = new Judge(makeChart(song(notes, { guitarMode: "fret-strum" }), guitar), {
      difficulty: "standard", speed: 1, drums: false, onJudge: () => {},
    });
    assert.equal(arcade.strum(1, [0, 4]).length, 2);
    assert.equal(arcade.stats.score, 200);
    const keys = defaultPlayers().find((player) => player.type === "keys")!;
    const ordinary = new Judge(makeChart(song([note(1, 6, 0)]), keys), {
      difficulty: "standard", speed: 1, drums: false, onJudge: () => {},
    });
    assert.ok(ordinary.hit(1, 0, "key"), "physical metadata alone does not activate strict matching");
    assert.equal(ordinary.stats.perfect, 1);
  });
});

describe("exact-pitch guitar judging", () => {
  it("requires the exact authored pitch even when the correct string lane was provided", () => {
    for (const inputPitch of [undefined, 40, 42, 55]) {
      const { judge, events } = setup([note(1, 6, 3)]);
      assert.equal(judge.hit(1, 0, "input", inputPitch), null);
      assert.equal(judge.stats.score, 0);
      assert.equal(judge.notes[0]!.state, 0);
      assert.deepEqual(events.map((event) => event.grade), ["extra"]);
    }
    const { judge } = setup([note(1, 6, 3)]);
    assert.equal(judge.hit(1, 0, "input", 43)?.guitarPosition?.fret, 3);
    assert.equal(judge.stats.perfect, 1);
  });

  it("does not treat another string's octave as a forgiven chord voicing", () => {
    const { judge, events } = setup([note(1, 6, 12), note(1, 1, 0)]);
    assert.ok(judge.hit(1, 0, "low", 52));
    assert.equal(judge.hit(1.01, 0, "wrong-string", 64), null);
    assert.equal(judge.stats.extra, 1);
    assert.equal(judge.stats.perfect, 1);
    assert.equal(judge.hitPitch(1.02, 64, "high")?.lane, 5);
    assert.deepEqual(events.map((event) => event.grade), ["perfect", "extra", "perfect"]);
  });

  it("finds the closest unresolved exact-pitch target without matching a closer wrong fret", () => {
    const { judge } = setup([note(1, 6, 0), note(1.1, 6, 2), note(1.12, 5, 0)]);
    assert.equal(judge.hitPitch(1.01, 42, "fret-2")?.time, 1.1);
    assert.equal(judge.notes[0]!.state, 0);
    assert.equal(judge.notes[2]!.state, 0);
    assert.equal(judge.stats.great, 1);
    assert.equal(judge.hitPitch(1.11, 45, "a-string")?.lane, 1);
  });

  it("consumes one equal-pitch string target per input, then rejects duplicate and wrong-octave hits", () => {
    const { judge, events } = setup([note(1, 6, 5), note(1, 5, 0)]);
    assert.equal(judge.hitPitch(1, 45, "first")?.lane, 0);
    assert.deepEqual(judge.notes.map((target) => target.state), [1, 0]);
    assert.equal(judge.stats.perfect, 1, "one MIDI pitch event cannot claim two strings");
    assert.equal(judge.hitPitch(1.01, 45, "second")?.lane, 1);
    assert.equal(judge.hitPitch(1.02, 45, "duplicate"), null);
    assert.equal(judge.hitPitch(1.02, 57, "wrong-octave"), null);
    assert.equal(judge.stats.score, 200);
    assert.deepEqual(events.map((event) => event.grade), ["perfect", "perfect", "extra", "extra"]);
  });

  it("does not route an unmatched pitch into a guessed lane or change any target", () => {
    const { judge, events } = setup([note(1, 6, 3), note(1, 2, 1)]);
    assert.equal(judge.hitPitch(1, 70, "unmatched"), null);
    assert.deepEqual(events, [{ grade: "extra", delta: 0 }]);
    assert.ok(judge.notes.every((target) => target.state === 0));
    assert.equal(judge.stats.score, 0);
  });

  it("keeps scaled timing limits and normal expiry for pitch input", () => {
    for (const speed of [0.5, 0.75, 1, 1.25]) {
      const make = () => new Judge(makeChart(song([note(1, 6, 3)]), guitar), {
        difficulty: "expert", speed, drums: false, onJudge: () => {},
      });
      for (const sign of [-1, 1]) {
        const edge = make();
        assert.equal(edge.hitPitch(1 + sign * 0.09 * speed, 43)?.grade, "good");
        const outside = make();
        assert.equal(outside.hitPitch(1 + sign * (0.09 * speed + 1e-6), 43), null);
        assert.equal(outside.stats.extra, 1);
        assert.equal(outside.stats.miss, sign > 0 ? 1 : 0);
      }
    }
  });

  it("preserves independent pitch-input sustain tokens and release grading", () => {
    const { judge } = setup([note(1, 6, 5, 2), note(1, 5, 0, 2)]);
    judge.hitPitch(1, 45, "first-string");
    judge.hitPitch(1.01, 45, "second-string");
    judge.release("first-string", 1.2);
    assert.deepEqual(judge.notes.map((target) => target.hold), ["broken", "held"]);
    judge.release("second-string", 3);
    assert.deepEqual(judge.notes.map((target) => target.hold), ["broken", "complete"]);
    assert.equal(judge.stats.holdBreaks, 1);
    assert.equal(judge.stats.holds, 1);
    assert.equal(judge.stats.score, 250);
  });

  it("keeps demo accurate for authored positions and completes their sustains", () => {
    const { judge } = setup([note(1, 6, 3, 1), note(1, 2, 1, 1), note(3, 1, 5, 1)]);
    judge.advanceDemo(5, "guitar");
    assert.equal(judge.stats.perfect, 3);
    assert.equal(judge.stats.extra, 0);
    assert.equal(judge.stats.holds, 3);
    assert.equal(judge.stats.score, 450);
  });

  it("refuses lane-only arcade strums on physical string targets without partial scoring", () => {
    const { judge, events } = setup([note(1, 6, 3), note(1, 2, 1)]);
    assert.deepEqual(judge.strum(1, [0, 4]), []);
    assert.deepEqual(events.map((event) => event.grade), ["extra"]);
    assert.equal(judge.stats.score, 0);
    assert.ok(judge.notes.every((target) => target.state === 0));
  });
});
