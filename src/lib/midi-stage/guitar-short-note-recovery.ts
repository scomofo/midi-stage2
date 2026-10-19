import type { SongAudioSamples } from "./audio-import.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";
import type { GuitarEvent } from "./guitar-draft.ts";

const RATE = 8000;
const HOP = 20;
const ENVELOPE_WINDOW = 160;
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Song import was cancelled.", "AbortError");
}
async function analysisChannels(buffer: SongAudioSamples, signal?: AbortSignal): Promise<Float32Array[]> {
  const channels: Float32Array[] = [];
  const coefficient = 1 - Math.exp(-2 * Math.PI * 600 / buffer.sampleRate);
  for (let channel = 0; channel < Math.min(2, buffer.numberOfChannels); channel++) {
    const input = buffer.getChannelData(channel);
    const output = new Float32Array(Math.floor(input.length * RATE / buffer.sampleRate));
    const state = new Float64Array(4);
    let next = 0;
    for (let i = 0; i < input.length; i++) {
      const value = Number.isFinite(input[i]) ? input[i]! : 0;
      state[0]! += coefficient * (value - state[0]!);
      for (let j = 1; j < state.length; j++) state[j]! += coefficient * (state[j - 1]! - state[j]!);
      if (i >= next * buffer.sampleRate / RATE && next < output.length) output[next++] = state[3]!;
      if (i % 65536 === 0) { await yieldTask(); cancelled(signal); }
    }
    channels.push(output);
  }
  return channels;
}
function fundamentalPower(signal: Float32Array, hz: number): number {
  const coefficient = 2 * Math.cos(2 * Math.PI * hz / RATE);
  let a = 0, b = 0;
  for (let i = 0; i < signal.length; i++) {
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (signal.length - 1));
    const next = signal[i]! * window + coefficient * a - b;
    b = a; a = next;
  }
  return Math.max(0, a * a + b * b - coefficient * a * b);
}

/** A short transient needs a distinct period and audible fundamental, not just a loud upper partial. */
function shortPitch(samples: Float32Array, start: number, end: number): number | null {
  const offset = Math.round(start * RATE);
  const signal = samples.subarray(offset, Math.min(offset + 640, Math.round(end * RATE)));
  if (signal.length < 240) return null;
  const maxLag = 102, length = signal.length - maxLag;
  const difference = new Float64Array(maxLag + 1);
  let sum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let value = 0;
    for (let i = 0; i < length; i++) value += (signal[i]! - signal[i + lag]!) ** 2;
    sum += value;
    difference[lag] = sum ? value * lag / sum : 1;
  }
  const valleys: number[] = [];
  for (let lag = 24; lag < maxLag; lag++) {
    if (difference[lag]! < difference[lag - 1]! && difference[lag]! <= difference[lag + 1]!) valleys.push(lag);
  }
  const minimum = Math.min(...valleys.map((lag) => difference[lag]!));
  if (minimum > 0.25) return null;
  const lag = valleys.find((lag) => difference[lag]! <= minimum + 0.015);
  if (lag === undefined || signal.length < 3 * lag) return null;
  // Repeated full periods are expected. Competing non-integer periods are not.
  if (valleys.some((other) => difference[other]! < minimum + 0.12
    && Math.abs(other / lag - Math.round(other / lag)) > 0.08)) return null;
  const shift = (difference[lag - 1]! - difference[lag + 1]!)
    / (2 * (difference[lag - 1]! - 2 * difference[lag]! + difference[lag + 1]!));
  const midi = 69 + 12 * Math.log2(RATE / (lag + shift) / 440);
  const pitch = Math.round(midi);
  if (pitch < 40 || pitch > 64 || Math.abs(midi - pitch) > 0.35) return null;
  const hz = 440 * 2 ** ((pitch - 69) / 12);
  const fundamental = fundamentalPower(signal, hz);
  if (fundamental < 0.03 * Math.max(fundamentalPower(signal, 2 * hz), fundamentalPower(signal, 3 * hz))) return null;
  return pitch;
}

/**
 * Recover isolated, brief lower-guitar attacks that the model heard only weakly
 * or as a harmonic. Require a quiet lead-in, a clear short release, independent
 * periodicity/fundamental evidence, and an onset-backed model witness. Existing
 * accepted attacks stay in charge. This is not a polyphonic pitch detector.
 */
