import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Judge } from "./engine.ts";
import { getFretboardWindow, getGuitarPreview } from "./guitar-preview.ts";
import type { Chart, ChartNote, GuitarPosition } from "./types.ts";

function note(time: number, string: GuitarPosition["string"], fret = 0): ChartNote {
  return {
    id: time * 100 + string, time, duration: 1, pitch: [64, 59, 55, 50, 45, 40][string - 1]! + fret,
    velocity: 90, lane: 6 - string, state: 0, hold: null, name: "E5", guitarPosition: { string, fret },
  };
}

describe("guitar shape preview", () => {
  it("keeps a complete authored chord through successive real MIDI chord hits", () => {
    const chart: Chart = {
      notes: [note(1, 6, 0), note(1, 5, 2), note(2, 6, 3)],
      lanes: [40, 45, 50, 55, 59, 64].map((pitch, lane) => ({
        name: `String ${6 - lane}`, short: String(6 - lane), pitch, pc: pitch % 12, color: "#8fd4c4", guitarString: 6 - lane as GuitarPosition["string"],
      })),
    };
    const judge = new Judge(chart, { difficulty: "standard", speed: 1, drums: false, onJudge: () => {} });
    const original = getGuitarPreview(judge.notes, 1, judge.windows[2]!).current;
    assert.equal(judge.hitPitch(1, 40, "low-e")?.lane, 0);
    assert.deepEqual(getGuitarPreview(judge.notes, 1.02, judge.windows[2]!).current, original,
      "the first chord tone must not change the displayed fingering mid-strum");
    assert.equal(judge.hitPitch(1.02, 47, "a-string")?.lane, 1);
    const next = getGuitarPreview(judge.notes, 1.02, judge.windows[2]!);
    assert.equal(next.current?.time, 2);
    assert.equal(next.following, null);
    assert.deepEqual(judge.notes.slice(0, 2).map((target) => target.hold), ["held", "held"],
      "held tails do not block the preview of the next attack");
  });

  it("previews the following unresolved distinct group and skips hit or missed groups", () => {
    const notes = [note(1, 6), note(1, 5, 2), note(2, 6), note(3, 4, 2), note(4, 5)];
    notes[0]!.state = 1;
    notes[2]!.state = 2;
    notes[4]!.state = 1;
    const before = structuredClone(notes);
    const preview = getGuitarPreview(notes, 1, 0.15);
    assert.deepEqual(preview.current?.targets, [{ string: 6, fret: 0 }, { string: 5, fret: 2 }]);
    assert.deepEqual(preview.current?.lanes, [0, 1]);
    assert.equal(preview.following?.time, 3);
    assert.deepEqual(preview.following?.targets, [{ string: 4, fret: 2 }]);
    assert.deepEqual(notes, before, "preview must not mutate judging or hold state");
  });

  it("matches the inclusive late edge, including the judge's floating-point tolerance", () => {
    const notes = [note(1, 6), note(2, 5)];
    assert.equal(getGuitarPreview(notes, 1.15, 0.15).current?.time, 1);
    assert.equal(getGuitarPreview(notes, 1.15 + 5e-9, 0.15).current?.time, 1);
    assert.equal(getGuitarPreview(notes, 1.15 + 2e-8, 0.15).current?.time, 2);
    assert.deepEqual(getGuitarPreview(notes, 2.2, 0.15), { current: null, following: null });
  });

  it("keeps count-in and paused previews stable and supports arcade groups without physical metadata", () => {
    const notes = [note(0, 6), { ...note(1, 5), guitarPosition: undefined }];
    const countIn = getGuitarPreview(notes, -2, 0.15);
    assert.equal(countIn.current?.time, 0);
    assert.deepEqual(countIn.following?.lanes, [1]);
    assert.deepEqual(countIn.following?.targets, []);
    for (let frame = 0; frame < 5; frame++) assert.deepEqual(getGuitarPreview(notes, -2, 0.15), countIn);
    assert.deepEqual(getGuitarPreview([], 0, 0.15), { current: null, following: null });
    assert.deepEqual(getGuitarPreview(notes, NaN, 0.15), { current: null, following: null });
  });

  it("seeks near the end of a long chart without rescanning its elapsed history", () => {
    const notes = Array.from({ length: 10_000 }, (_, index) => note(index, 6, index % 24));
    let reads = 0;
    const observed = new Proxy(notes, { get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) reads++;
      return Reflect.get(target, key, receiver);
    } });
    const preview = getGuitarPreview(observed, 9_998, 0.15);
    assert.equal(preview.current?.time, 9_998);
    assert.equal(preview.following?.time, 9_999);
    assert.ok(reads < 50, `binary lookup and two local groups should need few reads, got ${reads}`);
  });
});

describe("numbered guitar fretboard window", () => {
  it("keeps open strings in their own marker column rather than inventing a fretted target", () => {
    assert.deepEqual(getFretboardWindow([]), { frets: [1, 2, 3, 4, 5], gaps: [] });
    assert.deepEqual(getFretboardWindow([{ string: 6, fret: 0 }]), { frets: [1, 2, 3, 4, 5], gaps: [] });
    const mixed = getFretboardWindow([{ string: 6, fret: 0 }, { string: 5, fret: 12 }]);
    assert.deepEqual(mixed, { frets: [12, 13, 14, 15, 16], gaps: [] });
  });

  it("shows high authored frets without crossing the supported 24th fret", () => {
    assert.deepEqual(getFretboardWindow([{ string: 1, fret: 24 }]), { frets: [20, 21, 22, 23, 24], gaps: [] });
    assert.deepEqual(getFretboardWindow([{ string: 1, fret: 17 }, { string: 6, fret: 24 }]),
      { frets: [17, 18, 19, 20, 21, 22, 23, 24], gaps: [] });
  });

  it("retains every fret in a wide six-string shape and explicitly records collapsed gaps", () => {
    const targets = [1, 5, 9, 13, 17, 24].map((fret, index) => ({ string: index + 1 as GuitarPosition["string"], fret }));
    const before = structuredClone(targets);
    const window = getFretboardWindow(targets);
    assert.equal(window.frets.length, 8);
    for (const target of targets) assert.ok(window.frets.includes(target.fret), `fret ${target.fret} must remain visible`);
    assert.ok(window.gaps.length > 0);
    for (const gap of window.gaps) {
      assert.ok(gap.from <= gap.to && gap.to === gap.before - 1);
      assert.ok(!targets.some((target) => target.fret >= gap.from && target.fret <= gap.to), "no played fret may be collapsed");
    }
    assert.deepEqual(targets, before);
  });
});
