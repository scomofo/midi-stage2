// Original controlled chord/melody. Acceptance results do not measure real-song accuracy.
export function keyboardFixture(sampleRate = 44100, channels = 1) {
  const duration = 4;
  const events = [
    { pitch: 60, time: 0.6, duration: 0.8 }, { pitch: 64, time: 0.6, duration: 0.8 },
    { pitch: 67, time: 0.6, duration: 0.8 }, { pitch: 67, time: 2, duration: 0.5 }, { pitch: 72, time: 3, duration: 0.6 },
  ];
  const samples = new Float32Array(Math.round(duration * sampleRate));
  for (const event of events) {
    const hz = 440 * 2 ** ((event.pitch - 69) / 12);
    for (let i = 0; i < event.duration * sampleRate; i++) {
      const t = i / sampleRate;
      const envelope = Math.min(1, t / 0.006) * Math.min(1, (event.duration - t) / 0.04) * Math.exp(-t / 1.1);
      for (let h = 1; h <= 5; h++) samples[Math.round(event.time * sampleRate) + i] += 0.12 * envelope * Math.sin(2 * Math.PI * hz * h * t) / (h * h);
    }
  }
  const data = Array.from({ length: channels }, (_, i) => i % 2 ? Float32Array.from(samples, (n) => -n) : samples.slice());
  return { duration, sampleRate, length: samples.length, numberOfChannels: channels,
    /** @param {number} index */ getChannelData: (index) => data[index], events };
}

export function keyboardPairFixture() {
  const stem = keyboardFixture();
  const data = new Float32Array(stem.sampleRate * 6);
  data.set(stem.getChannelData(0));
  for (let i = 0; i < stem.sampleRate * 0.25; i++) {
    const t = i / stem.sampleRate;
    data[Math.round(0.2 * stem.sampleRate) + i] += 0.3 * Math.sin(2 * Math.PI * 65 * t) * Math.exp(-t / 0.05);
  }
  return { stem, backing: { sampleRate: stem.sampleRate, duration: 6, length: data.length, numberOfChannels: 1,
    /** @param {number} index */ getChannelData(index) { if (index !== 0) throw new RangeError("Only one fixture channel exists."); return data; },
  } };
}
