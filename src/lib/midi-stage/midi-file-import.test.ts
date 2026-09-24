import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importMidiFile, MidiFileImportError } from "./midi-file-import.ts";
import { sharedChartToSong, validateSharedChart } from "./chart-format.ts";

// Build raw Standard MIDI bytes, independently of the parser dependency.
const u16 = (value: number) => [value >>> 8 & 255, value & 255];
const u32 = (value: number) => [value >>> 24 & 255, value >>> 16 & 255, value >>> 8 & 255, value & 255];
function vlq(value: number) {
  const out = [value & 127];
  while ((value = Math.floor(value / 128))) out.unshift((value & 127) | 128);
  return out;
}
const event = (delta: number, ...bytes: number[]) => [...vlq(delta), ...bytes];
const end = (delta = 0) => event(delta, 0xff, 0x2f, 0);
const tempo = (value = 500000, delta = 0) => event(delta, 0xff, 0x51, 3, value >>> 16 & 255, value >>> 8 & 255, value & 255);
const name = (text: string) => event(0, 0xff, 3, ...vlq(text.length), ...Array.from(text, (c) => c.charCodeAt(0)));
function midi(tracks: number[][], format = tracks.length === 1 ? 0 : 1, division = 480) {
  const bytes = [77, 84, 104, 100, ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(division)];
  for (const track of tracks) {
    bytes.push(77, 84, 114, 107, ...u32(track.length));
    for (const byte of track) bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}
const melody = () => [...event(0, 0x90, 60, 100), ...event(480, 0x80, 60, 0), ...end()];
const part = (result: ReturnType<typeof importMidiFile>, type: string) => result.chart.parts.find((p) => p.type === type)!.notes;

describe("Standard MIDI import", () => {
  it("imports format 0 tempo, polyphony, velocities, and key-release timing into a canonical chart", () => {
    const bytes = midi([[
      ...name("Evening rehearsal"), ...tempo(600000),
      ...event(0, 0x90, 60, 80), ...event(0, 0x90, 64, 127),
      ...event(480, 0x80, 60, 0), ...event(240, 0x80, 64, 0), ...end(),
    ]]);
    const result = importMidiFile(bytes, "ignored.mid");
    assert.equal(result.chart.title, "Evening rehearsal");
    assert.equal(result.chart.bpm, 100);
    assert.deepEqual(part(result, "keys"), [
      { time: 0, duration: 0.6, pitch: 60, velocity: 80 },
      { time: 0, duration: 0.9, pitch: 64, velocity: 127 },
    ]);
    assert.deepEqual(result.chart, validateSharedChart(result.chart));
    assert.deepEqual(result.warnings, []);
    const song = sharedChartToSong(result.chart);
    assert.equal(song.beats[1].time, 0.6);
    assert.equal(song.sections[0].name, "Evening rehearsal");
  });

  it("handles running status and velocity-zero note-off at the default 120 BPM", () => {
    const bytes = midi([[
      ...event(0, 0x90, 60, 70), ...event(240, 64, 90),
      ...event(240, 60, 0), ...event(240, 64, 0), ...end(),
    ]]);
    const result = importMidiFile(bytes, "Running.midi");
    assert.deepEqual(part(result, "keys"), [
      { time: 0, duration: 0.5, pitch: 60, velocity: 70 },
      { time: 0.25, duration: 0.5, pitch: 64, velocity: 90 },
    ]);
    assert.equal(result.chart.title, "Running");
    assert.match(result.warnings.join(" "), /120 BPM/);
  });

  it("groups format 1 General MIDI programs and channel 10 percussion into the four parts", () => {
    const bytes = midi([
      [...tempo(), ...end()],
      [...event(0, 0xc0, 24), ...event(0, 0x90, 60, 90), ...event(480, 0x80, 60, 0), ...end()],
      [...event(0, 0xc1, 39), ...event(0, 0x91, 36, 100), ...event(480, 0x81, 36, 0), ...end()],
      [...event(0, 0xc2, 48), ...event(0, 0x92, 67, 110), ...event(480, 0x82, 67, 0), ...end()],
      [...event(0, 0x99, 36, 127), ...event(0, 0x99, 54, 80), ...event(120, 0x89, 36, 0), ...event(0, 0x89, 54, 0), ...end()],
    ]);
    const result = importMidiFile(bytes, "Band.mid");
    for (const type of ["drums", "keys", "guitar", "bass"]) assert.equal(part(result, type).length, 1);
    assert.equal(part(result, "drums")[0].pitch, 36);
    assert.equal(part(result, "bass")[0].pitch, 36);
    assert.match(result.warnings.join(" "), /1 percussion note was skipped/);
    assert.match(result.warnings.join(" "), /mapped to Keys/);
  });

  it("merges melodic tracks without dropping chords or overlapping repeated pitches", () => {
    const result = importMidiFile(midi([
      [...tempo(), ...event(0, 0x90, 60, 80), ...event(240, 0x90, 60, 90), ...event(240, 0x80, 60, 0), ...event(240, 0x80, 60, 0), ...end()],
      [...event(0, 0x91, 64, 100), ...event(960, 0x81, 64, 0), ...end()],
    ]), "Chords.mid");
    assert.deepEqual(part(result, "keys"), [
      { time: 0, duration: 0.5, pitch: 60, velocity: 80 },
      { time: 0, duration: 1, pitch: 64, velocity: 100 },
      { time: 0.25, duration: 0.5, pitch: 60, velocity: 90 },
    ]);
  });

  it("keeps a held note assigned to its original program after a program change", () => {
    const result = importMidiFile(midi([[
      ...tempo(), ...event(0, 0xc0, 31), ...event(0, 0x90, 60, 80),
      ...event(240, 0xc0, 32), ...event(0, 0x90, 36, 90),
      ...event(240, 0x80, 60, 0), ...event(0, 0x80, 36, 0), ...end(),
    ]]), "Programs.mid");
    assert.equal(part(result, "guitar")[0].duration, 0.5);
    assert.equal(part(result, "bass")[0].duration, 0.25);
  });

  it("closes unreleased notes at the track end and keeps short notes playable", () => {
    const result = importMidiFile(midi([[
      ...tempo(), ...event(0, 0x90, 60, 100), ...event(0, 0x80, 60, 0),
      ...event(0, 0x90, 64, 100), ...end(480),
    ]]), "Release.mid");
    assert.equal(part(result, "keys")[0].duration, 0.02);
    assert.equal(part(result, "keys")[1].duration, 0.5);
    assert.match(result.warnings.join(" "), /1 note had no release/);
  });

  it("reports pedal, bend, and meter limitations without altering authored note timing", () => {
    const result = importMidiFile(midi([[
      ...tempo(), ...event(0, 0xb0, 64, 127), ...event(0, 0xe0, 127, 127),
      ...event(0, 0xff, 0x58, 4, 3, 2, 24, 8), ...melody(),
    ]]), "Expression.mid");
    assert.equal(part(result, "keys")[0].duration, 0.5);
    assert.match(result.warnings.join(" "), /Sustain pedal/);
    assert.match(result.warnings.join(" "), /Pitch bends/);
    assert.match(result.warnings.join(" "), /4\/4/);
  });

  it("uses a deterministic content ID and sanitizes title metadata and filename fallbacks", () => {
    const bytes = midi([[...name("  My\0song\n  "), ...melody()]]);
    const first = importMidiFile(bytes, "first.mid");
    const second = importMidiFile(bytes, "renamed.mid");
    assert.equal(first.chart.id, second.chart.id);
    assert.match(first.chart.id, /^chart-midi-[0-9a-f]{16}$/);
    assert.equal(first.chart.title, "My song");
    const alternate = midi([[...name("Other song"), ...melody()]]);
    assert.notEqual(first.chart.id, importMidiFile(alternate, "first.mid").chart.id);
    assert.equal(importMidiFile(midi([melody()]), "C:\\music\\Evening.midi").chart.title, "Evening");
  });
});

describe("MIDI import boundaries", () => {
  it("accepts repeated constant tempo markers but rejects tempo changes, including delayed first tempo", () => {
    assert.equal(importMidiFile(midi([[...tempo(), ...tempo(), ...melody()]]), "Constant.mid").chart.bpm, 120);
    for (const track of [
      [...tempo(), ...tempo(600000, 480), ...melody()],
      [...tempo(600000, 480), ...melody()],
      [...tempo(), ...tempo(600000), ...melody()],
    ]) assert.throws(() => importMidiFile(midi([track]), "Changing.mid"), /changes tempo/);
    assert.throws(() => importMidiFile(midi([[...tempo(6000000), ...melody()]]), "Slow.mid"), /20 and 400/);
    assert.throws(() => importMidiFile(midi([[...tempo(0), ...melody()]]), "Zero.mid"), /20 and 400/);
  });

  it("rejects format 2, SMPTE timing, missing timing resolution, and empty songs", () => {
    assert.throws(() => importMidiFile(midi([melody()], 2), "Type2.mid"), /format 2/);
    assert.throws(() => importMidiFile(midi([melody()], 0, 0xe728), "SMPTE.mid"), /SMPTE/);
    assert.throws(() => importMidiFile(midi([melody()], 0, 0), "Broken.mid"), /timing resolution/);
    assert.throws(() => importMidiFile(midi([[...tempo(), ...end()]]), "Empty.mid"), /no playable notes/);
    assert.throws(() => importMidiFile(midi([[...event(0, 0x99, 54, 80), ...event(240, 0x89, 54, 0), ...end()]]), "Percussion.mid"), /no playable notes/);
  });

  it("rejects malformed and truncated raw byte streams with readable import errors", () => {
    const valid = midi([melody()]);
    const inputs = [
      new Uint8Array(), Uint8Array.from([1, 2, 3]),
      valid.slice(0, -1),
      midi([[...event(0, 0x90, 60), ...end()]]),
      midi([[...event(0, 60, 100), ...end()]]),
      midi([[0x80, 0x80, 0x80, 0x80, 0, ...end()]]),
      midi([[...event(0, 0xff, 3, 30, 65), ...end()]]),
      midi([[...event(0, 0x90, 60, 100)]]),
      midi([[...end(), ...event(0, 0x90, 60, 100)]]),
    ];
    for (const data of inputs) assert.throws(() => importMidiFile(data, "Broken.mid"), MidiFileImportError);
  });

  it("bounds file size, note count, event count, text metadata, and song duration", () => {
    assert.throws(() => importMidiFile(new Uint8Array(4 * 1024 * 1024 + 1), "Large.mid"), /4 MB/);
    const notes: number[] = [];
    for (let i = 0; i < 60001; i++) notes.push(...event(0, 0x90, 60, 100), ...event(0, 0x80, 60, 0));
    notes.push(...end());
    assert.throws(() => importMidiFile(midi([notes]), "Notes.mid"), /60,000/);
    const events: number[] = [];
    for (let i = 0; i < 200001; i++) events.push(...event(0, 0xb0, 7, 100));
    events.push(...end());
    assert.throws(() => importMidiFile(midi([events]), "Events.mid"), /200,000/);
    assert.throws(() => importMidiFile(midi([[...name("a".repeat(16385)), ...melody()]]), "Text.mid"), /16 KB/);
    assert.throws(() => importMidiFile(midi([[...event(0, 0x90, 60, 100), ...event(3600 * 960 + 1, 0x80, 60, 0), ...end()]]), "Long.mid"), /one hour/);
  });
});
