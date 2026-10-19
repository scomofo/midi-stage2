import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SongAudioSamples } from "./audio-import.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";
import { recoverGuitarShortNotes } from "./guitar-short-note-recovery.ts";
import { makeGuitarDraft, type GuitarEvent } from "./guitar-draft.ts";

const pitches = [40, 43, 45];
const times = [0.2, 0.5, 0.8];
const hz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);
const witnesses = (): KeyboardEvent[] => pitches.map((pitchMidi, i) => ({ pitchMidi: pitchMidi + 19,
  startTimeSeconds: times[i]! + 0.02, durationSeconds: 0.06, amplitude: 0.34, hasOnset: true }));
function pluck(time: number, pitch: number, start: number, length = 0.1): number {
  const t = time - start;
  if (t < 0 || t >= length) return 0;
  const envelope = Math.min(1, t / 0.003, (length - t) / 0.008);
  const phase = 2 * Math.PI * hz(pitch) * t;
  return envelope * (0.35 * Math.sin(phase) + 0.1 * Math.sin(2 * phase) + 0.6 * Math.sin(3 * phase));
}
const riff = (time: number) => pitches.reduce((sum, pitch, i) => sum + pluck(time, pitch, times[i]!), 0);
function source(wave: (time: number) => number, sampleRate = 22050, right?: (time: number) => number): SongAudioSamples {
  const channels = [wave, ...(right ? [right] : [])].map((fn) => Float32Array.from({ length: Math.round(sampleRate * 1.4) }, (_, i) => fn(i / sampleRate)));
  return { sampleRate, duration: 1.4, length: channels[0]!.length, numberOfChannels: channels.length, getChannelData: (i) => channels[i]! };
}
describe("brief guitar attack recovery", () => {
  it("recovers fundamentals from independently periodic short attacks and weak harmonic witnesses", async () => {
    for (const rate of [8000, 22050, 48000, 192000]) {
      const input = witnesses(), before = structuredClone(input), buffer = source(riff, rate);
      const samples = buffer.getChannelData(0).slice();
      const output = await recoverGuitarShortNotes(input, buffer);
      const added = output.filter((event) => event.shortAttackVerified);
      assert.deepEqual(added.map((event) => event.pitchMidi), pitches, `sample rate ${rate}`);
      added.forEach((event, i) => {
        assert.ok(Math.abs(event.startTimeSeconds - times[i]!) < 0.025);
        assert.ok(event.durationSeconds >= 0.035 && event.durationSeconds < 0.13);
        assert.equal(event.amplitude, 0.5, "recovered notes remain visibly uncertain");
      });
      assert.deepEqual(input, before);
      assert.deepEqual(buffer.getChannelData(0), samples);
    }
  });
  it("retains existing accepted attacks without adding duplicates or replacing their holds", async () => {
    const input = pitches.map((pitchMidi, i) => ({ pitchMidi, startTimeSeconds: times[i]!, durationSeconds: 0.09, amplitude: 0.8, hasOnset: true }));
    assert.deepEqual(await recoverGuitarShortNotes(input, source(riff)), input);
  });
  it("requires onset-backed model evidence rather than turning arbitrary transients into notes", async () => {
    assert.deepEqual(await recoverGuitarShortNotes([], source(riff)), []);
    const input = witnesses().map((event) => ({ ...event, hasOnset: undefined }));
    assert.deepEqual(await recoverGuitarShortNotes(input, source(riff)), input);
  });
  it("keeps long decays and recording-edge releases outside short-note recovery", async () => {
    const input = witnesses().slice(0, 1);
    assert.deepEqual(await recoverGuitarShortNotes(input, source((time) => pluck(time, 40, 0.2, 0.5))), input);
    const edge = [{ ...input[0]!, startTimeSeconds: 1.32 }];
    assert.deepEqual(await recoverGuitarShortNotes(edge, source((time) => pluck(time, 40, 1.3, 0.2))), edge);
  });
  it("rejects a missing-fundamental combination instead of inventing a lower note", async () => {
    const input = [{ ...witnesses()[0]!, pitchMidi: 64 }];
    const wave = (time: number) => {
      const t = time - 0.2;
      return t < 0 || t > 0.1 ? 0 : Math.min(1, t / 0.003, (0.1 - t) / 0.008)
        * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 330 * t));
    };
    assert.equal((await recoverGuitarShortNotes(input, source(wave))).filter((event) => event.shortAttackVerified && event.pitchMidi === 45).length, 0);
  });
  it("checks original stereo channels without cancelling opposite-polarity notes", async () => {
    const added = (await recoverGuitarShortNotes(witnesses(), source(riff, 48000, (time) => -riff(time))))
      .filter((event) => event.shortAttackVerified);
    assert.deepEqual(added.map((event) => event.pitchMidi), pitches);
  });
  it("handles silence and cooperative cancellation without altering the model events", async () => {
    const input = witnesses();
    assert.deepEqual(await recoverGuitarShortNotes(input, source(() => 0)), input);
    const controller = new AbortController();
    const pending = recoverGuitarShortNotes(input, source(riff, 192000), controller.signal);
    setTimeout(() => controller.abort(), 0);
    await assert.rejects(pending, { name: "AbortError" });
    controller.abort();
    await assert.rejects(recoverGuitarShortNotes(input, source(riff), controller.signal), { name: "AbortError" });
  });
  it("admits shorter events only when independent audio evidence explicitly verified them", () => {
    const event: GuitarEvent = { pitchMidi: 40, startTimeSeconds: 0.2, durationSeconds: 0.055, amplitude: 0.5, hasOnset: true };
    assert.throws(() => makeGuitarDraft([event], 1.4, "short.wav", "short"), /No playable guitar notes/);
    const chart = makeGuitarDraft([{ ...event, shortAttackVerified: true }], 1.4, "short.wav", "short").chart;
    const note = chart.parts.find((part) => part.type === "guitar")!.notes[0]!;
    assert.equal(note.duration, 0.055);
    assert.equal(note.confidence, 0.5);
    assert.throws(() => makeGuitarDraft([{ ...event, durationSeconds: 0.02, shortAttackVerified: true }], 1.4, "short.wav", "short"), /No playable guitar notes/);
  });
});
