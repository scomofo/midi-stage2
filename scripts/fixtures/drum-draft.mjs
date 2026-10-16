// Original deterministic percussion with known event times, shared by unit and browser QA.
export function drumFixture(sampleRate = 44100, channels = 1) {
  const duration = 8;
  const events = [
    ...Array.from({ length: 7 }, (_, i) => ({ time: 0.3 + i, pitch: 36 })),
    ...Array.from({ length: 7 }, (_, i) => ({ time: 0.8 + i, pitch: 38 })),
    ...Array.from({ length: 28 }, (_, i) => ({ time: 0.3 + i * 0.25, pitch: 42 })),
  ].sort((a, b) => a.time - b.time || a.pitch - b.pitch);
  const data = new Float32Array(Math.round(duration * sampleRate));
  let seed = 7529;
  for (const event of events) {
    const start = Math.round(event.time * sampleRate);
    for (let i = 0; i < sampleRate * 0.3 && start + i < data.length; i++) {
      const t = i / sampleRate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      const signal = event.pitch === 36 ? 0.7 * Math.sin(2 * Math.PI * 65 * t) * Math.exp(-t / 0.06)
        : event.pitch === 38 ? (noise * 0.55 + Math.sin(2 * Math.PI * 190 * t) * 0.25) * Math.exp(-t / 0.035)
        : 0.17 * (Math.sin(2 * Math.PI * 7100 * t) + Math.sin(2 * Math.PI * 8500 * t) + Math.sin(2 * Math.PI * 9700 * t)) * Math.exp(-t / 0.015);
      data[start + i] += signal * Math.min(1, t / 0.0005);
    }
  }
  const buffers = Array.from({ length: channels }, (_, i) => i % 2 ? Float32Array.from(data, n => -n) : data.slice());
  return { duration, sampleRate, length: data.length, numberOfChannels: channels,
    /** @param {number} i */ getChannelData: i => buffers[i], events };
}

export function stemPairFixture() {
  const source = drumFixture();
  const sampleRate = source.sampleRate;
  const stem = new Float32Array(9 * sampleRate);
  stem.set(source.getChannelData(0), sampleRate);
  const backing = new Float32Array(10 * sampleRate);
  backing.set(stem);
  // A separate bass attack in the full mix must not enter the isolated drum chart.
  for (let i = 0; i < sampleRate * 0.3; i++) {
    const t = i / sampleRate;
    backing[Math.round(0.3 * sampleRate) + i] += 0.7 * Math.sin(2 * Math.PI * 65 * t) * Math.exp(-t / 0.06);
  }
  /** @param {Float32Array<ArrayBuffer>} data */
  const buffer = (data) => ({ sampleRate, duration: data.length / sampleRate, length: data.length, numberOfChannels: 1,
    /** @param {number} index */
    getChannelData(index) { if (index !== 0) throw new RangeError("Only one fixture channel exists."); return data; },
  });
  return { backing: buffer(backing), stem: buffer(stem) };
}

export function drumWav(source = drumFixture()) {
  const samples = source.getChannelData(0);
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(source.sampleRate, 24); wav.writeUInt32LE(source.sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, i) => wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2));
  return wav;
}
