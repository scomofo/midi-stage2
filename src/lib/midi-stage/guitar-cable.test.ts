import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYSIS_SIZE,
  GuitarCableProcessor,
  detectPitch,
  frequencyToMidi,
  midiToFrequency,
  rmsOf,
  velocityOf,
} from "./guitar-cable-processor.js";
import {
  calibrateLatency,
  loadCableCalibration,
  loadCableDeviceId,
  saveCableCalibration,
  saveCableDeviceId,
} from "./guitar-cable";

const SR = 48000;

function sine(frequency: number, seconds = ANALYSIS_SIZE / SR, amplitude = 0.3, phase = 0): Float32Array {
  const count = Math.floor(seconds * SR);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = amplitude * Math.sin(2 * Math.PI * frequency * (i / SR) + phase);
  return out;
}

/** Harmonic-rich pluck-like tone: strong fundamental with decaying harmonics. */
function pluck(frequency: number, amplitude = 0.3): Float32Array {
  const count = ANALYSIS_SIZE;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SR;
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * frequency * h * t) / h;
    out[i] = amplitude * v * 0.6;
  }
  return out;
}

describe("frequency <-> midi", () => {
  test("A4 is MIDI 69", () => {
    assert.equal(Math.round(frequencyToMidi(440)), 69);
    assert.ok(Math.abs(midiToFrequency(69) - 440) < 1e-9);
  });

  test("low E (82.41 Hz) is MIDI 40", () => {
    assert.equal(Math.round(frequencyToMidi(82.41)), 40);
  });

  test("round-trips across the guitar range", () => {
    for (const midi of [28, 40, 45, 50, 55, 59, 64, 76, 88]) {
      assert.equal(Math.round(frequencyToMidi(midiToFrequency(midi))), midi);
    }
  });
});

describe("detectPitch", () => {
  test("finds each open string within a quarter tone", () => {
    const cases: Array<[number, number]> = [
      [82.41, 40],
      [110, 45],
      [146.83, 50],
      [196, 55],
      [246.94, 59],
      [329.63, 64],
    ];
    for (const [frequency, midi] of cases) {
      const result = detectPitch(sine(frequency), SR);
      assert.ok(result, `no pitch for ${frequency} Hz`);
      // Quarter tone is ~1.5% in frequency.
      assert.ok(
        Math.abs(result.frequency - frequency) / frequency < 0.015,
        `${frequency} Hz detected as ${result.frequency.toFixed(2)} Hz`,
      );
      assert.equal(Math.round(frequencyToMidi(result.frequency)), midi);
      assert.ok(result.clarity > 0.9, `clarity ${result.clarity}`);
    }
  });

  test("does not lock onto a harmonic of a plucked low E", () => {
    const result = detectPitch(pluck(82.41), SR);
    assert.ok(result, "no pitch for plucked low E");
    assert.equal(Math.round(frequencyToMidi(result.frequency)), 40);
  });

  test("does not lock onto a harmonic of a plucked A", () => {
    const result = detectPitch(pluck(110), SR);
    assert.ok(result, "no pitch for plucked A");
    assert.equal(Math.round(frequencyToMidi(result.frequency)), 45);
  });

  test("returns null for silence", () => {
    assert.equal(detectPitch(new Float32Array(ANALYSIS_SIZE), SR), null);
  });

  test("returns null for sub-threshold noise", () => {
    const noise = new Float32Array(ANALYSIS_SIZE);
    let seed = 42;
    for (let i = 0; i < noise.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      noise[i] = (((seed >>> 0) % 1000) / 1000 - 0.5) * 0.004;
    }
    assert.equal(detectPitch(noise, SR), null);
  });

  test("rms and velocity helpers behave", () => {
    assert.equal(rmsOf(new Float32Array(8)), 0);
    assert.ok(Math.abs(rmsOf(Float32Array.from([1, -1, 1, -1])) - 1) < 1e-9);
    assert.ok(velocityOf(0.02) >= 1 && velocityOf(0.02) <= 127);
    assert.ok(velocityOf(0.3) > velocityOf(0.05));
    assert.equal(velocityOf(10), 127);
  });
});

type Posted = { type: string; [key: string]: unknown };

function makeProcessor() {
  const messages: Posted[] = [];
  const processor = new GuitarCableProcessor();
  (processor as unknown as { port: { postMessage: (m: Posted) => void } }).port = {
    postMessage: (m: Posted) => messages.push(m),
  };
  return { processor, messages };
}

