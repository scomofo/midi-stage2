import { it } from "node:test";
import assert from "node:assert/strict";
import { currentHarmony, defaultPlayers, Judge, makeChart } from "./engine.ts";
import { practiceSections, practiceSong, type PracticeSection } from "./practice.ts";
import { suggestedStrum } from "./strum-guide.ts";
import type { Note, Song } from "./types.ts";

function fixture(overrides: Partial<Song> = {}): Song {
  return {
    id: "practice-fixture", name: "A song", subtitle: "Original recording", tag: "IMPORT", bpm: 120,
    duration: 35, original: false, art: "open", matching: "rhythm",
    parts: [{ id: "drums", name: "Drums", type: "drums", channel: 10, notes: [] }],
    beats: Array.from({ length: 70 }, (_, index) => ({ time: index / 2 + 0.25, bar: index % 4 === 0 })),
    sections: [{ time: 0, name: "Imported song" }],
    ...overrides,
  };
}

const section = (start: number, end: number): PracticeSection => ({ id: `test:${start}`, name: "Chorus", start, end });
const note = (time: number, duration = 0.1): Note => ({ time, duration, pitch: 60, velocity: 90 });

it("sorts and deduplicates authored sections, ignores invalid markers, and keeps an unmarked intro", () => {
  const song = fixture({ sections: [
    { time: 8, name: "Chorus" }, { time: 4, name: "  Verse  " }, { time: 8, name: "Duplicate" },
    { time: -1, name: "Before song" }, { time: NaN, name: "Invalid" }, { time: 35, name: "After song" },
    { time: 10, name: " " },
  ] });
  const before = structuredClone(song);
  assert.deepEqual(practiceSections(song), [
    { id: "section:0", name: "Intro", start: 0, end: 4 },
    { id: "section:4", name: "Verse", start: 4, end: 8 },
    { id: "section:8", name: "Chorus", start: 8, end: 35 },
  ]);
  assert.deepEqual(song, before);
});

it("uses 32-beat passages for imported songs, retaining their lead-in and last partial passage", () => {
  const song = fixture();
  assert.deepEqual(practiceSections(song), [
    { id: "passage:0", name: "Passage 1", start: 0, end: 16.25 },
    { id: "passage:16.25", name: "Passage 2", start: 16.25, end: 32.25 },
    { id: "passage:32.25", name: "Passage 3", start: 32.25, end: 35 },
  ]);
  assert.deepEqual(practiceSections({ ...song, sections: [] }), practiceSections(song));
  assert.deepEqual(practiceSections({ ...song, sections: [{ time: 5, name: "Audio" }, { time: 5, name: "Duplicate" }] }), practiceSections(song));
});

it("counts the actual beat grid instead of assuming constant spacing", () => {
  const song = fixture({
    duration: 50,
    beats: Array.from({ length: 70 }, (_, index) => ({ time: index < 32 ? index / 2 : 16 + index - 32, bar: index % 4 === 0 })),
  });
  assert.deepEqual(practiceSections(song).map(({ start, end }) => [start, end]), [[0, 16], [16, 48], [48, 50]]);
});

it("falls back to tempo when no usable grid exists and keeps a short song playable", () => {
  assert.deepEqual(practiceSections(fixture({ beats: [], duration: 34 })).map(({ start, end }) => [start, end]), [[0, 16], [16, 32], [32, 34]]);
  assert.deepEqual(practiceSections(fixture({ beats: [], duration: 3 })).map(({ start, end }) => [start, end]), [[0, 3]]);
  assert.deepEqual(practiceSections(fixture({ beats: [], bpm: NaN, duration: 17 })).map(({ start, end }) => [start, end]), [[0, 16], [16, 17]]);
  for (const duration of [0, -1, NaN, Infinity]) assert.deepEqual(practiceSections(fixture({ duration })), []);
});

it("includes the first onset, excludes the ending onset and carried notes, and caps ending sustains", () => {
  const song = fixture({ matching: "pitch", parts: [
    { id: "keys", name: "Keys", type: "keys", channel: 1, notes: [note(3, 4), note(4, 1), note(7.5, 2), note(8, 1)] },
    { id: "bass", name: "Bass", type: "bass", channel: 2, notes: [note(1, 10)] },
  ] });
  const sliced = practiceSong(song, section(4, 8));
  assert.deepEqual(sliced.parts[0]!.notes, [note(0, 1), note(3.5, 0.5)]);
  assert.deepEqual(sliced.parts[1]!.notes, []);
  assert.equal(sliced.duration, 4);
  assert.deepEqual(sliced.sections, [{ time: 0, name: "Chorus" }]);

  const keys = defaultPlayers().find((player) => player.type === "keys")!;
  const judge = new Judge(makeChart(sliced, keys), { difficulty: "standard", speed: 1, drums: false, onJudge: () => {} });
  assert.equal(judge.notes.length, 2, "the real chart/judge only contains selected onsets");
  assert.equal(judge.finish(4.2).miss, 2, "no out-of-section note contributes a miss");
});

