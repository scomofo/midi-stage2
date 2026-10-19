import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SongAudioSamples } from "./audio-import.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";
import { verifyGuitarAttacks } from "./guitar-attack-verification.ts";

const ATTACK = 0.8;
const hz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);
const event = (pitchMidi: number, startTimeSeconds = ATTACK, durationSeconds = 0.3): KeyboardEvent =>
  ({ pitchMidi, startTimeSeconds, durationSeconds, amplitude: 0.8, hasOnset: true });
const events = () => [event(57, 0.2, 0.6), event(57), event(64)];
function source(wave: (time: number) => number, sampleRate = 22050, right?: (time: number) => number): SongAudioSamples {
  const channels = [wave, ...(right ? [right] : [])].map((fn) => Float32Array.from({ length: sampleRate * 2 }, (_, i) => fn(i / sampleRate)));
  return { sampleRate, length: channels[0]!.length, duration: 2, numberOfChannels: channels.length,
    getChannelData: (index) => channels[index]! };
}
function tone(time: number, pitch: number, start: number, amplitude = 0.5): number {
  const elapsed = time - start;
  return elapsed < 0 ? 0 : amplitude * Math.min(1, elapsed / 0.003) * Math.exp(-2 * elapsed) * Math.sin(2 * Math.PI * hz(pitch) * elapsed);
}
const decayWithPeer = (time: number) => tone(time, 57, 0.2) + tone(time, 64, ATTACK);

describe("guitar attack audio verification", () => {
  it("removes a decaying sustain retrigger without extending a hold or mutating input", async () => {
    for (const sampleRate of [8000, 22050, 48000, 192000]) {
      const input = events(), before = structuredClone(input);
      const result = await verifyGuitarAttacks(input, source(decayWithPeer, sampleRate));
      assert.deepEqual(result, [input[0], input[2]], `sample rate ${sampleRate}`);
      assert.deepEqual(input, before);
      assert.equal(result[0]!.durationSeconds, 0.6);
    }
  });

  it("keeps a real repeated attack alongside a different new pitch", async () => {
    const input = events();
    const wave = (time: number) => decayWithPeer(time) + tone(time, 57, ATTACK);
    assert.deepEqual(await verifyGuitarAttacks(input, source(wave)), input);
  });

  it("tolerates modest source detuning rather than mistaking it for missing energy", async () => {
    const input = events();
    for (const cents of [-30, 30]) {
      const wave = (time: number) => decayWithPeer(time * 2 ** (cents / 1200));
      assert.deepEqual(await verifyGuitarAttacks(input, source(wave)), [input[0], input[2]]);
    }
  });

  it("keeps a softer reattack after a dip even when its overall power falls", async () => {
    const input = events();
    const wave = (time: number) => (time < 0.77 ? tone(time, 57, 0.2, 0.9) : tone(time, 57, ATTACK, 0.12)) + tone(time, 64, ATTACK);
    assert.deepEqual(await verifyGuitarAttacks(input, source(wave)), input);
  });

  it("keeps uncertain repeats without a new neighboring pitch, and unknown onsets", async () => {
    const input = events();
    for (const hasOnset of [true, undefined]) {
      const repeated = { ...input[1]!, hasOnset };
      const alone = [input[0]!, repeated];
      assert.deepEqual(await verifyGuitarAttacks(alone, source((time) => tone(time, 57, 0.2))), alone);
      if (hasOnset === undefined) {
        const unknown = [input[0]!, repeated, input[2]!];
        assert.deepEqual(await verifyGuitarAttacks(unknown, source(decayWithPeer)), unknown);
      }
    }
  });

  it("requires a genuinely new peer rather than another steady sustain", async () => {
    const input = events();
    assert.deepEqual(await verifyGuitarAttacks(input, source((time) => tone(time, 57, 0.2) + tone(time, 64, 0.2))), input);
  });

  it("does not let a missing-fundamental octave guess act as the new-pitch witness", async () => {
    const input = [event(57, 0.2, 0.6), event(57), event(52)];
    const wave = (time: number) => tone(time, 57, 0.2) + tone(time, 64, ATTACK) + tone(time, 71, ATTACK);
    assert.deepEqual(await verifyGuitarAttacks(input, source(wave)), [input[0], input[2], input[1]]);
  });

  it("preserves chord tones and repeats separated from the preceding note", async () => {
    const chord = [event(57), event(64)];
    assert.deepEqual(await verifyGuitarAttacks(chord, source(decayWithPeer)), chord);
    const separated = [event(57, 0.2, 0.4), event(57), event(64)];
    assert.deepEqual(await verifyGuitarAttacks(separated, source(decayWithPeer)), separated);
  });

  it("keeps recording edges and notes without measurable source energy", async () => {
    for (const time of [0.05, 1.95]) {
      const input = [event(57, time - 0.02, 0.02), event(57, time), event(64, time)];
      assert.deepEqual(await verifyGuitarAttacks(input, source(decayWithPeer)), input);
    }
    const input = events();
    assert.deepEqual(await verifyGuitarAttacks(input, source(() => 0)), input);
  });

  it("checks stereo channels independently, including opposite polarity and a panned soft repeat", async () => {
    const input = events();
    const inverted = source(decayWithPeer, 48000, (time) => -decayWithPeer(time));
    assert.deepEqual(await verifyGuitarAttacks(input, inverted), [input[0], input[2]]);
    const right = (time: number) => tone(time, 57, ATTACK, 0.08);
    assert.deepEqual(await verifyGuitarAttacks(input, source(decayWithPeer, 48000, right)), input);
  });

  it("honors cancellation before and during cooperative processing", async () => {
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(verifyGuitarAttacks(events(), source(decayWithPeer), cancelled.signal), { name: "AbortError" });
    const controller = new AbortController();
    const many = Array.from({ length: 1000 }, (_, i) => event(57 + i % 8, 0.2 + i / 1000, 0.001));
    const pending = verifyGuitarAttacks(many, source(decayWithPeer), controller.signal);
    setTimeout(() => controller.abort(), 0);
    await assert.rejects(pending, { name: "AbortError" });
  });
});
