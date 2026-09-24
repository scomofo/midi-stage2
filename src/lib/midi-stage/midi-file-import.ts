import { parseMidi, type MidiEvent } from "midi-file";
import { CHART_SCHEMA, validateSharedChart, type SharedChart, type SharedNote } from "./chart-format";
import { DRUMS } from "./engine";
import { INSTRUMENTS, type Instrument } from "./types";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_EVENTS = 200000;
const MAX_NOTES = 60000;
const MAX_SECONDS = 3600;
const DRUM_PITCHES = new Set(DRUMS.flatMap((lane) => lane.notes ?? []));

export class MidiFileImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MidiFileImportError";
  }
}

function fail(message: string): never {
  throw new MidiFileImportError(message);
}

/** Bound the parser's work and reject truncated events before handing it bytes. */
function checkStructure(data: Uint8Array) {
  if (!(data instanceof Uint8Array) || data.length < 14) fail("This is not a complete MIDI file.");
  if (data.length > MAX_BYTES) fail("MIDI files must be 4 MB or smaller.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = (offset: number) => String.fromCharCode(...data.subarray(offset, offset + 4));
  if (tag(0) !== "MThd") fail("Choose a Standard MIDI file (.mid or .midi).");
  const headerLength = view.getUint32(4);
  if (headerLength < 6 || headerLength > data.length - 8) fail("The MIDI header is incomplete.");
  const format = view.getUint16(8);
  if (format === 2) fail("MIDI format 2 contains independent sequences. Export a format 0 or 1 MIDI file instead.");
  if (format !== 0 && format !== 1) fail("Only MIDI format 0 and 1 files are supported.");
  const trackCount = view.getUint16(10);
  if (trackCount < 1 || trackCount > 256 || (format === 0 && trackCount !== 1)) fail("The MIDI file must contain 1–256 valid tracks.");
  const division = view.getUint16(12);
  if (division & 0x8000) fail("SMPTE-timed MIDI is not supported. Export with beats and a constant tempo instead.");
  if (!division) fail("The MIDI file has an invalid timing resolution.");

  let offset = 8 + headerLength;
  let eventCount = 0;
  let noteCount = 0;
  for (let track = 0; track < trackCount; track++) {
    if (offset + 8 > data.length || tag(offset) !== "MTrk") fail("A MIDI track is missing or incomplete.");
    const length = view.getUint32(offset + 4);
    offset += 8;
    if (length > data.length - offset) fail("A MIDI track is truncated.");
    const end = offset + length;
    let runningStatus = 0;
    let ended = false;
    const byte = () => {
      if (offset >= end) fail("A MIDI event is truncated.");
      return data[offset++];
    };
    const variable = () => {
      let value = 0;
      for (let i = 0; i < 4; i++) {
        const next = byte();
        value = value * 128 + (next & 127);
        if (!(next & 128)) return value;
      }
      return fail("A MIDI event has an invalid variable-length value.");
    };
    while (offset < end) {
      if (++eventCount > MAX_EVENTS) fail("This MIDI file has too many events (maximum 200,000).");
      if (ended) fail("A MIDI track contains data after its end marker.");
      variable(); // Delta time; the library converts the checked event below.
      let status = byte();
      if (status < 0x80) {
        if (!runningStatus) fail("A MIDI event uses running status before a channel message.");
        status = runningStatus;
        offset--;
      }
      if (status < 0xf0) {
        runningStatus = status;
        const type = status >> 4;
        const first = byte();
        const second = type === 0xc || type === 0xd ? 0 : byte();
        if (first > 127 || second > 127) fail("A MIDI channel event contains invalid data.");
        if (type === 0x9 && second > 0 && ++noteCount > MAX_NOTES) fail("A MIDI file can contain at most 60,000 notes.");
      } else if (status === 0xff || status === 0xf0 || status === 0xf7) {
        const meta = status === 0xff ? byte() : -1;
        const size = variable();
        if (size > end - offset) fail("A MIDI metadata or system event is truncated.");
        // The upstream parser decodes text with String.fromCharCode.apply.
        if (meta >= 1 && meta <= 7 && size > 16384) fail("A MIDI text field is too large (maximum 16 KB).");
        if (meta === 0x2f) {
          if (size !== 0) fail("The MIDI end-of-track marker is invalid.");
          ended = true;
        }
        offset += size;
      } else {
        fail("The MIDI file contains an unsupported system event.");
      }
    }
    if (!ended) fail("A MIDI track is missing its end marker.");
  }
  if (offset !== data.length) fail("The MIDI file contains unexpected trailing data.");
}

function chartId(data: Uint8Array) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of data) {
    first = Math.imul(first ^ byte, 0x01000193);
    second = Math.imul(second ^ byte, 0x85ebca6b);
  }
  return `chart-midi-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function cleanTitle(value: string) {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) ? " " : character;
  }).join("").replace(/\s+/g, " ").trim().slice(0, 160);
}

function instrument(channel: number, program: number): Instrument {
  if (channel === 9) return "drums";
  if (program >= 24 && program <= 31) return "guitar";
  if (program >= 32 && program <= 39) return "bass";
  return "keys";
}

type TimedEvent = { event: MidiEvent; tick: number; track: number; order: number };
type HeldNote = { tick: number; pitch: number; velocity: number; type: Instrument };
type HeldQueue = { notes: HeldNote[]; released: number };

/** Import a bounded, constant-tempo Standard MIDI file into the shared chart contract. */
export function importMidiFile(data: Uint8Array, filename: string): { chart: SharedChart; warnings: string[] } {
  checkStructure(data);
  let midi;
  try {
    midi = parseMidi(data);
  } catch {
    return fail("This MIDI file contains a malformed event. Try exporting it again as format 0 or 1.");
  }
  const events: TimedEvent[] = [];
  const trackEnds: number[] = [];
  let title = "";
  midi.tracks.forEach((track, trackIndex) => {
    let tick = 0;
    track.forEach((event, order) => {
      tick += event.deltaTime;
      if (!Number.isSafeInteger(tick) || tick < 0) fail("The MIDI file has invalid event timing.");
      if (!title && event.type === "trackName") title = cleanTitle(event.text);
      events.push({ event, tick, track: trackIndex, order });
    });
    trackEnds.push(tick);
  });
  events.sort((a, b) => a.tick - b.tick || a.track - b.track || a.order - b.order);

  const tempos = events.filter((entry) => entry.event.type === "setTempo");
  const firstTempo = tempos[0];
  const microseconds = firstTempo?.tick === 0 && firstTempo.event.type === "setTempo"
    ? firstTempo.event.microsecondsPerBeat : 500000;
  if (tempos.some(({ event }) => event.type === "setTempo" && event.microsecondsPerBeat !== microseconds)) {
    fail("This MIDI file changes tempo. Stage 2 currently supports constant-tempo MIDI; export a version with one tempo.");
  }
  const bpm = 60000000 / microseconds;
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 400) fail("MIDI tempo must be between 20 and 400 BPM.");
  const secondsPerTick = microseconds / 1000000 / midi.header.ticksPerBeat!;
  if (trackEnds.some((tick) => tick * secondsPerTick > MAX_SECONDS)) fail("MIDI songs must be one hour or shorter.");

  const warnings: string[] = [];
  if (!tempos.length) warnings.push("No tempo marker was found; imported at 120 BPM.");
  const parts = Object.fromEntries(INSTRUMENTS.map((type) => [type, [] as SharedNote[]])) as Record<Instrument, SharedNote[]>;
  const programs = Array<number>(16).fill(0);
  const held = new Map<string, HeldQueue>();
  let skippedDrums = 0;
  let unmatched = 0;
  let unmappedPrograms = false;
  let sustain = false;
  let pitchBend = false;
  let meter = false;
  let lastEnd = 0;
  const finish = (note: HeldNote, endTick: number) => {
    if (note.type === "drums" && !DRUM_PITCHES.has(note.pitch)) {
      skippedDrums++;
      return;
    }
    const time = note.tick * secondsPerTick;
    const duration = Math.max(0.02, (endTick - note.tick) * secondsPerTick);
    if (time + duration > MAX_SECONDS) fail("MIDI songs must be one hour or shorter.");
    parts[note.type].push({ time, duration, pitch: note.pitch, velocity: note.velocity });
    lastEnd = Math.max(lastEnd, time + duration);
  };

  for (const { event, tick, track } of events) {
    if (event.type === "programChange") {
      programs[event.channel] = event.programNumber;
    } else if (event.type === "noteOn") {
      const program = programs[event.channel];
      const type = instrument(event.channel, program);
      if (type === "keys" && program > 7) unmappedPrograms = true;
      const key = `${track}:${event.channel}:${event.noteNumber}`;
      const queue = held.get(key) ?? { notes: [], released: 0 };
      queue.notes.push({ tick, pitch: event.noteNumber, velocity: event.velocity, type });
      held.set(key, queue);
    } else if (event.type === "noteOff") {
      const key = `${track}:${event.channel}:${event.noteNumber}`;
      const queue = held.get(key);
      const note = queue ? queue.notes[queue.released++] : undefined;
      if (note) finish(note, tick);
      if (queue && queue.released >= queue.notes.length) held.delete(key);
    } else if (event.type === "controller" && event.controllerType === 64 && event.value >= 64) {
      sustain = true;
    } else if (event.type === "pitchBend" && event.value !== 0) {
      pitchBend = true;
    } else if (event.type === "timeSignature" && (event.numerator !== 4 || event.denominator !== 4)) {
      meter = true;
    }
  }
  for (const [key, queue] of held) {
    const track = Number(key.split(":")[0]);
    for (let i = queue.released; i < queue.notes.length; i++) {
      const note = queue.notes[i];
      finish(note, trackEnds[track]);
      unmatched++;
    }
  }
  if (!INSTRUMENTS.some((type) => parts[type].length)) fail("This MIDI file has no playable notes. Use melodic notes or supported drum-kit pitches.");
  if (skippedDrums) warnings.push(`${skippedDrums} percussion note${skippedDrums === 1 ? " was" : "s were"} skipped because the six drum lanes do not support those pitches.`);
  if (unmappedPrograms) warnings.push("Other General MIDI instruments were mapped to Keys; guitar and bass programs keep their own parts.");
  if (unmatched) warnings.push(`${unmatched} note${unmatched === 1 ? " had" : "s had"} no release and ${unmatched === 1 ? "was" : "were"} ended at the track boundary.`);
  if (sustain) warnings.push("Sustain pedal is not imported; note lengths follow key releases.");
  if (pitchBend) warnings.push("Pitch bends are not imported; notes keep their written pitches.");
  if (meter) warnings.push("The beat grid uses 4/4; the MIDI time signature does not change note timing.");
  title ||= cleanTitle(filename.split(/[\\/]/).pop()?.replace(/\.midi?$/i, "") ?? "") || "Imported MIDI";
  const chart = validateSharedChart({
    schema: CHART_SCHEMA,
    version: 1,
    id: chartId(data),
    title,
    bpm,
    duration: Math.min(MAX_SECONDS, Math.max(0.25, lastEnd + 0.5)),
    firstBeat: 0,
    origin: "midi",
    parts: INSTRUMENTS.map((type) => ({ type, notes: parts[type] })),
  });
  const duplicates = INSTRUMENTS.reduce((sum, type) => sum + parts[type].length, 0)
    - chart.parts.reduce((sum, part) => sum + part.notes.length, 0);
  if (duplicates) warnings.push(`${duplicates} duplicate same-pitch strike${duplicates === 1 ? " was" : "s were"} combined at matching times.`);
  return { chart, warnings };
}