export async function recoverGuitarShortNotes(
  events: readonly KeyboardEvent[], buffer: SongAudioSamples, signal?: AbortSignal,
): Promise<GuitarEvent[]> {
  cancelled(signal);
  const channels = await analysisChannels(buffer, signal);
  const output: GuitarEvent[] = [...events];
  if (!channels.length) return output;
  const count = Math.floor(channels[0]!.length / HOP);
  const envelopes = channels.map(() => new Float32Array(count));
  const envelope = new Float32Array(count);
  let peak = 0;
  for (let frame = 0; frame < count; frame++) {
    const start = Math.max(0, frame * HOP - ENVELOPE_WINDOW / 2);
    const end = Math.min(channels[0]!.length, start + ENVELOPE_WINDOW);
    for (let channel = 0; channel < channels.length; channel++) {
      let power = 0;
      for (let i = start; i < end; i++) power += channels[channel]![i]! ** 2;
      const rms = Math.sqrt(power / (end - start));
      envelopes[channel]![frame] = rms;
      envelope[frame] = Math.max(envelope[frame]!, rms);
    }
    peak = Math.max(peak, envelope[frame]!);
    if (frame % 1024 === 0) { await yieldTask(); cancelled(signal); }
  }
  if (peak < 0.001) return output;
  const byTime = [...events].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  let firstNear = 0, lastAttack = -Infinity, recovered = 0;
  for (let frame = 5; frame < count - 6 && recovered < 6000; frame++) {
    if (frame % 256 === 0) { await yieldTask(); cancelled(signal); }
    const energy = envelope[frame]!;
    let before = 0;
    for (let k = frame - 5; k < frame - 1; k++) before = Math.max(before, envelope[k]!);
    if (energy < Math.max(0.001, peak * 0.025) || before > energy * 0.18) continue;
    let start = frame * HOP / RATE;
    for (let k = frame - 1; k >= Math.max(0, frame - 16); k--) {
      if (envelope[k]! <= energy * 0.06) break;
      start = k * HOP / RATE;
    }
    if (start - lastAttack < 0.065) continue;
    let localPeak = energy, endFrame = frame + 1, quiet = false;
    for (; endFrame < Math.min(count - 6, frame + 88); endFrame++) {
      localPeak = Math.max(localPeak, envelope[endFrame]!);
      if (endFrame <= frame + 12) continue;
      let tail = 0;
      for (let k = endFrame; k < endFrame + 6; k++) tail = Math.max(tail, envelope[k]!);
      if (tail < localPeak * 0.08) { quiet = true; break; }
    }
    const end = endFrame * HOP / RATE - 0.01;
    if (!quiet || end - start < 0.035 || end - start > 0.2) continue;
    lastAttack = start;
    while (firstNear < byTime.length && byTime[firstNear]!.startTimeSeconds < start - 0.1) firstNear++;
    const nearby: KeyboardEvent[] = [];
    for (let i = firstNear; i < byTime.length && byTime[i]!.startTimeSeconds <= start + 0.12; i++) nearby.push(byTime[i]!);
    if (nearby.some((event) => event.amplitude >= 0.42 && event.durationSeconds >= 0.07
      && Math.abs(event.startTimeSeconds - start) <= 0.1)) continue;
    let channel = 0, channelPeak = 0;
    for (let c = 0; c < channels.length; c++) {
      for (let f = frame; f <= endFrame; f++) {
        if (envelopes[c]![f]! > channelPeak) { channelPeak = envelopes[c]![f]!; channel = c; }
      }
    }
    const pitch = shortPitch(channels[channel]!, start, end);
    if (pitch === null || !nearby.some((event) => event.hasOnset === true && event.amplitude >= 0.25
      && event.startTimeSeconds >= start - 0.03 && [0, 12, 19, 24, 28].includes(event.pitchMidi - pitch))) continue;
    output.push({ startTimeSeconds: start, durationSeconds: end - start, pitchMidi: pitch,
      amplitude: 0.5, hasOnset: true, shortAttackVerified: true });
    recovered++;
  }
  cancelled(signal);
  return output;
}
