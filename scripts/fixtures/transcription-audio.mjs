import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { drumFixture, drumWav } from './drum-draft.mjs';
import { keyboardFixture } from './keyboard-draft.mjs';

export const fixtureRoot = new URL('../../tests/fixtures/transcription-audio/', import.meta.url);
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Decode only the checked-in, mono 16-bit PCM samples. Runtime imports use the browser decoder. */
export function readPcmWav(data) {
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') throw Error('Invalid PCM sample');
  let format, samples;
  for (let offset = 12; offset + 8 <= data.length;) {
    const kind = data.toString('ascii', offset, offset + 4), size = data.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > data.length) throw Error('Incomplete PCM sample');
    if (kind === 'fmt ') format = { type: data.readUInt16LE(start), channels: data.readUInt16LE(start + 2), sampleRate: data.readUInt32LE(start + 4), bits: data.readUInt16LE(start + 14) };
    if (kind === 'data') samples = data.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || format.type !== 1 || format.channels !== 1 || format.bits !== 16 || !samples || samples.length % 2) throw Error('Expected mono 16-bit PCM');
  return { sampleRate: format.sampleRate, samples: Float32Array.from({ length: samples.length / 2 }, (_, index) => samples.readInt16LE(index * 2) / 32768) };
}

export function fixtureDuration(audio) {
  if (audio.toString('ascii', 0, 4) === 'fLaC') {
    if ((audio[4] & 0x7f) !== 0 || audio.length < 42) throw Error('Expected FLAC STREAMINFO');
    const value = audio.readBigUInt64BE(18), sampleRate = Number(value >> 44n), count = Number(value & ((1n << 36n) - 1n));
    if (!sampleRate || !count) throw Error('Invalid FLAC duration');
    return count / sampleRate;
  }
  const decoded = readPcmWav(audio);
  return decoded.samples.length / decoded.sampleRate;
}

/** Recorded timbre, digitally scheduled gates/transposition. This is explicitly a rendered test. */
export function renderSample(sample, basePitch, events, drive = 0) {
  const sampleRate = 44100, duration = 4, output = new Float32Array(duration * sampleRate);
  for (const event of events) {
    const rate = 2 ** ((event.pitch - basePitch) / 12) * sample.sampleRate / sampleRate;
    const start = Math.round(event.time * sampleRate), length = Math.round(event.duration * sampleRate);
    for (let i = 0; i < length; i++) {
      const position = i * rate, index = Math.floor(position), mix = position - index;
      if (index + 1 >= sample.samples.length) throw Error('Render gate exceeds the source sample');
      const envelope = Math.min(1, i / (0.005 * sampleRate), (length - i) / (0.012 * sampleRate));
      output[start + i] += ((1 - mix) * sample.samples[index] + mix * sample.samples[index + 1]) * envelope * 0.45;
    }
  }
  let peak = 0;
  for (let i = 0; i < output.length; i++) {
    if (drive) output[i] = Math.tanh(output[i] * drive);
    peak = Math.max(peak, Math.abs(output[i]));
  }
  if (peak) for (let i = 0; i < output.length; i++) output[i] *= 0.8 / peak;
  return { sampleRate, duration, length: output.length, numberOfChannels: 1, getChannelData: () => output };
}