describe("GuitarCableProcessor onset/release", () => {
  test("emits onset with the played pitch, then release on silence", () => {
    const { processor, messages } = makeProcessor();
    const hop = 256 / SR;
    let t = 0;
    const window = sine(82.41);
    // Settle: first the onset is detected, then the pitch settles and emits.
    for (let i = 0; i < 12; i++) {
      processor.analyze(window, SR, t);
      t += hop;
    }
    const onsets = messages.filter((m) => m.type === "cable-onset");
    assert.equal(onsets.length, 1);
    assert.equal(onsets[0]!.midi, 40);
    assert.ok((onsets[0]!.audioTime as number) >= 0);

    // Sustained quiet releases the note.
    const quiet = new Float32Array(ANALYSIS_SIZE);
    for (let i = 0; i < 40; i++) {
      processor.analyze(quiet, SR, t);
      t += hop;
    }
    const releases = messages.filter((m) => m.type === "cable-release");
    assert.equal(releases.length, 1);
  });

  test("no onset for silence or faint noise", () => {
    const { processor, messages } = makeProcessor();
    const hop = 256 / SR;
    let t = 0;
    for (let i = 0; i < 30; i++) {
      processor.analyze(new Float32Array(ANALYSIS_SIZE), SR, t);
      t += hop;
    }
    assert.equal(messages.filter((m) => m.type === "cable-onset").length, 0);
  });

  test("retrigger on a legato pitch change without silence", () => {
    const { processor, messages } = makeProcessor();
    const hop = 256 / SR;
    let t = 0;
    for (let i = 0; i < 12; i++) {
      processor.analyze(sine(82.41), SR, t);
      t += hop;
    }
    assert.equal(messages.filter((m) => m.type === "cable-onset").length, 1);
    // Slide up to A without a gap: release + new onset.
    for (let i = 0; i < 30; i++) {
      processor.analyze(sine(110), SR, t);
      t += hop;
    }
    const onsets = messages.filter((m) => m.type === "cable-onset");
    assert.equal(onsets.length, 2);
    assert.equal(onsets[1]!.midi, 45);
    assert.ok(messages.some((m) => m.type === "cable-release"));
  });

  test("emits throttled level messages", () => {
    const { processor, messages } = makeProcessor();
    for (let i = 0; i < 30; i++) processor.analyze(sine(110), SR, i * (256 / SR));
    const levels = messages.filter((m) => m.type === "cable-level");
    assert.ok(levels.length >= 1 && levels.length < 30);
    assert.ok((levels[0]!.rms as number) > 0.1);
  });

  test("reset clears a held note", () => {
    const { processor, messages } = makeProcessor();
    const hop = 256 / SR;
    let t = 0;
    for (let i = 0; i < 12; i++) {
      processor.analyze(sine(110), SR, t);
      t += hop;
    }
    assert.equal(messages.filter((m) => m.type === "cable-onset").length, 1);
    processor.handleMessage({ data: { type: "cable-reset" } });
    // After reset, the still-ringing note must not emit a release.
    for (let i = 0; i < 40; i++) {
      processor.analyze(new Float32Array(ANALYSIS_SIZE), SR, t);
      t += hop;
    }
    assert.equal(messages.filter((m) => m.type === "cable-release").length, 0);
  });
});

describe("calibrateLatency", () => {
  test("returns the median offset of matched taps", () => {
    const clicks = [1, 2, 3, 4, 5, 6, 7, 8];
    const onsets = clicks.map((c) => c + 0.042);
    const result = calibrateLatency(clicks, onsets);
    assert.ok(result);
    assert.ok(Math.abs(result.offsetMs - 42) < 1e-9);
    assert.equal(result.tapsMs.length, 8);
  });

  test("ignores stray onsets and unmatched clicks", () => {
    const clicks = [1, 2, 3, 4, 5];
    const onsets = [0.2, 1.05, 2.06, 3.04, 4.05, 9.9];
    const result = calibrateLatency(clicks, onsets);
    assert.ok(result);
    assert.equal(result.tapsMs.length, 4);
    assert.ok(result.offsetMs > 40 && result.offsetMs < 60);
  });

  test("median resists one wild tap", () => {
    const clicks = [1, 2, 3, 4, 5];
    const onsets = [1.04, 2.04, 3.2, 4.04, 5.04];
    const result = calibrateLatency(clicks, onsets);
    assert.ok(result);
    assert.ok(Math.abs(result.offsetMs - 40) < 15);
  });

  test("returns null with too few taps", () => {
    assert.equal(calibrateLatency([1, 2, 3], [1.05, 9.9]), null);
    assert.equal(calibrateLatency([], []), null);
  });
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("cable calibration storage", () => {
  test("round-trips a calibration record", () => {
    const storage = memoryStorage();
    const record = { deviceLabel: "USB Interface", offsetMs: 42.5, taps: 7, measuredAt: "2026-09-27T00:00:00Z" };
    assert.equal(saveCableCalibration(record, storage), true);
    assert.deepEqual(loadCableCalibration("USB Interface", storage), record);
    assert.equal(loadCableCalibration("Other Device", storage), null);
  });

  test("rejects corrupt or out-of-range records", () => {
    const storage = memoryStorage();
    storage.setItem("midi-stage/guitar-cable-calibration/v1", "not json");
    assert.equal(loadCableCalibration("x", storage), null);
    assert.equal(saveCableCalibration({ deviceLabel: "x", offsetMs: NaN, taps: 5, measuredAt: "" }, storage), false);
    assert.equal(saveCableCalibration({ deviceLabel: "x", offsetMs: 5000, taps: 5, measuredAt: "" }, storage), false);
    assert.equal(loadCableCalibration("x", memoryStorage()), null);
  });

  test("remembers the selected device", () => {
    const storage = memoryStorage();
    assert.equal(loadCableDeviceId(storage), "");
    assert.equal(saveCableDeviceId("abc123", storage), true);
    assert.equal(loadCableDeviceId(storage), "abc123");
  });
});
