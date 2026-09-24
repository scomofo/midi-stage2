import { describe, it, mock, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  analyzeSongAudio,
  decodeSongAudio,
  importAudioFile,
  isSupportedAudioFile,
  MAX_AUDIO_IMPORT_BYTES,
  MAX_AUDIO_SECONDS,
  type AudioImportProgress,
  type SongAudioSamples,
} from "./audio-import.ts";

function samples(duration = 5, sampleRate = 16000, channelCount = 1): SongAudioSamples {
  const channels = Array.from({ length: channelCount }, () => new Float32Array(Math.round(duration * sampleRate)));
  return { duration, sampleRate, length: channels[0]!.length, numberOfChannels: channelCount, getChannelData: (index) => channels[index]! };
}

function addPulses(buffer: SongAudioSamples, times: number[], amplitude = 0.8) {
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (const time of times) {
      const start = Math.round(time * buffer.sampleRate);
      for (let i = 0; i < buffer.sampleRate * 0.06 && start + i < data.length; i++) {
        data[start + i] += (channel % 2 ? -1 : 1) * amplitude * Math.exp(-i / (buffer.sampleRate * 0.018)) * Math.sin(i * 2 * Math.PI * 950 / buffer.sampleRate);
      }
    }
  }
}

function installMetadataAudio(context: TestContext, duration = 4, complete = true) {
  class AudioMetadata {
    duration = duration;
    src = "";
    preload = "";
    onloadedmetadata: (() => void) | null = null;
    onerror: (() => void) | null = null;
    load() { if (this.src && complete) queueMicrotask(() => this.onloadedmetadata?.()); }
    removeAttribute() { this.src = ""; }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  Object.defineProperty(globalThis, "Audio", { value: AudioMetadata, configurable: true });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "Audio", original);
    else Reflect.deleteProperty(globalThis, "Audio");
  });
}

function installDecoder(context: TestContext, decode: (data: ArrayBuffer) => Promise<AudioBuffer>) {
  class Decoder { decodeAudioData = decode; }
  const original = Object.getOwnPropertyDescriptor(globalThis, "OfflineAudioContext");
  Object.defineProperty(globalThis, "OfflineAudioContext", { value: Decoder, configurable: true });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "OfflineAudioContext", original);
    else Reflect.deleteProperty(globalThis, "OfflineAudioContext");
  });
}

