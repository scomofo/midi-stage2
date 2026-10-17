import { drumFixture } from "./drum-draft.mjs";
import { keyboardFixture } from "./keyboard-draft.mjs";

/** Original known sources: this exercises integration, not real-song accuracy. */
export function fullBandFixture() {
  const drums = drumFixture(), keys = keyboardFixture(), guitar = keyboardFixture();
  const bass = keyboardFixture(44100, 1, [
    { pitch: 40, time: 0.6, duration: 0.8 },
    { pitch: 43, time: 2, duration: 0.5 },
    { pitch: 45, time: 3, duration: 0.6 },
  ]);
  const samples = new Float32Array(drums.sampleRate * 10);
  for (const source of [drums, keys, guitar, bass]) {
    const data = source.getChannelData(0);
    for (let i = 0; i < data.length; i++) samples[i] += data[i] * 0.4;
  }
  // Original-only attack: this must not appear in any isolated instrument part.
  for (let i = 0; i < drums.sampleRate * 0.2; i++) {
    const t = i / drums.sampleRate;
    samples[Math.round(9.2 * drums.sampleRate) + i] += 0.3 * Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t / 0.04);
  }
  return { drums, keys, guitar, bass, backing: {
    duration: 10, sampleRate: drums.sampleRate, length: samples.length, numberOfChannels: 1,
    getChannelData: () => samples,
  } };
}
