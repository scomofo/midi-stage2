import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeBacklineDrive, makeBacklineDriveArcade } from "./guitar-song.ts";
import { catalog } from "./songs.ts";
import type { Note, Song } from "./types.ts";

const difficulties = ["chill", "standard", "expert"] as const;
const guitar = (song: Song) => song.parts.find((part) => part.type === "guitar")!.notes;
function onsets(notes: Note[]): Note[][] {
  const groups: Note[][] = [];
  for (const note of notes) {
    if (groups.at(-1)?.[0]?.time === note.time) groups.at(-1)!.push(note);
    else groups.push([note]);
  }
  return groups;
}

describe("Backline Drive optional arcade chart", () => {
  for (const difficulty of difficulties) {
    it(`${difficulty} has finite, sorted, playable notes and a complete band`, () => {
      const song = makeBacklineDriveArcade(difficulty);
      assert.equal(song.guitarMode, "fret-strum");
      assert.equal(song.original, true);
      assert.ok(song.duration >= 35 && song.duration <= 45);
      for (const part of song.parts) {
        let previousTime = -1;
        for (const note of part.notes) {
          assert.ok(Number.isFinite(note.time) && Number.isFinite(note.duration));
          assert.ok(note.time >= previousTime && note.time >= 0);
          assert.ok(note.duration > 0 && note.time + note.duration <= song.duration + 1e-8);
          assert.ok(Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127);
          assert.ok(Number.isInteger(note.velocity) && note.velocity >= 1 && note.velocity <= 127);
          if (part.type === "guitar") assert.ok(Number.isInteger(note.arcadeFret) && note.arcadeFret! >= 0 && note.arcadeFret! <= 4);
          else assert.equal(note.arcadeFret, undefined);
          previousTime = note.time;
        }
      }
      assert.deepEqual([...new Set(guitar(song).map((note) => note.arcadeFret))].sort(), [0, 1, 2, 3, 4]);
      assert.ok(song.parts.find((part) => part.type === "drums")!.notes.length > 120);
      assert.ok(song.parts.find((part) => part.type === "bass")!.notes.length > 40);
      assert.ok(onsets(guitar(song)).length >= 30);
      assert.equal(song.harmony!.length, 16);
    });

    it(`${difficulty} never asks for conflicting frets during a sustain`, () => {
      const groups = onsets(guitar(makeBacklineDriveArcade(difficulty)));
      const maxShape = difficulty === "chill" ? 1 : difficulty === "standard" ? 2 : 3;
      for (let index = 0; index < groups.length; index++) {
        const group = groups[index]!;
        assert.ok(group.length <= maxShape);
        assert.equal(new Set(group.map((note) => note.arcadeFret)).size, group.length, "Each onset uses distinct buttons");
        assert.equal(new Set(group.map((note) => note.duration)).size, 1, "Chord tails release together");
        if (groups[index + 1]) {
          for (const note of group) assert.ok(note.time + note.duration < groups[index + 1]![0]!.time, "Let go before changing shape");
        }
        if (group.length > 1) {
          assert.deepEqual(group.map((note) => note.pitch - group[0]!.pitch), group.length === 2 ? [0, 7] : [0, 7, 12]);
        }
      }
      assert.equal(Math.max(...groups.map((group) => group.length)), maxShape);
      assert.ok(groups.at(-1)!.every((note) => note.duration >= 2), "End on a substantial ringing chord");
    });
  }

  it("keeps passage boundaries, musical accompaniment and duration across difficulty changes", () => {
    const songs = difficulties.map(makeBacklineDriveArcade);
    const first = songs[0]!;
    for (const song of songs) {
      assert.equal(song.duration, first.duration);
      assert.deepEqual(song.sections, first.sections);
      assert.deepEqual(song.beats, first.beats);
      assert.deepEqual(song.harmony, first.harmony);
      assert.deepEqual(song.parts.filter((part) => part.type !== "guitar"), first.parts.filter((part) => part.type !== "guitar"));
      assert.equal(song.sections.length, 4);
      song.sections.forEach((section, index) => {
        assert.ok(Math.abs(section.time - index * 16 * 60 / song.bpm) < 1e-8);
        assert.ok(guitar(song).some((note) => note.time >= section.time && note.time < (song.sections[index + 1]?.time ?? song.duration)));
      });
      // The opening teaches one button at a time before introducing chords.
      assert.ok(onsets(guitar(song).filter((note) => note.time < song.sections[1]!.time)).every((group) => group.length === 1));
    }
    const counts = songs.map((song) => onsets(guitar(song)).length);
    assert.ok(counts[0]! < counts[1]! && counts[1]! < counts[2]!, "Levels add real rhythmic difficulty");
    assert.ok(guitar(songs[2]!).some((note) => Math.abs(note.time / (60 / first.bpm) % 1 - 0.5) < 1e-8));
  });

  it("appends to the catalog while preserving the established first five songs", () => {
    for (const difficulty of difficulties) {
      const songs = catalog(difficulty);
      assert.deepEqual(songs.map((song) => song.id), ["open-stage", "first-rehearsal", "neon-circuit", "after-hours", "voltage-run", "backline-drive", "backline-drive-arcade", "overdrive-horizon"]);
      const bd = songs.find((song) => song.id === "backline-drive");
      const bda = songs.find((song) => song.id === "backline-drive-arcade");
      assert.equal(bd!.guitarMode, "strings");
      assert.equal(bda!.guitarMode, "fret-strum");
      assert.equal(bda!.arrangement, difficulty);
    }
  });
});