it("preserves off-beat strum phase and the chord sounding across the section start", () => {
  const song = fixture({
    matching: "pitch", bpm: 100,
    beats: Array.from({ length: 20 }, (_, index) => ({ time: index * 0.6, bar: index % 4 === 0 })),
    harmony: [
      { time: 0, duration: 2.4, name: "C", roman: "I" },
      { time: 2.4, duration: 2.4, name: "G", roman: "V" },
      { time: 4.8, duration: 2.4, name: "Am", roman: "vi" },
      { time: 7.2, duration: 2.4, name: "F", roman: "IV" },
    ],
  });
  const selected = section(3.2, 6.2);
  const sliced = practiceSong(song, selected);
  assert.ok(sliced.beats[0]!.time < 0);
  assert.ok(sliced.beats.at(-1)!.time >= sliced.duration);
  for (const time of [3.2, 3.3, 3.6, 3.9, 4.2, 5.1, 6.1]) {
    assert.equal(suggestedStrum(sliced, time - selected.start), suggestedStrum(song, time));
    assert.equal(currentHarmony(sliced, time - selected.start)?.name, currentHarmony(song, time)?.name);
  }
  assert.equal(sliced.harmony![0]!.time, 2.4 - 3.2, "retain the original chord onset, without inventing one at zero");
  assert.equal(sliced.harmony!.at(-1)!.duration, 6.2 - 4.8);
});

for (const audioOffset of [3, -2, undefined]) {
  it(`keeps original audio aligned when its source offset is ${audioOffset ?? "omitted"}`, () => {
    const song = fixture({ audioAssetId: "original-file", audioName: "song.flac", audioOffset, tempoMap: [{ time: 0, bpm: 120 }] });
    const selected = section(10, 20);
    const sliced = practiceSong(song, selected);
    assert.equal(sliced.audioOffset, (audioOffset ?? 0) - 10);
    assert.equal(sliced.id, song.id);
    assert.equal(sliced.audioAssetId, "original-file");
    assert.equal(sliced.audioName, "song.flac");
    assert.equal(sliced.original, song.original);
    assert.deepEqual(sliced.tempoMap, [{ time: -10, bpm: 120 }]);
    for (const localTime of [0, 2, 9.9]) {
      assert.equal(localTime - sliced.audioOffset!, localTime + selected.start - (song.audioOffset ?? 0), "buffer sample positions match the unsliced recording");
    }
  });
}

it("retains silence before a backing track that begins inside the selected section", () => {
  const sliced = practiceSong(fixture({ audioOffset: 12 }), section(10, 20));
  assert.equal(sliced.audioOffset, 2);
  const chartStart = Math.max(0, sliced.audioOffset!);
  assert.equal(chartStart, 2);
  assert.equal(chartStart - sliced.audioOffset!, 0, "start at source sample zero after two seconds of chart time");
});

it("makes deterministic independent slices without mutating the original arrays or notes", () => {
  const song = fixture({ harmony: [{ time: 2, duration: 20, name: "C", roman: "I" }], tempoMap: [{ time: 0, bpm: 120 }] });
  song.parts[0]!.notes = [note(5), note(12)];
  const before = structuredClone(song);
  const selected = section(4, 16);
  const first = practiceSong(song, selected);
  const second = practiceSong(song, selected);
  assert.deepEqual(first, second);
  assert.notEqual(first.parts[0]!.notes[0], song.parts[0]!.notes[0]);
  first.parts[0]!.notes[0]!.time = 999;
  first.beats[0]!.bar = !first.beats[0]!.bar;
  first.sections[0]!.name = "Changed";
  first.harmony![0]!.name = "Changed";
  first.tempoMap![0]!.bpm = 99;
  assert.deepEqual(song, before);
  assert.deepEqual(second, practiceSong(song, selected), "one loop's state cannot leak into the next");
});

it("clamps overlapping bounds and rejects empty or non-finite slices", () => {
  const song = fixture();
  assert.equal(practiceSong(song, section(-5, 100)).duration, song.duration);
  assert.equal(practiceSong(song, section(-5, 100)).audioOffset, 0);
  for (const selected of [section(4, 4), section(9, 2), section(35, 40), section(-5, -1), section(NaN, 5), section(0, Infinity)]) {
    assert.throws(() => practiceSong(song, selected), RangeError);
  }
  assert.throws(() => practiceSong(fixture({ duration: NaN }), section(0, 5)), RangeError);
});
