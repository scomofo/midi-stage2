import type { KeyboardEvent } from "./keyboard-draft.ts";
import type { SongAudioSamples } from "./audio-import.ts";

/**
 * A conservative, review-only audit for brief simultaneous guitar tones.
 * This does NOT insert notes into a chart: the existing short-note recovery
 * is monophonic and we cannot infer string/fret from a spectral peak.
 */
export interface ShortChordCandidate {
  pitchMidi: number;
  time: number;
  estimatedDuration: number;
}
const frequency = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);

function powerAt(data: Float32Array, sampleRate: number, start: number, size: number, hz: number): number {
  const w = 2 * Math.PI * hz / sampleRate;
  let real = 0, imaginary = 0;
  for (let i = 0; i < size; i++) {
    const sample = data[start + i] ?? 0;
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1));
    real += sample * window * Math.cos(w * i);
    imaginary += sample * window * Math.sin(w * i);
  }
  return (real * real + imaginary * imaginary) / (size * size);
}

export function auditShortChordCandidates(
  rawEvents: readonly KeyboardEvent[],
  acceptedEvents: readonly KeyboardEvent[],
  audio: SongAudioSamples,
): ShortChordCandidate[] {
  if (audio.numberOfChannels < 1 || audio.sampleRate < 8000) return [];
  const data = audio.getChannelData(0);
  const size = Math.round(audio.sampleRate * 0.075);
  if (data.length < size || size < 32) return [];
  const accepted = acceptedEvents.filter((event) => event.hasOnset && event.amplitude >= 0.42);
  const result: ShortChordCandidate[] = [];
  for (const event of rawEvents) {
    if (!event.hasOnset || event.amplitude < 0.25 || event.durationSeconds > 0.2 ||
        event.pitchMidi < 40 || event.pitchMidi > 76) continue;
    const companions = accepted.filter((note) =>
      Math.abs(note.startTimeSeconds - event.startTimeSeconds) <= 0.035 &&
      note.pitchMidi !== event.pitchMidi,
    );
    if (!companions.length || acceptedEvents.some((note) =>
      note.pitchMidi === event.pitchMidi && Math.abs(note.startTimeSeconds - event.startTimeSeconds) <= 0.06)) continue;
    // Do not treat an overtone of a retained note as an independent chord tone.
    if (companions.some((note) => [12, 19, 24, 28].some((interval) =>
      event.pitchMidi - note.pitchMidi === interval))) continue;
    const start = Math.round((event.startTimeSeconds + 0.015) * audio.sampleRate);
    if (start < 0 || start + size > data.length) continue;
    const hz = frequency(event.pitchMidi);
    const center = powerAt(data, audio.sampleRate, start, size, hz);
    const flanks = Math.max(
      powerAt(data, audio.sampleRate, start, size, hz * 2 ** (-1 / 12)),
      powerAt(data, audio.sampleRate, start, size, hz * 2 ** (1 / 12)),
    );
    if (center < 1e-5 || center < flanks * 2.5) continue;
    if (result.some((candidate) => candidate.pitchMidi === event.pitchMidi &&
      Math.abs(candidate.time - event.startTimeSeconds) <= 0.06)) continue;
    result.push({ pitchMidi: event.pitchMidi, time: event.startTimeSeconds, estimatedDuration: event.durationSeconds });
  }
  return result;
}
