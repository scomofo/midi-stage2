import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHART_SCHEMA,
  ChartFormatError,
  parseSharedChart,
  parseSharedChartText,
  serializeSharedChart,
  sharedChartToSong,
  validateSharedChart,
} from "./chart-format.ts";
import { Judge, makeChart } from "./engine.ts";
import type { Player } from "./types.ts";

function keysPlayer(): Player {
  return { id: "keys", type: "keys", label: "Keys", enabled: true, source: "keys" };
}

function drumsPlayer(): Player {
  return { id: "drums", type: "drums", label: "Drums", enabled: true, source: "drums" };
}

function minimalChart(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: CHART_SCHEMA,
    version: 1,
    id: "chart-test",
    title: "Test Chart",
    bpm: 100,
    duration: 20,
    parts: [
      { type: "drums", notes: [{ time: 0, duration: 0.12, pitch: 36, velocity: 98 }] },
      { type: "keys", notes: [{ time: 0, duration: 1.5, pitch: 64 }] },
      { type: "guitar", notes: [{ time: 0, duration: 1.65, pitch: 40 }] },
      { type: "bass", notes: [{ time: 0, duration: 1.65, pitch: 28 }] },
    ],
    ...overrides,
  };
}

function expectCode(fn: () => unknown, code: string) {
  assert.throws(
    fn,
    (err: unknown) => err instanceof ChartFormatError && (err as ChartFormatError).code === code,
    `expected ChartFormatError with code ${code}`,
  );
}