describe("audio rhythm analysis", () => {
  it("detects real attacks without inserting grid notes, preserving timing and stereo phase", () => {
    const buffer = samples(5, 16000, 2);
    const times = [0.32, 0.88, 1.42, 2.18, 2.96, 3.64, 4.28];
    addPulses(buffer, times);
    const { chart, warnings } = analyzeSongAudio(buffer, "My_song.FLAC", "abc123");
    const notes = chart.parts.find((part) => part.type === "keys")!.notes;
    assert.equal(chart.version, 2);
    assert.equal(chart.matching, "rhythm");
    assert.equal(chart.id, "chart-audio-abc123");
    assert.equal(chart.title, "My song");
    assert.equal(chart.audioName, "My_song.FLAC");
    assert.equal(chart.duration, buffer.duration);
    assert.equal(chart.origin, "audio-rhythm");
    assert.equal(notes.length, times.length);
    notes.forEach((note, index) => {
      assert.ok(Math.abs(note.time - times[index]!) <= 0.04, `${note.time} should match ${times[index]}`);
      assert.equal(note.pitch, 60);
      assert.ok(note.duration <= 0.06);
      assert.ok(note.velocity >= 70 && note.velocity <= 127);
    });
    assert.ok(chart.parts.filter((part) => part.type !== "keys").every((part) => !part.notes.length));
    assert.match(warnings.join(" "), /not individual instrument pitches/);
  });

  it("estimates a regular beat but does not change its source timing", () => {
    const buffer = samples(8);
    const times = Array.from({ length: 14 }, (_, index) => 0.37 + index * 0.5);
    addPulses(buffer, times);
    const { chart, warnings } = analyzeSongAudio(buffer, "Pulse.wav", "pulse");
    assert.ok(Math.abs(chart.bpm - 120) <= 2, `Estimated ${chart.bpm} BPM`);
    assert.match(warnings[1]!, /estimated/);
    const notes = chart.parts[1]!.notes;
    assert.equal(notes.length, times.length);
    assert.ok(Math.abs(notes[0]!.time - 0.37) <= 0.04);
    assert.equal(chart.firstBeat, notes[0]!.time);
  });

  it("rejects silence and a sustained tone instead of making an imaginary highway", () => {
    assert.throws(() => analyzeSongAudio(samples(), "Silent.wav", "silent"), /silent or too quiet/);
    const buffer = samples();
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.sin(i * 2 * Math.PI * 440 / buffer.sampleRate) * 0.4;
    assert.throws(() => analyzeSongAudio(buffer, "Tone.wav", "tone"), /not enough clear attacks/);
    channel.fill(0);
    addPulses(buffer, [0.5, 2]);
    assert.throws(() => analyzeSongAudio(buffer, "Two.wav", "two"), /not enough clear attacks/);
  });

  it("keeps busy attacks playable and all note endings inside the recording", () => {
    const buffer = samples(4);
    addPulses(buffer, Array.from({ length: 45 }, (_, index) => 0.2 + index * 0.08));
    addPulses(buffer, [3.96]);
    const { chart } = analyzeSongAudio(buffer, "Dense.wav", "dense");
    const notes = chart.parts[1]!.notes;
    assert.ok(notes.length >= 3 && notes.length < 46);
    notes.forEach((note, index) => {
      assert.ok(note.time + note.duration <= buffer.duration + 1e-8);
      if (index) assert.ok(note.time - notes[index - 1]!.time >= 0.16 - 1e-8);
    });
  });

  it("uses a stated fallback for too few events to estimate tempo reliably", () => {
    const buffer = samples(4);
    addPulses(buffer, [0.24, 1.42, 3.12]);
    const { chart, warnings } = analyzeSongAudio(buffer, ".wav", "short");
    assert.equal(chart.bpm, 120);
    assert.equal(chart.title, "Imported song");
    assert.equal(chart.parts[1]!.notes.length, 3);
    assert.match(warnings[1]!, /No steady tempo/);
  });

  it("rejects invalid or oversized decoded audio before accessing its samples", () => {
    const buffer = samples();
    assert.throws(() => analyzeSongAudio({ ...buffer, duration: MAX_AUDIO_SECONDS + 1 }, "Long.wav", "long"), /6 minutes/);
    assert.throws(() => analyzeSongAudio({ ...buffer, duration: 0.5 }, "Tiny.wav", "tiny"), /1 second/);
    assert.throws(() => analyzeSongAudio({ ...buffer, sampleRate: NaN }, "Bad.wav", "bad"), /not valid/);
    assert.throws(() => analyzeSongAudio({ ...buffer, numberOfChannels: 0 }, "Bad.wav", "bad"), /not valid/);
    assert.throws(() => analyzeSongAudio(buffer, "Bad.wav", "../bad"), /fingerprint/);
  });
});