export async function transcriptionAudioCases() {
  const sourceBytes = await readFile(new URL('sources.json', fixtureRoot));
  const sources = JSON.parse(sourceBytes);
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const assets = new Map();
  for (const source of sources) {
    const file = source.audio ?? source.sample;
    if (!/^[a-zA-Z0-9_-]+\.(flac|wav)$/.test(file)) throw Error('Invalid fixture asset path');
    const data = await readFile(new URL(file, fixtureRoot));
    if (sha256(data) !== source.sha256) throw Error(`Fixture checksum mismatch: ${file}`);
    assets.set(source.id, data);
  }
  const cases = sources.filter((source) => source.kind === 'recorded-performance').map((source) => ({
    id: source.id, instrument: source.instrument, kind: source.kind, mime: 'audio/flac', fileName: source.audio,
    audio: assets.get(source.id), reference: source.reference, sourceId: source.id,
  }));
  const append = (id, instrument, kind, audio, reference, sourceId = null) => cases.push({ id, instrument, kind, audio: drumWav(audio), mime: 'audio/wav', fileName: `${id}.wav`, reference, sourceId });
  const rendered = (id, instrument, sourceId, events, drive = 0) => {
    const source = sourcesById.get(sourceId);
    append(id, instrument, 'recorded-sample-render', renderSample(readPcmWav(assets.get(sourceId)), source.pitch, events, drive), events, sourceId);
  };
  const guitar = [{ time: 0.6, duration: 0.65, pitch: 40 }, { time: 1.8, duration: 0.45, pitch: 45 }, { time: 2.8, duration: 0.6, pitch: 47 }];
  const chords = [40, 47, 52].map((pitch) => ({ time: 0.6, duration: 0.8, pitch })).concat([43, 50, 55].map((pitch) => ({ time: 2.3, duration: 0.6, pitch })));
  rendered('guitar-clean', 'guitar', 'sample-guitar-acoustic', guitar);
  rendered('guitar-chords', 'guitar', 'sample-guitar-acoustic', chords);
  rendered('guitar-distorted', 'guitar', 'sample-guitar-acoustic', chords, 8);
  rendered('guitar-short-attacks', 'guitar', 'sample-guitar-acoustic', [40, 40, 43, 43, 45, 45].map((pitch, index) => ({ pitch, time: 0.6 + index * 0.2, duration: 0.1 })));
  // Supplemental development controls: different gates/pitches and simultaneous short attacks.
  rendered('guitar-short-varied', 'guitar', 'sample-guitar-acoustic', [42, 47, 50, 52].map((pitch, index) => ({ pitch, time: 0.6 + index * 0.6, duration: [0.12, 0.15, 0.16, 0.13][index] })));
  rendered('guitar-short-chords', 'guitar', 'sample-guitar-acoustic', [40, 47, 52].map((pitch) => ({ pitch, time: 0.6, duration: 0.13 })).concat([43, 50, 55].map((pitch) => ({ pitch, time: 2.1, duration: 0.15 }))));
  const keys = keyboardFixture();
  append('keys-harmonic', 'keys', 'analytical-render', keys, keys.events);
  rendered('keys-sampled', 'keys', 'sample-piano', keys.events);
  const bassEvents = [{ time: 0.6, duration: 0.7, pitch: 28 }, { time: 1.8, duration: 0.5, pitch: 33 }, { time: 2.7, duration: 0.7, pitch: 31 }];
  const bass = keyboardFixture(44100, 1, bassEvents);
  append('bass-harmonic', 'bass', 'analytical-render', bass, bassEvents);
  rendered('bass-sampled', 'bass', 'sample-bass-electric', bassEvents);
  const drums = drumFixture();
  append('drums-overlap', 'drums', 'analytical-render', drums, drums.events);
  const snare = drumFixture(44100, 1, drums.events.filter((event) => event.pitch === 38));
  append('drums-snare-only', 'drums', 'analytical-render', snare, snare.events);
  const late = keyboardFixture(44100, 1, [{ time: 0.6, duration: 0.5, pitch: 60 }, { time: 31.86, duration: 0.12, pitch: 64 }], 32);
  append('keys-recording-tail', 'keys', 'analytical-render', late, late.events);
  const silence = { sampleRate: 44100, duration: 2, length: 88200, numberOfChannels: 1, getChannelData: () => new Float32Array(88200) };
  append('keys-silence', 'keys', 'analytical-render', silence, []);
  append('drums-silence', 'drums', 'analytical-render', silence, []);
  for (const entry of cases) {
    const duration = fixtureDuration(entry.audio);
    if (duration < 1 || duration > 360) throw Error(`Invalid fixture duration: ${entry.id}`);
    for (const note of entry.reference) {
      if (!Number.isFinite(note.time) || note.time < 0 || note.time >= duration || !Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127
        || (note.duration !== undefined && (!Number.isFinite(note.duration) || note.duration <= 0 || note.time + note.duration > duration + 1e-8))) throw Error(`Invalid reference label: ${entry.id}`);
    }
    entry.duration = duration;
  }
  return { cases, sourceManifestHash: sha256(sourceBytes) };
}