describe("shared chart format", () => {
  it("parses a minimal valid chart into a playable Song", () => {
    const song = parseSharedChart(minimalChart());
    assert.equal(song.id, "chart-test");
    assert.equal(song.name, "Test Chart");
    assert.equal(song.tag, "IMPORT");
    assert.equal(song.original, false);
    assert.equal(song.bpm, 100);
    assert.equal(song.duration, 20);
    assert.deepEqual(
      song.parts.map((p) => p.type),
      ["drums", "keys", "guitar", "bass"],
    );
    assert.deepEqual(
      song.parts.map((p) => p.channel),
      [10, 1, 2, 3],
    );
    // velocity defaults to 100 when omitted
    assert.equal(song.parts[1]!.notes[0]!.velocity, 100);
    assert.equal(song.parts[0]!.notes[0]!.velocity, 98);
    // beats generated from bpm when omitted: 60/100 = 0.6s spacing
    assert.ok(song.beats.length > 10);
    assert.equal(song.beats[0]!.time, 0);
    assert.equal(song.beats[0]!.bar, true);
    assert.ok(Math.abs(song.beats[1]!.time - 0.6) < 1e-9);
    assert.equal(song.beats[4]!.bar, true);
    // defaults
    assert.deepEqual(song.sections, [{ time: 0, name: "Test Chart" }]);
    assert.deepEqual(song.tempoMap, [{ time: 0, bpm: 100 }]);
    assert.equal(song.audioOffset, 0);
    assert.equal(song.audioName, "");
    assert.equal(song.art, "open");
  });

  it("sorts notes and drops exact duplicates", () => {
    const song = parseSharedChart(
      minimalChart({
        parts: [
          { type: "drums", notes: [] },
          {
            type: "keys",
            notes: [
              { time: 2, duration: 0.5, pitch: 67 },
              { time: 1, duration: 0.5, pitch: 64 },
              { time: 1, duration: 0.5, pitch: 64 },
            ],
          },
          { type: "guitar", notes: [] },
          { type: "bass", notes: [] },
        ],
      }),
    );
    assert.deepEqual(
      song.parts[1]!.notes.map((n) => [n.time, n.pitch]),
      [
        [1, 64],
        [2, 67],
      ],
    );
  });

  it("honours firstBeat when generating beats", () => {
    const song = parseSharedChart(minimalChart({ firstBeat: 0.5, bpm: 60 }));
    assert.equal(song.beats[0]!.time, 0.5);
    assert.ok(Math.abs(song.beats[1]!.time - 1.5) < 1e-9);
  });

  it("collapses a constant multi-entry tempo map", () => {
    const chart = validateSharedChart(
      minimalChart({ tempoMap: [{ time: 0, bpm: 100 }, { time: 10, bpm: 100 }] }),
    );
    assert.deepEqual(chart.tempoMap, [{ time: 0, bpm: 100 }]);
  });

  it("maps drum pitches to lanes through makeChart", () => {
    const song = parseSharedChart(
      minimalChart({
        parts: [
          {
            type: "drums",
            notes: [
              { time: 0, duration: 0.1, pitch: 36 },
              { time: 0.5, duration: 0.1, pitch: 38 },
              { time: 1, duration: 0.1, pitch: 42 },
            ],
          },
          { type: "keys", notes: [] },
          { type: "guitar", notes: [] },
          { type: "bass", notes: [] },
        ],
      }),
    );
    const chart = makeChart(song, drumsPlayer());
    assert.deepEqual(
      chart.notes.map((n) => n.lane),
      [0, 1, 2],
    );
  });

  it("plays long notes as holds through Judge", () => {
    const song = parseSharedChart(minimalChart());
    const chart = makeChart(song, keysPlayer());
    const judge = new Judge(chart, { difficulty: "standard", speed: 1, drums: false, onJudge: () => {} });
    const note = judge.hit(0, 0);
    assert.ok(note);
    assert.equal(note.grade, "perfect");
    assert.equal(note.hold, "held");
    judge.release("keyboard", 1.5);
    assert.equal(note.hold, "complete");
    assert.equal(judge.stats.holds, 1);
  });

  it("groups simultaneous keys notes into named chords, with harmony roman numerals", () => {
    const song = parseSharedChart(
      minimalChart({
        parts: [
          { type: "drums", notes: [] },
          {
            type: "keys",
            notes: [
              { time: 1, duration: 1.5, pitch: 60 },
              { time: 1, duration: 1.5, pitch: 64 },
              { time: 1, duration: 1.5, pitch: 67 },
            ],
          },
          { type: "guitar", notes: [] },
          { type: "bass", notes: [] },
        ],
        chordHighways: {
          keys: [{ time: 1, duration: 1.5, pitches: [60, 64, 67], name: "C", roman: "I" }],
          guitar: [],
        },
      }),
    );
    assert.deepEqual(song.harmony, [{ time: 1, duration: 1.5, name: "C", roman: "I" }]);
    const chart = makeChart(song, keysPlayer());
    assert.equal(chart.notes.length, 3);
    for (const n of chart.notes) {
      assert.equal(n.chord, true);
      assert.equal(n.name, "C");
      assert.equal(n.roman, "I");
    }
  });

  it("rejects invalid input with coded errors", () => {
    expectCode(() => parseSharedChartText("{oops"), "BAD_JSON");
    expectCode(() => parseSharedChart({ ...minimalChart(), schema: "nope" }), "BAD_SCHEMA");
    expectCode(() => parseSharedChart({ ...minimalChart(), version: 9 }), "UNSUPPORTED_VERSION");
    expectCode(
      () => parseSharedChart({ ...minimalChart(), version: 2, matching: "rhythm" }),
      "UNSUPPORTED_MATCHING",
    );
    expectCode(() => parseSharedChart({ ...minimalChart(), title: "  " }), "INVALID_STRING");
    expectCode(() => parseSharedChart({ ...minimalChart(), bpm: 500 }), "OUT_OF_RANGE");
    expectCode(() => parseSharedChart({ ...minimalChart(), duration: 0.1 }), "OUT_OF_RANGE");
    expectCode(
      () =>
        parseSharedChart(
          minimalChart({
            parts: [
              { type: "drums", notes: [{ time: 0, duration: 0.1, pitch: 21 }] },
              { type: "keys", notes: [] },
              { type: "guitar", notes: [] },
              { type: "bass", notes: [] },
            ],
          }),
        ),
      "DRUM_PITCH_UNMAPPED",
    );
    expectCode(
      () =>
        parseSharedChart(
          minimalChart({
            parts: [
              { type: "drums", notes: [] },
              { type: "keys", notes: [{ time: 25, duration: 0.5, pitch: 64 }] },
              { type: "guitar", notes: [] },
              { type: "bass", notes: [] },
            ],
          }),
        ),
      "OUT_OF_RANGE",
    );
    expectCode(
      () => parseSharedChart(minimalChart({ tempoMap: [{ time: 5, bpm: 100 }, { time: 2, bpm: 100 }] })),
      "OUT_OF_RANGE",
    );
    expectCode(
      () => parseSharedChart(minimalChart({ tempoMap: [{ time: 0, bpm: 100 }, { time: 5, bpm: 120 }] })),
      "VARIABLE_TEMPO_UNSUPPORTED",
    );
    expectCode(
      () =>
        parseSharedChart(
          minimalChart({ chordHighways: { keys: [{ time: 1, duration: 1, pitches: [60] }], guitar: [] } }),
        ),
      "OUT_OF_RANGE",
    );
    expectCode(
      () => parseSharedChart(minimalChart({ parts: [{ type: "drums", notes: [] }] })),
      "INVALID_PARTS",
    );
    expectCode(() => parseSharedChart(null), "NOT_AN_OBJECT");
  });

  it("round-trips through serialize", () => {
    const chart = validateSharedChart(
      minimalChart({
        audioOffset: 0.25,
        audioName: "take.wav",
        origin: "midi",
        tempoMap: [{ time: 0, bpm: 100 }],
        beats: [{ time: 0, bar: true }, { time: 0.6, bar: false }],
        sections: [{ time: 0, name: "Intro" }],
        chordHighways: {
          keys: [{ time: 1, duration: 1.5, pitches: [60, 64, 67], name: "C", roman: "I" }],
          guitar: [],
        },
      }),
    );
    assert.equal(chart.version, 3);
    const text = serializeSharedChart(chart);
    const reparsed = parseSharedChartText(text);
    assert.deepStrictEqual(reparsed, chart);
    // validation is idempotent on canonical form
    assert.deepStrictEqual(validateSharedChart(JSON.parse(text)), chart);
    // song conversion is stable across the round-trip
    assert.deepStrictEqual(sharedChartToSong(reparsed), sharedChartToSong(chart));
  });

  it("accepts a workshop-shaped chart end to end", () => {
    const workshop = {
      schema: "midi-stage-chart",
      version: 1,
      id: "chart-workshop-example",
      title: "Workshop Example",
      bpm: 100,
      duration: 20,
      firstBeat: 0,
      audioOffset: 0,
      audioName: "",
      origin: "practice",
      parts: [
        {
          type: "drums",
          notes: [
            { time: 0, duration: 0.072, pitch: 36, velocity: 100 },
            { time: 0.6, duration: 0.072, pitch: 38, velocity: 96 },
          ],
        },
        { type: "keys", notes: [{ time: 0, duration: 1.2, pitch: 60, velocity: 90 }] },
        { type: "guitar", notes: [] },
        { type: "bass", notes: [] },
      ],
      tempoMap: [],
      beats: [],
    };
    const song = parseSharedChart(JSON.stringify(workshop));
    const chart = makeChart(song, drumsPlayer());
    assert.equal(chart.notes.length, 2);
    assert.deepEqual(
      chart.notes.map((n) => n.lane),
      [0, 1],
    );
  });
});
