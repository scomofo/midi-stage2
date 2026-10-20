import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { KeyboardEvent } from "./keyboard-draft.ts";
import { auditShortChordCandidates } from "./guitar-short-chord-audit.ts";

const event = (pitchMidi: number, amplitude = 0.35): KeyboardEvent => ({
  pitchMidi, startTimeSeconds: 0.2, durationSeconds: 0.09, amplitude, hasOnset: true,
});
function audio(pitches: number[], sampleRate = 16000, right?: number[]) {
  const channels = [pitches, ...(right ? [right] : [])].map((notes) => Float32Array.from({ length: sampleRate }, (_, i) => {
    const time = i / sampleRate;
    if (time < 0.2 || time >= 0.29) return 0;
    return notes.reduce((sum, pitch) => sum + 0.4 * Math.sin(2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) * (time - 0.2)), 0);
  }));
  return { sampleRate, duration: 1, length: sampleRate, numberOfChannels: channels.length, getChannelData: (index: number) => channels[index]! };
}
const pitches = async (...args: Parameters<typeof auditShortChordCandidates>) => (await auditShortChordCandidates(...args)).candidates.map((note) => note.pitchMidi);

describe("short chord diagnostic candidates", () => {
  it("flags the low, brief simultaneous tone without mutating either event list", async () => {
    const strong = event(40, 0.9), weak = event(45), input = [strong, weak], accepted = [strong];
    const before = structuredClone({ input, accepted });
    for (const sampleRate of [8000, 16000, 44100, 96000, 192000]) {
      assert.deepEqual(await pitches(input, accepted, audio([40, 45], sampleRate)), [45], `sample rate ${sampleRate}`);
    }
    assert.deepEqual({ input, accepted }, before);
  });
  it("does not invent model pitches, duplicate accepted attacks or common octave harmonics", async () => {
    const strong = event(40, 0.9);
    assert.deepEqual(await pitches([strong], [strong], audio([40, 45])), []);
    assert.deepEqual(await pitches([strong, event(52)], [strong], audio([40, 52])), []);
    assert.deepEqual(await pitches([strong, event(45)], [strong, event(45, 0.3)], audio([40, 45])), []);
    const candidates = await auditShortChordCandidates([event(45), event(45)], [strong], audio([40, 45]));
    assert.equal(candidates.candidates.length, 1); assert.equal(candidates.limited, false);
    assert.equal(candidates.candidates[0]!.id, "short-chord:200000:45");
  });
  it("requires a coincident accepted attack, a local pitch peak and audible support", async () => {
    const strong = event(40, 0.9), weak = event(45);
    assert.deepEqual(await pitches([strong, weak], [strong], audio([40])), []);
    assert.deepEqual(await pitches([strong, weak], [strong], audio([40, 44])), []);
    assert.deepEqual(await pitches([strong, weak], [strong], audio([40, 46])), []);
    assert.deepEqual(await pitches([weak], [], audio([45])), []);
    assert.deepEqual(await pitches([weak], [{ ...strong, startTimeSeconds: 0.1 }], audio([40, 45])), []);
  });
  it("checks stereo channels independently, including right-only and opposite-phase tones", async () => {
    const strong = event(40, 0.9), weak = event(45);
    assert.deepEqual(await pitches([weak], [strong], audio([40], 16000, [45])), [45]);
    const source = audio([40, 45], 16000, [40, 45]);
    const right = source.getChannelData(1); for (let i = 0; i < right.length; i++) right[i] *= -1;
    assert.deepEqual(await pitches([weak], [strong], source), [45]);
  });
  it("rejects incomplete edge windows and malformed events", async () => {
    const strong = event(40, 0.9), weak = event(45);
    for (const invalid of [{ ...weak, startTimeSeconds: NaN }, { ...weak, pitchMidi: 45.1 }, { ...weak, durationSeconds: -1 }, { ...weak, amplitude: NaN }]) {
      assert.deepEqual(await pitches([invalid], [strong], audio([40, 45])), []);
    }
    assert.deepEqual(await pitches([{ ...weak, startTimeSeconds: 0.95, durationSeconds: 0.04 }], [{ ...strong, startTimeSeconds: 0.95 }], audio([40, 45])), []);
  });
  it("caps expensive spectral work and observes cancellation after audio analysis begins", async () => {
    const sampleRate = 192000, duration = 12;
    const data = Float32Array.from({ length: sampleRate * duration }, (_, i) =>
      0.4 * Math.sin(2 * Math.PI * 110 * i / sampleRate) + 0.3 * Math.sin(2 * Math.PI * 82.406889 * i / sampleRate));
    const weak = Array.from({ length: 140 }, (_, i) => ({ ...event(45), startTimeSeconds: 0.2 + i * 0.08 }));
    const strong = weak.map((note) => ({ ...note, pitchMidi: 40, amplitude: 0.9 }));
    const source = { sampleRate, duration, length: data.length, numberOfChannels: 1, getChannelData: () => data };
    const result = await auditShortChordCandidates(weak, strong, source);
    assert.ok(result.candidates.length > 0 && result.candidates.length <= 128); assert.equal(result.limited, true);
    const controller = new AbortController(); let began = false;
    await assert.rejects(auditShortChordCandidates(weak, strong, { ...source, getChannelData: () => {
      began = true; setTimeout(() => controller.abort(), 0); return data;
    } }, controller.signal), { name: "AbortError" });
    assert.equal(began, true, "cancellation arrives after the initial task boundary");
  });
  it("reports bounded audits and yields so a scheduled cancellation is observed", async () => {
    const strong = event(40, 0.9), weak = event(45);
    const result = await auditShortChordCandidates(Array(24001).fill(weak), Array(24001).fill(strong), audio([40, 45]));
    assert.equal(result.limited, true);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 0);
    const pending = auditShortChordCandidates(Array.from({ length: 24000 }, (_, i) => ({ ...weak, startTimeSeconds: i / 100 })),
      Array.from({ length: 24000 }, (_, i) => ({ ...strong, startTimeSeconds: i / 100 })), audio([40, 45]), controller.signal);
    await assert.rejects(pending, { name: "AbortError" });
    await assert.rejects(auditShortChordCandidates([weak], [strong], audio([40, 45]), controller.signal), { name: "AbortError" });
  });
});