describe("audio file import", () => {
  it("recognizes common audio formats without treating MIDI or chart JSON as recordings", () => {
    for (const name of ["Song.MP3", "Song.wav", "Song.flac", "Song.m4a", "Song.ogg", "Song.opus", "Song.aiff"]) {
      assert.equal(isSupportedAudioFile({ name, type: "" }), true, name);
    }
    assert.equal(isSupportedAudioFile({ name: "Recording", type: "audio/webm" }), true);
    assert.equal(isSupportedAudioFile({ name: "Notes.mid", type: "audio/midi" }), false);
    assert.equal(isSupportedAudioFile({ name: "Chart.json", type: "audio/wav" }), false);
    assert.equal(isSupportedAudioFile({ name: "Photo.png", type: "image/png" }), false);
  });

  it("rejects empty and oversized input before decoding", async () => {
    await assert.rejects(decodeSongAudio(new ArrayBuffer(0)), /empty/);
    await assert.rejects(importAudioFile({ size: MAX_AUDIO_IMPORT_BYTES + 1, name: "Huge.wav", type: "audio/wav" } as File), /50 MB/);
    await assert.rejects(importAudioFile(new File(["data"], "Photo.png", { type: "image/png" })), /Choose MP3/);
  });

  it("decodes offline at 44.1 kHz and hashes bytes before a decoder detaches them", async (context) => {
    installMetadataAudio(context);
    const buffer = samples(4) as AudioBuffer;
    addPulses(buffer, [0.3, 1.3, 2.3]);
    const options: number[][] = [];
    class Decoder {
      constructor(...args: number[]) { options.push(args); }
      async decodeAudioData(data: ArrayBuffer) {
        structuredClone(data, { transfer: [data] });
        return buffer;
      }
    }
    const original = Object.getOwnPropertyDescriptor(globalThis, "OfflineAudioContext");
    Object.defineProperty(globalThis, "OfflineAudioContext", { value: Decoder, configurable: true });
    context.after(() => {
      if (original) Object.defineProperty(globalThis, "OfflineAudioContext", original);
      else Reflect.deleteProperty(globalThis, "OfflineAudioContext");
    });
    const file = new File(["same audio bytes"], "Recording.flac", { type: "audio/flac" });
    const result = await importAudioFile(file);
    const renamed = await importAudioFile(new File(["same audio bytes"], "Renamed.flac", { type: "audio/flac" }));
    assert.equal(result.buffer, buffer);
    assert.deepEqual(options, [[2, 1, 44100], [2, 1, 44100]]);
    assert.equal(result.chart.id, `chart-audio-${createHash("sha256").update("same audio bytes").digest("hex")}`);
    assert.equal(result.chart.id, renamed.chart.id);
    assert.equal(renamed.chart.title, "Renamed");
  });

  it("rejects a long compressed recording from metadata before reading or decoding it", async (context) => {
    installMetadataAudio(context, 3600);
    const revoke = context.mock.method(URL, "revokeObjectURL");
    const file = new File(["small but hours long"], "Long.mp3", { type: "audio/mpeg" });
    const read = context.mock.method(file, "arrayBuffer");
    await assert.rejects(importAudioFile(file), /6 minutes/);
    assert.equal(read.mock.callCount(), 0);
    assert.equal(revoke.mock.callCount(), 1);
  });

  it("times out unreadable metadata and releases its temporary object URL", async (context) => {
    installMetadataAudio(context, 4, false);
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const revoke = context.mock.method(URL, "revokeObjectURL");
    const pending = importAudioFile(new File(["unreadable"], "Broken.wav"));
    const rejection = assert.rejects(pending, /length could not be read/);
    context.mock.timers.tick(15000);
    await rejection;
    assert.equal(revoke.mock.callCount(), 1);
  });

  it("cancels unreadable metadata immediately and releases its temporary URL", async (context) => {
    installMetadataAudio(context, 4, false);
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const controller = new AbortController();
    const revoke = context.mock.method(URL, "revokeObjectURL");
    const file = new File(["waiting for metadata"], "Waiting.wav");
    const read = context.mock.method(file, "arrayBuffer");
    const progress: AudioImportProgress[] = [];
    const pending = importAudioFile(file, { signal: controller.signal, onProgress: (value) => progress.push(value) });
    const rejection = assert.rejects(pending, { name: "AbortError" });
    controller.abort();
    await rejection;
    assert.equal(read.mock.callCount(), 0);
    assert.equal(revoke.mock.callCount(), 1);
    assert.deepEqual(progress, [{ phase: "checking" }]);
    context.mock.timers.tick(15000);
    assert.equal(revoke.mock.callCount(), 1, "the abandoned metadata timer must be cleared");
  });

  it("skips decoding when cancelled during file reading", async (context) => {
    installMetadataAudio(context);
    const controller = new AbortController();
    const file = new File(["cancel while reading"], "Cancelled.wav");
    context.mock.method(file, "arrayBuffer", async () => {
      controller.abort();
      return new ArrayBuffer(20);
    });
    const decode = mock.fn(async () => samples(4) as AudioBuffer);
    installDecoder(context, decode);
    await assert.rejects(importAudioFile(file, { signal: controller.signal }), { name: "AbortError" });
    assert.equal(decode.mock.callCount(), 0);
  });

  it("discards a native decode completed after cancellation without reading its samples", async (context) => {
    installMetadataAudio(context);
    const controller = new AbortController();
    const buffer = samples(4) as AudioBuffer;
    const getSamples = context.mock.method(buffer, "getChannelData");
    const progress: AudioImportProgress[] = [];
    installDecoder(context, async () => {
      controller.abort();
      return buffer;
    });
    await assert.rejects(importAudioFile(new File(["decoded too late"], "Cancelled.wav"), {
      signal: controller.signal, onProgress: (value) => progress.push(value),
    }), { name: "AbortError" });
    assert.equal(getSamples.mock.callCount(), 0);
    assert.deepEqual(progress.map((value) => value.phase), ["checking", "decoding"]);
  });

  it("produces identical charts in cooperative and synchronous analysis with useful progress", async (context) => {
    installMetadataAudio(context, 20);
    const buffer = samples(20, 16000, 2) as AudioBuffer;
    addPulses(buffer, Array.from({ length: 35 }, (_, index) => 0.3 + index * 0.53));
    installDecoder(context, async () => buffer);
    const file = new File(["same chunked recording"], "Cooperative.wav");
    const fingerprint = createHash("sha256").update("same chunked recording").digest("hex");
    const expected = analyzeSongAudio(buffer, file.name, fingerprint);
    const progress: AudioImportProgress[] = [];
    const result = await importAudioFile(file, { onProgress: (value) => progress.push(value) });
    assert.deepEqual({ chart: result.chart, warnings: result.warnings }, expected);
    assert.equal(result.buffer, buffer, "chunking must preserve the original playback buffer");
    assert.deepEqual(progress.slice(0, 2), [{ phase: "checking" }, { phase: "decoding" }]);
    const fractions = progress.filter((value) => value.phase === "analyzing").map((value) => value.progress!);
    assert.equal(fractions[0], 0);
    assert.equal(fractions.at(-1), 1);
    assert.ok(fractions.length > 4, "longer songs must publish progress across multiple chunks");
    fractions.forEach((fraction, index) => {
      assert.ok(fraction >= 0 && fraction <= 1);
      if (index) assert.ok(fraction >= fractions[index - 1]!);
    });
  });

  it("yields between sample chunks so a timer can cancel before the next channel", async (context) => {
    installMetadataAudio(context, 20);
    const controller = new AbortController();
    const buffer = samples(20, 16000, 2) as AudioBuffer;
    addPulses(buffer, [0.3, 1.3, 2.3, 3.3]);
    const getSamples = context.mock.method(buffer, "getChannelData");
    installDecoder(context, async () => buffer);
    let cancelScheduled = false;
    let timerRan = false;
    const progress: AudioImportProgress[] = [];
    await assert.rejects(importAudioFile(new File(["cancel during analysis"], "Long.wav"), {
      signal: controller.signal,
      onProgress: (value) => {
        progress.push(value);
        if (value.phase !== "analyzing" || !value.progress || cancelScheduled) return;
        cancelScheduled = true;
        setTimeout(() => { timerRan = true; controller.abort(); }, 0);
      },
    }), { name: "AbortError" });
    assert.equal(timerRan, true, "cancellation must receive a browser task between sample chunks");
    assert.equal(getSamples.mock.callCount(), 1, "cancelled analysis must not read the second channel");
    assert.ok(progress.at(-1)!.progress! < 0.45, "cancellation must stop before finishing even the first channel");
  });

  it("gives a useful decode error for codecs the browser cannot read", async (context) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "OfflineAudioContext");
    const decode = mock.fn(async () => { throw new Error("EncodingError"); });
    class Decoder { decodeAudioData = decode; }
    Object.defineProperty(globalThis, "OfflineAudioContext", { value: Decoder, configurable: true });
    context.after(() => {
      if (original) Object.defineProperty(globalThis, "OfflineAudioContext", original);
      else Reflect.deleteProperty(globalThis, "OfflineAudioContext");
    });
    await assert.rejects(decodeSongAudio(new ArrayBuffer(10)), /unsupported codec.*WAV or MP3/);
    assert.equal(decode.mock.callCount(), 1);
  });
});
