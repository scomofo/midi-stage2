import type { SharedNote } from "./chart-format.ts";
import type { SongAudioSamples } from "./audio-import.ts";

export const MAX_DRUM_DRAFT_HITS = 6000;
const PITCHES = [36, 38, 42];

/** Timbral candidates, not source separation or an acoustic drum classifier. */
export function* detectDrumAttacks(buffer: SongAudioSamples): Generator<number, {
  notes: SharedNote[]; flux: Float64Array; hop: number; limited: boolean;
}> {
  const { sampleRate, length, numberOfChannels, duration } = buffer;
  const hopSize = Math.max(1, Math.round(sampleRate * 0.01));
  const hop = hopSize / sampleRate;
  const count = Math.ceil(length / hopSize);
  const bands = Array.from({ length: 3 }, () => new Float64Array(count));
  const channels = Math.min(2, numberOfChannels);
  const coefficients = [160, 3500, 6000].map((hz) => 1 - Math.exp(-2 * Math.PI * hz / sampleRate));
  for (let channel = 0; channel < channels; channel++) {
    const samples = buffer.getChannelData(channel);
    if (samples.length !== length) throw new Error("The decoded audio is incomplete. Please choose a different file.");
    const state = new Float64Array(7);
    for (let frame = 0; frame < count; frame++) {
      const start = frame * hopSize, end = Math.min(length, start + hopSize);
      const powers = [0, 0, 0];
      for (let i = start; i < end; i++) {
        const value = Number.isFinite(samples[i]) ? samples[i]! : 0;
        state[0] += coefficients[0]! * (value - state[0]!);
        state[1] += coefficients[0]! * (state[0]! - state[1]!);
        const midHigh = value - state[0]!;
        state[2] += coefficients[0]! * (midHigh - state[2]!);
        state[3] += coefficients[1]! * (midHigh - state[2]! - state[3]!);
        state[4] += coefficients[1]! * (state[3]! - state[4]!);
        state[5] += coefficients[2]! * (value - state[5]!);
        const high = value - state[5]!;
        state[6] += coefficients[2]! * (high - state[6]!);
        powers[0]! += state[1]! ** 2;
        powers[1]! += state[4]! ** 2;
        powers[2]! += (high - state[6]!) ** 2;
      }
      for (let band = 0; band < 3; band++) bands[band]![frame]! += powers[band]! / ((end - start) * channels);
      if ((frame + 1) % 24 === 0 || frame + 1 === count) yield 0.85 * (channel * count + frame + 1) / (channels * count);
    }
  }
  const peaks = bands.map((band) => {
    let peak = 0;
    for (let i = 0; i < band.length; i++) { band[i] = Math.sqrt(band[i]!); peak = Math.max(peak, band[i]!); }
    return peak;
  });
  const loudest = Math.max(...peaks);
  if (loudest < 0.0001) throw new Error("This song is silent or too quiet to analyze.");
  const flux = new Float64Array(count);
  const candidates: { frame: number; strength: number; band: number }[] = [];
  for (let bandIndex = 0; bandIndex < 3; bandIndex++) {
    if (peaks[bandIndex]! < loudest * 0.04) continue;
    const band = bands[bandIndex]!;
    const novelty = new Float64Array(count);
    const prefix = new Float64Array(count + 1);
    for (let frame = 0; frame < count; frame++) {
      const previous = Math.max(band[frame - 1] ?? 0, band[frame - 2] ?? 0, band[frame - 3] ?? 0, band[frame - 4] ?? 0);
      novelty[frame] = Math.max(0, band[frame]! - previous * 1.03) / peaks[bandIndex]!;
      prefix[frame + 1] = prefix[frame]! + novelty[frame]!;
      flux[frame]! += novelty[frame]!;
    }
    const radius = Math.round(0.25 / hop);
    for (let frame = 0; frame < count; frame++) {
      const strength = novelty[frame]!;
      const start = Math.max(0, frame - radius), end = Math.min(count, frame + radius + 1);
      const background = (prefix[end]! - prefix[start]!) / (end - start);
      if (strength < Math.max(0.1, background * 1.8) || strength < (novelty[frame - 1] ?? 0)
        || strength <= (novelty[frame + 1] ?? 0) || frame * hop + 0.02 > duration) continue;
      const low = bands[0]![frame]!, mid = bands[1]![frame]!, high = bands[2]![frame]!;
      if (bandIndex === 0 && low < mid * 1.2) continue;
      if (bandIndex === 1 && (mid < low * 0.3 || mid < high * 0.9)) continue;
      if (bandIndex === 2 && high < Math.max(0, mid - low * 0.3) * 1.2) continue;
      candidates.push({ frame, strength, band: bandIndex });
    }
    yield 0.85 + (bandIndex + 1) * 0.05;
  }
  // Suppress only within one drum family: simultaneous kick/hat targets survive.
  candidates.sort((a, b) => b.strength - a.strength || a.frame - b.frame || a.band - b.band);
  const blocked = Array.from({ length: 3 }, () => new Uint8Array(count));
  const chosen: typeof candidates = [];
  const gap = Math.ceil(0.09 / hop);
  let limited = false;
  for (const candidate of candidates) {
    if (blocked[candidate.band]![candidate.frame]) continue;
    if (chosen.length === MAX_DRUM_DRAFT_HITS) { limited = true; break; }
    chosen.push(candidate);
    blocked[candidate.band]!.fill(1, Math.max(0, candidate.frame - gap + 1), Math.min(count, candidate.frame + gap));
  }
  chosen.sort((a, b) => a.frame - b.frame || a.band - b.band);
  if (chosen.length < 3) throw new Error("Not enough distinct drum-like attacks were found. Try a clearer drum recording or use Rhythm mode.");
  return {
    notes: chosen.map(({ frame, strength, band }) => {
      const time = Math.round(frame * hop * 1e6) / 1e6;
      return { time, duration: Math.max(0.02, Math.min(0.06, duration - time)), pitch: PITCHES[band]!, velocity: Math.round(65 + 62 * Math.min(1, strength)) };
    }),
    flux, hop, limited,
  };
}