describe("Backline Drive physical guitar arrangement", () => {
  for (const difficulty of difficulties) {
    it(`${difficulty} authors playable positions whose pitches match standard tuning`, () => {
      const song = makeBacklineDrive(difficulty);
      assert.equal(song.id, "backline-drive");
      assert.equal(song.guitarMode, "strings");
      assert.deepEqual(song.guitarTuning, [40, 45, 50, 55, 59, 64]);
      for (const part of song.parts) {
        for (const note of part.notes) {
          assert.equal(note.arcadeFret, undefined, "Real-string charts do not need arcade buttons");
          if (part.type !== "guitar") {
            assert.equal(note.guitarPosition, undefined);
            continue;
          }
          const position = note.guitarPosition;
          assert.ok(position, "Every guitar note has an authored position");
          assert.ok(Number.isInteger(position.string) && position.string >= 1 && position.string <= 6);
          assert.ok(Number.isInteger(position.fret) && position.fret >= 0 && position.fret <= 24);
          assert.equal(note.pitch, song.guitarTuning![6 - position.string]! + position.fret);
        }
      }
      const groups = onsets(guitar(song));
      for (let index = 0; index < groups.length; index++) {
        const group = groups[index]!;
        const positions = group.map((note) => note.guitarPosition!);
        assert.equal(new Set(positions.map((position) => position.string)).size, group.length, "One position per string at an onset");
        const fretted = positions.filter((position) => position.fret > 0).map((position) => position.fret);
        if (fretted.length > 1) assert.ok(Math.max(...fretted) - Math.min(...fretted) <= 3, "Chord shape fits one hand position");
        if (group.length > 1) {
          const strings = positions.map((position) => position.string).sort((a, b) => a - b);
          assert.equal(strings.at(-1)! - strings[0]!, strings.length - 1, "Power chords use contiguous strings");
          assert.deepEqual(group.map((note) => note.pitch - group[0]!.pitch), group.length === 2 ? [0, 7] : [0, 7, 12]);
        }
        if (groups[index + 1]) {
          assert.ok(group.every((note) => note.time + note.duration < groups[index + 1]![0]!.time), "Release the preceding shape before changing frets");
        }
      }
      assert.ok(guitar(song).filter((note) => note.time < song.sections[1]!.time).every((note) => note.guitarPosition!.fret <= 3), "The introduction stays in open position");
      const dChord = groups.find((group) => Math.abs(group[0]!.time - 40 * 60 / song.bpm) < 1e-8)!;
      assert.equal(dChord[0]!.pitch, 50, "D power chords use D3, within standard tuning");
      assert.deepEqual(dChord[0]!.guitarPosition, { string: 4, fret: 0 });
    });

    it(`${difficulty} keeps the music and physical fingering identical in the arcade variant`, () => {
      const real = makeBacklineDrive(difficulty);
      const arcade = makeBacklineDriveArcade(difficulty);
      assert.equal(real.duration, arcade.duration);
      assert.deepEqual(real.sections, arcade.sections);
      assert.deepEqual(real.harmony, arcade.harmony);
      assert.deepEqual(real.beats, arcade.beats);
      assert.deepEqual(real.parts, arcade.parts.map((part) => ({
        ...part,
        notes: part.notes.map(({ arcadeFret: _arcadeFret, ...note }) => note),
      })));
    });
  }
});
