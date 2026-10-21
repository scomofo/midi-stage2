/** Streaming WSOLA: natural-rate grains joined by waveform similarity.
 * One alignment decision is shared by every channel of every stem. This keeps
 * stereo phase and stem relationships intact, including muted tracks. Input
 * PCM is borrowed; only the next small output block is allocated.
 */
export class PitchStretch {
  readonly hop: number;
  readonly radius: number;
  readonly length: number;
  readonly trackLengths: number[];
  cursor = 0;
  private previous: number | null = null;
  readonly tracks: Float32Array[][];
  readonly sampleRate: number;
  readonly speed: number;
  readonly sourceStart: number;
  private readonly sourceEnd: number;

  constructor(
    tracks: Float32Array[][],
    sampleRate: number,
    speed: number,
    sourceStart: number,
    sourceDuration: number,
  ) {
    if (!Number.isFinite(speed) || speed < 0.5 || speed > 1.25
      || !Number.isFinite(sampleRate) || sampleRate < 8000
      || !Number.isFinite(sourceStart) || sourceStart < 0
      || !Number.isFinite(sourceDuration) || sourceDuration < 0) throw new Error("Invalid practice audio range or tempo.");
    this.tracks = tracks;
    this.sampleRate = sampleRate;
    this.speed = speed;
    this.sourceStart = sourceStart;
    this.sourceEnd = Math.round((sourceStart + sourceDuration) * sampleRate);
    this.hop = Math.round(sampleRate * 0.025);
    this.radius = Math.round(sampleRate * 0.012);
    this.trackLengths = tracks.map(channels => Math.max(0, Math.round(Math.min(sourceDuration,
      (channels[0]?.length ?? 0) / sampleRate - sourceStart) * sampleRate / speed)));
    this.length = Math.max(0, ...this.trackLengths);
  }

  /** Recover after a stalled scheduler without playing a backlog or drifting. */
  skipTo(frame: number) {
    this.cursor = Math.min(this.length, Math.max(this.cursor, Math.ceil(frame / this.hop) * this.hop));
    this.previous = null;
  }

  private sample(channel: Float32Array, index: number) {
    // A grain may reach beyond its nominal position. Never borrow audio from
    // the following passage, even during a crossfade at a slowed boundary.
    return index < this.sourceEnd ? channel[index] ?? 0 : 0;
  }

  private alignment(expected: number) {
    if (this.previous === null) return expected;
    const tail = this.previous + this.hop;
    const stride = Math.max(1, Math.floor(this.hop / 128));
    // Joint multichannel correlation: summing PCM would cancel inverted stereo,
    // and aligning only the loudest stem could damage the quieter instruments.
    const references: Float32Array[] = [];
    let energy = 0;
    for (const channels of this.tracks) for (const channel of channels) {
      let sum = 0;
      for (let i = 0; i < this.hop; i += stride) sum += this.sample(channel, tail + i) ** 2;
      if (sum > 1e-9) { energy += sum; references.push(channel); }
    }
    if (!references.length) return expected;
    let best = expected, bestScore = -Infinity;
    const first = Math.max(Math.round(this.sourceStart * this.sampleRate), expected - this.radius);
    const last = expected + this.radius;
    const score = (at: number) => {
      let dot = 0, power = 0;
      for (const reference of references) for (let i = 0; i < this.hop; i += stride) {
        const a = this.sample(reference, tail + i), b = this.sample(reference, at + i);
        dot += a * b; power += b * b;
      }
      // A tiny distance penalty resolves periodic ties without cumulative drift.
      return dot / Math.sqrt(energy * power + 1e-20) - Math.abs(at - expected) * 1e-8;
    };
    // Coarse then sample-resolution search avoids quadratic full-rate work.
    for (let at = first; at <= last; at += 4) {
      const value = score(at);
      if (value > bestScore) { bestScore = value; best = at; }
    }
    const coarse = best;
    for (let at = Math.max(first, coarse - 3); at <= Math.min(last, coarse + 3); at++) {
      const value = score(at);
      if (value > bestScore) { bestScore = value; best = at; }
    }
    return best;
  }

  render() {
    const start = this.cursor;
    const count = Math.min(this.hop * 8, this.length - start);
    if (count <= 0) return null;
    const tracks = this.tracks.map((channels, track) => channels.map(() =>
      new Float32Array(Math.max(0, Math.min(count, this.trackLengths[track]! - start)))));
    for (let out = 0; out < count; out += this.hop) {
      const expected = Math.round(this.sourceStart * this.sampleRate + (start + out) * this.speed);
      const at = this.alignment(expected);
      for (let t = 0; t < tracks.length; t++) for (let c = 0; c < tracks[t]!.length; c++) {
        const input = this.tracks[t]![c]!, output = tracks[t]![c]!;
        const size = Math.min(this.hop, output.length - out);
        for (let i = 0; i < size; i++) {
          const next = this.sample(input, at + i);
          const weight = i / this.hop;
          output[out + i] = this.previous === null ? next
            : this.sample(input, this.previous + this.hop + i) * (1 - weight) + next * weight;
        }
      }
      this.previous = at;
    }
    this.cursor += count;
    return { start, tracks };
  }
}
