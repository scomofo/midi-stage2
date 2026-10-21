import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PitchStretch } from "./pitch-stretch.ts";

const rate = 44100;
const tone = (hz: number, seconds = 2) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => 0.4 * Math.sin(2 * Math.PI * hz * i / rate));
function render(tracks: Float32Array[][], speed: number, start = 0, duration = 2) {
  const processor = new PitchStretch(tracks, rate, speed, start, duration);
  const output = tracks.map((channels, t) => channels.map(() => new Float32Array(processor.trackLengths[t]!)));
  let block;
  while ((block = processor.render())) block.tracks.forEach((channels, t) => channels.forEach((data, c) => { if (data.length) output[t]![c]!.set(data, block!.start); }));
  return output;
}
function pitch(data: Float32Array) {
  // Positive zero crossings estimate the actual output frequency, independent
  // from the stretcher's window selection or nominal playback metadata.
  const first = Math.round(rate * 0.2), last = Math.min(data.length - 1, Math.round(rate * 1.5));
  let crossings = 0;
  for (let i = first; i < last; i++) if (data[i]! <= 0 && data[i + 1]! > 0) crossings++;
  return crossings * rate / (last - first);
}

describe("pitch-preserving practice PCM", () => {
  for (const speed of [0.5, 0.75, 1.25]) for (const hz of [55, 220, 440, 880]) {
    it(`preserves ${hz} Hz at ${speed * 100}% with the exact requested duration`, () => {
      const data = render([[tone(hz)]], speed)[0]![0]!;
      assert.equal(data.length, Math.round(2 * rate / speed));
      assert.ok(Math.abs(pitch(data) - hz) < 2, `${pitch(data)} Hz instead of ${hz}`);
      let maxJump = 0;
      for (let i = 1; i < data.length; i++) maxJump = Math.max(maxJump, Math.abs(data[i]! - data[i - 1]!));
      assert.ok(maxJump < 0.1, `discontinuity: ${maxJump}`);
    });
  }
  it("uses identical alignment for stereo, inverted channels and separate stems", () => {
    const data = tone(220), inverted = Float32Array.from(data, value => -value);
    const output = render([[data, inverted], [data]], 0.75);
    assert.deepEqual(output[0]![0], output[1]![0]);
    for (let i = 0; i < output[0]![0]!.length; i++) assert.ok(Math.abs(output[0]![0]![i]! + output[0]![1]![i]!) < 1e-7);
  });
  it("preserves a four-stem stereo arrangement with different pitches", () => {
    const frequencies = [55, 220, 330, 440];
    const tracks = frequencies.map(hz => { const data = tone(hz); return [data, Float32Array.from(data, value => -value)]; });
    for (const speed of [0.5, 0.75, 1.25]) {
      const output = render(tracks, speed);
      output.forEach((channels, index) => {
        assert.ok(Math.abs(pitch(channels[0]!) - frequencies[index]!) < 2);
        for (let i = 0; i < channels[0]!.length; i++) assert.ok(Math.abs(channels[0]![i]! + channels[1]![i]!) < 1e-7);
      });
    }
  });
  it("keeps late attacks on the scaled timeline without accumulated drift", () => {
    const data = new Float32Array(rate * 30);
    for (const second of [1, 10, 29]) for (let i = 0; i < rate * 0.04; i++) data[second * rate + i] = 0.7 * Math.sin(i * 2 * Math.PI * 220 / rate);
    for (const speed of [0.5, 0.75, 1.25]) {
      const result = render([[data]], speed, 0, 30)[0]![0]!;
      for (const second of [1, 10, 29]) {
        const expected = second / speed;
        let onset = -1;
        for (let i = Math.floor((expected - 0.08) * rate); i < (expected + 0.08) * rate; i++) if (Math.abs(result[i]!) > 0.1) { onset = i / rate; break; }
        assert.ok(onset > 0 && Math.abs(onset - expected) < 0.05, `attack ${second}s at ${speed}: ${onset} vs ${expected}`);
      }
    }
  });
  it("starts nonzero passages at the requested source sample, clips their ends and omits ended stems", () => {
    const long = tone(440, 4), short = tone(220, 1);
    const output = render([[long], [short]], 0.75, 2.3, 0.8);
    assert.equal(output[0]![0]!.length, Math.round(0.8 * rate / 0.75));
    assert.equal(output[0]![0]![0], long[Math.round(2.3 * rate)]);
    assert.equal(output[1]![0]!.length, 0);
  });
  it("handles silence, tiny files and unequal lengths without NaNs or repeated tails", () => {
    const output = render([[new Float32Array(rate * 2)], [new Float32Array(17)]], 0.5);
    assert.equal(output[1]![0]!.length, 34);
    assert.ok(output.every(channels => channels.every(channel => channel.every(value => value === 0))));
    assert.equal(new PitchStretch([], rate, 0.75, 0, 2).render(), null);
  });
  it("never borrows audible samples from outside the chosen passage", () => {
    const data = tone(440, 3);
    data.fill(0, rate, 2 * rate);
    for (const speed of [0.5, 0.75, 1.25]) {
      const output = render([[data]], speed, 1, 1)[0]![0]!;
      assert.ok(output.every(value => value === 0), `neighboring audio leaked at ${speed}`);
    }
  });
  it("recovers from a stalled scheduler at the current timeline and validates tempos", () => {
    const processor = new PitchStretch([[tone(220)]], rate, 0.75, 0, 2);
    processor.render(); processor.skipTo(rate);
    assert.ok(processor.render()!.start >= rate);
    for (const speed of [0, -1, NaN, Infinity, 2]) assert.throws(() => new PitchStretch([], rate, speed, 0, 2));
  });
});
