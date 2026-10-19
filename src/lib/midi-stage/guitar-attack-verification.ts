import type { SongAudioSamples } from "./audio-import.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";

const WINDOW_SECONDS = 0.08;
const ONSET_MARGIN = 0.005;
const PEER_WINDOW = 0.035;
const POWER_FLOOR = 1e-10;
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Song import was cancelled.", "AbortError");
}

function hann(size: number): Float64Array {
  return Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
}

/** Narrowband power, allowing 35 cents of tuning error in either direction. */
function bandPower(samples: Float32Array, start: number, hz: number, sampleRate: number, window: Float64Array): number {
  let best = 0;
  for (const cents of [-35, 0, 35]) {
    const coefficient = 2 * Math.cos(2 * Math.PI * hz * 2 ** (cents / 1200) / sampleRate);
    let a = 0, b = 0;
    for (let i = 0; i < window.length; i++) {
      const sample = samples[start + i] ?? 0;
      const next = (Number.isFinite(sample) ? sample : 0) * window[i]! + coefficient * a - b;
      b = a; a = next;
    }
    best = Math.max(best, a * a + b * b - coefficient * a * b);
  }
  return best / window.length ** 2;
}

/**
 * Discard only an adjacent same-pitch retrigger whose audio keeps decaying while
 * a different pitch actually attacks. A local rebound may be a softer reattack:
 * retain it, as well as unknown onsets and incomplete edge windows. Never extend
 * a previous hold to fill the discarded event. Source channels are checked
 * independently so stereo cancellation cannot supply false decay evidence.
 */
export async function verifyGuitarAttacks(
  events: readonly KeyboardEvent[],
  buffer: SongAudioSamples,
  signal?: AbortSignal,
): Promise<KeyboardEvent[]> {
  cancelled(signal);
  const sorted = [...events].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.pitchMidi - b.pitchMidi);
  // The model's mono preparation uses the first two channels. Retain their
  // original samples here; its resampled analysis copy has been transferred.
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i));
  const window = hann(Math.round(buffer.sampleRate * WINDOW_SECONDS));
  const shortWindow = hann(Math.round(window.length / 2));
  const power = (channel: Float32Array, time: number, hz: number, weights = window) =>
    bandPower(channel, Math.round(time * buffer.sampleRate), hz, buffer.sampleRate, weights);
  const features = new Map<KeyboardEvent, Array<{ before: number; after: number; hz: number }>>();
  const featuresFor = (event: KeyboardEvent) => {
    if (event.startTimeSeconds < WINDOW_SECONDS + ONSET_MARGIN || event.startTimeSeconds + WINDOW_SECONDS + ONSET_MARGIN > buffer.duration
      || !Number.isInteger(event.pitchMidi) || event.pitchMidi < 40 || event.pitchMidi > 88) return null;
    let result = features.get(event);
    if (!result) {
      const hz = 440 * 2 ** ((event.pitchMidi - 69) / 12);
      result = channels.map((channel) => ({ hz,
        before: power(channel, event.startTimeSeconds - WINDOW_SECONDS - ONSET_MARGIN, hz),
        after: power(channel, event.startTimeSeconds + ONSET_MARGIN, hz),
      }));
      features.set(event, result);
    }
    return result;
  };
  const newPitch = new Map<KeyboardEvent, boolean>();
  const isNewPitch = (event: KeyboardEvent) => {
    if (event.hasOnset !== true) return false;
    if (newPitch.has(event)) return newPitch.get(event)!;
    const result = featuresFor(event)?.some(({ before, after, hz }, i) => after > POWER_FLOOR && after >= 4 * before
      && after >= 0.1 * Math.max(
        power(channels[i]!, event.startTimeSeconds + ONSET_MARGIN, 2 * hz),
        power(channels[i]!, event.startTimeSeconds + ONSET_MARGIN, 3 * hz),
      )) ?? false;
    newPitch.set(event, result);
    return result;
  };
  const hasRebound = (event: KeyboardEvent, hz: number, channel: Float32Array) => {
    let previous = power(channel, event.startTimeSeconds - WINDOW_SECONDS, hz, shortWindow);
    for (let step = 1; step <= 6; step++) {
      const next = power(channel, event.startTimeSeconds - WINDOW_SECONDS + step * 0.02, hz, shortWindow);
      if (next > POWER_FLOOR && next >= 1.5 * previous) return true;
      previous = next;
    }
    return false;
  };

  const previousByPitch = new Map<number, KeyboardEvent>();
  const kept: KeyboardEvent[] = [];
  let firstPeer = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i % 16 === 0) { await yieldTask(); cancelled(signal); }
    const event = sorted[i]!;
    const previous = previousByPitch.get(event.pitchMidi);
    previousByPitch.set(event.pitchMidi, event);
    const gap = previous ? event.startTimeSeconds - previous.startTimeSeconds - previous.durationSeconds : Infinity;
    while (firstPeer < i && sorted[firstPeer]!.startTimeSeconds < event.startTimeSeconds - PEER_WINDOW) firstPeer++;
    const feature = event.hasOnset === true && gap >= -0.015 && gap <= 0.045 ? featuresFor(event) : null;
    const decaying = feature?.some(({ before }) => before > POWER_FLOOR)
      && feature.every(({ before, after }) => (before <= POWER_FLOOR && after <= POWER_FLOOR) || after <= 0.95 * before);
    let discard = false;
    if (decaying && feature) {
      for (let j = firstPeer; j < sorted.length && sorted[j]!.startTimeSeconds <= event.startTimeSeconds + PEER_WINDOW; j++) {
        const peer = sorted[j]!;
        if (peer.pitchMidi !== event.pitchMidi && isNewPitch(peer)) {
          discard = !feature.some(({ hz }, channel) => hasRebound(event, hz, channels[channel]!));
          break;
        }
      }
    }
    if (!discard) kept.push(event);
  }
  cancelled(signal);
  return kept;
}
