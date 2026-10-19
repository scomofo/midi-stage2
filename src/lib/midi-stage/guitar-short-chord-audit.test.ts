import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { KeyboardEvent } from "./keyboard-draft.ts";
import { auditShortChordCandidates } from "./guitar-short-chord-audit.ts";

const event = (pitchMidi: number, amplitude = 0.35): KeyboardEvent => ({
  pitchMidi, startTimeSeconds: 0.2, durationSeconds: 0.09, amplitude, hasOnset: true,
});
function audio(pitches: number[]) {
  const sampleRate = 16000;
  const data = Float32Array.from({ length: sampleRate }, (_, i) => {
    const time = i / sampleRate;
    if (time < 0.2 || time > 0.29) return 0;
    return pitches.reduce((sum, pitch) =>
      sum + 0.75 * Math.sin(2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) * (time - 0.2)), 0);
  });
  return { sampleRate, duration: 1, length: data.length, numberOfChannels: 1, getChannelData: () => data };
}
describe("short chord diagnostic candidates", () => {
  it("flags an audio-supported, weak simultaneous model tone without inserting it", () => {
    const strong = event(40, 0.9);
    const weak = event(45);
    const input = [strong, weak];
    const accepted = [strong];
    const candidates = auditShortChordCandidates(input, accepted, audio([40, 45]));
    assert.deepEqual(candidates.map((note) => note.pitchMidi), [45]);
    assert.equal(accepted.length, 1);
  });
  it("does not invent missing model pitches or octave harmonics", () => {
    const strong = event(40, 0.9);
    assert.deepEqual(auditShortChordCandidates([strong], [strong], audio([40, 45])), []);
    assert.deepEqual(auditShortChordCandidates([strong, event(52)], [strong], audio([40, 52])), []);
  });
  it("requires a coincident accepted attack and supporting audio", () => {
    const strong = event(40, 0.9), weak = event(45);
    assert.deepEqual(auditShortChordCandidates([strong, weak], [strong], audio([40])), []);
    assert.deepEqual(auditShortChordCandidates([weak], [], audio([45])), []);
  });
});
