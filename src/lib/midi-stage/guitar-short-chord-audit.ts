import type { KeyboardEvent } from "./keyboard-draft.ts";
import type { SongAudioSamples } from "./audio-import.ts";

/** Unverified model/audio suggestions. Never inserted into the chart by analysis. */
export interface ShortChordCandidate {
  id: string;
  pitchMidi: number;
  time: number;
  estimatedDuration: number;
}
export type GuitarCandidateDecisions = Record<string, "accepted" | "dismissed">;
export type ShortChordAudit = { candidates: ShortChordCandidate[]; limited: boolean };

const MAX_EVENTS = 24000, MAX_CHECKS = 128, MAX_BUCKET = 64;
const BUCKET_SECONDS = 0.06;
const frequency = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);
const bucket = (time: number) => Math.floor(time / BUCKET_SECONDS);
const valid = (event: KeyboardEvent) => Number.isInteger(event.pitchMidi) && event.pitchMidi >= 0 && event.pitchMidi <= 127
  && Number.isFinite(event.startTimeSeconds) && event.startTimeSeconds >= 0 && Number.isFinite(event.durationSeconds)
  && event.durationSeconds >= 0.02 && Number.isFinite(event.amplitude);

function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Song import was cancelled.", "AbortError");
}
async function yieldToBrowser(signal?: AbortSignal) {
  cancelled(signal);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  cancelled(signal);
}

/** Weighted sinusoidal projection. Oscillator recurrence avoids trig per sample. */
function powerAt(data: Float32Array | undefined, start: number, window: Float64Array, radians: number): number {
  const cosine = Math.cos(radians), sine = Math.sin(radians);
  let real = 0, imaginary = 0, c = 1, s = 0;
  for (let i = 0; i < window.length; i++) {
    const sample = (data ? data[start + i]! : 1) * window[i]!;
    real += sample * c; imaginary += sample * s;
    const next = c * cosine - s * sine;
    s = s * cosine + c * sine; c = next;
  }
  return (real * real + imaginary * imaginary) / (window.length * window.length);
}

/**
 * A short Hann window has a broad main lobe at low pitches. Compare the local
 * peak with that SAME window's response to a pure tone, rather than demanding
 * a 2.5x semitone contrast that a 75 ms low note cannot produce. This is a
 * development heuristic, not independent proof of a chord tone or confidence.
 */
function peakRatio(pitch: number, sampleRate: number, window: Float64Array): number {
  const delta = frequency(pitch) - frequency(pitch - 1);
  const response = powerAt(undefined, 0, window, 2 * Math.PI * delta / sampleRate) / powerAt(undefined, 0, window, 0);
  return Math.min(2.5, 1 + 0.6 * (1 / response - 1));
}

export async function auditShortChordCandidates(
  rawEvents: readonly KeyboardEvent[],
  acceptedEvents: readonly KeyboardEvent[],
  audio: SongAudioSamples,
  signal?: AbortSignal,
): Promise<ShortChordAudit> {
  await yieldToBrowser(signal);
  const result: ShortChordAudit = { candidates: [], limited: rawEvents.length > MAX_EVENTS || acceptedEvents.length > MAX_EVENTS };
  if (!Number.isFinite(audio.sampleRate) || audio.sampleRate < 8000 || audio.sampleRate > 192000 || audio.numberOfChannels < 1) return result;
  const size = Math.round(audio.sampleRate * 0.075);
  const channels = Array.from({ length: Math.min(2, audio.numberOfChannels) }, (_, i) => audio.getChannelData(i));
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  const ratios = new Map<number, number>();
  // Time buckets bound the companion/duplicate search even for noisy model output.
  const accepted = new Map<number, KeyboardEvent[]>(), crowded = new Set<number>();
  let lastYield = performance.now();
  async function cooperate() {
    cancelled(signal);
    if (performance.now() - lastYield >= 8) { await yieldToBrowser(signal); lastYield = performance.now(); }
  }
  for (let i = 0; i < Math.min(MAX_EVENTS, acceptedEvents.length); i++) {
    if (i % 128 === 0) await cooperate();
    const event = acceptedEvents[i]!;
    if (!valid(event)) continue;
    const key = bucket(event.startTimeSeconds), entries = accepted.get(key) ?? [];
    if (entries.length === MAX_BUCKET) { crowded.add(key); result.limited = true; continue; }
    entries.push(event); accepted.set(key, entries);
  }
  let checks = 0;
  for (let i = 0; i < Math.min(MAX_EVENTS, rawEvents.length); i++) {
    if (i % 128 === 0) await cooperate();
    const event = rawEvents[i]!;
    if (!valid(event) || !event.hasOnset || event.amplitude < 0.25 || event.durationSeconds > 0.2 ||
        event.pitchMidi < 40 || event.pitchMidi > 76 || event.startTimeSeconds + event.durationSeconds > audio.duration + 1e-6) continue;
    const key = bucket(event.startTimeSeconds), keys = [key - 1, key, key + 1];
    if (keys.some((value) => crowded.has(value))) continue;
    const nearby = keys.flatMap((value) => accepted.get(value) ?? []);
    if (nearby.some((note) => note.pitchMidi === event.pitchMidi && Math.abs(note.startTimeSeconds - event.startTimeSeconds) <= 0.06)) continue;
    const companions = nearby.filter((note) => note.hasOnset && note.amplitude >= 0.42 &&
      Math.abs(note.startTimeSeconds - event.startTimeSeconds) <= 0.035 && note.pitchMidi !== event.pitchMidi);
    if (!companions.length) continue;
    // Common overtones are ambiguous: leave these out of the suggestion queue.
    if (companions.some((note) => [12, 19, 24, 28].includes(event.pitchMidi - note.pitchMidi))) continue;
    if (result.candidates.some((candidate) => candidate.pitchMidi === event.pitchMidi && Math.abs(candidate.time - event.startTimeSeconds) <= 0.06)) continue;
    if (checks === MAX_CHECKS) { result.limited = true; break; }
    checks++;
    await cooperate();
    const start = Math.round((event.startTimeSeconds + 0.015) * audio.sampleRate);
    const hz = frequency(event.pitchMidi);
    let ratio = ratios.get(event.pitchMidi);
    if (ratio === undefined) { ratio = peakRatio(event.pitchMidi, audio.sampleRate, window); ratios.set(event.pitchMidi, ratio); }
    const supported = channels.some((data) => {
      if (start < 0 || start + size > data.length) return false;
      const center = powerAt(data, start, window, 2 * Math.PI * hz / audio.sampleRate);
      if (center < 1e-5) return false;
      const flanks = Math.max(
        powerAt(data, start, window, 2 * Math.PI * frequency(event.pitchMidi - 1) / audio.sampleRate),
        powerAt(data, start, window, 2 * Math.PI * frequency(event.pitchMidi + 1) / audio.sampleRate),
      );
      return center >= flanks * ratio;
    });
    if (supported) result.candidates.push({ id: `short-chord:${Math.round(event.startTimeSeconds * 1e6)}:${event.pitchMidi}`,
      pitchMidi: event.pitchMidi, time: event.startTimeSeconds, estimatedDuration: event.durationSeconds });
  }
  cancelled(signal);
  result.candidates.sort((a, b) => a.time - b.time || a.pitchMidi - b.pitchMidi);
  return result;
}
