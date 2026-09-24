import { CHART_SCHEMA, validateSharedChart, type SharedChart } from "./chart-format.ts";
import { INSTRUMENTS } from "./types.ts";

export const MAX_AUDIO_IMPORT_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 360;
export const AUDIO_IMPORT_ACCEPT = ".mp3,.wav,.wave,.flac,.m4a,.aac,.ogg,.oga,.opus,.webm,.aif,.aiff,audio/*";

const AUDIO_EXTENSION = /\.(mp3|wav|wave|flac|m4a|aac|ogg|oga|opus|webm|aif|aiff)$/i;
const HOP_SECONDS = 0.02;
const MIN_ONSET_GAP = 0.16;
const MAX_ONSETS = 3000;

export type SongAudioSamples = Pick<AudioBuffer, "sampleRate" | "length" | "duration" | "numberOfChannels" | "getChannelData">;
export type AudioAnalysis = { chart: SharedChart; warnings: string[] };

export function isSupportedAudioFile(file: Pick<File, "name" | "type">): boolean {
  if (/\.(mid|midi|json)$/i.test(file.name) || /midi/i.test(file.type)) return false;
  return AUDIO_EXTENSION.test(file.name) || file.type.startsWith("audio/");
}

function checkAudioSize(size: number) {
  if (!size) throw new Error("This audio file is empty. Choose a song with audible beats.");
  if (size > MAX_AUDIO_IMPORT_BYTES) throw new Error("Choose an audio file smaller than 50 MB.");
}

/** Read container metadata before allocating a full decoded PCM recording. */
async function checkAudioMetadata(file: File): Promise<void> {
  if (typeof Audio === "undefined") throw new Error("Audio import is not available in this browser.");
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => finish(new Error("The song's length could not be read. Try exporting it as WAV or MP3.")), 15000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration) || audio.duration < 1 || audio.duration > MAX_AUDIO_SECONDS + 0.15) {
        finish(new Error("Choose a song between 1 second and 6 minutes long."));
      } else finish();
    };
    audio.onerror = () => finish(new Error("This browser could not read the song. The file may be damaged or use an unsupported codec; try exporting it as WAV or MP3."));
    audio.src = url;
    audio.load();
  });
}

/** Decode locally, without opening an output device or needing an autoplay gesture. */
export async function decodeSongAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  checkAudioSize(data.byteLength);
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("Audio import is not available in this browser. Try a current browser with Web Audio support.");
  }
  try {
    // decodeAudioData resamples to this context's rate. A one-frame offline
    // context does not allocate a second full-length render or play any audio.
    const decoder = new OfflineAudioContext(2, 1, 44100);
    return await decoder.decodeAudioData(data);
  } catch {
    throw new Error("This browser could not decode the song. The file may be damaged or use an unsupported codec; try exporting it as WAV or MP3.");
  }
}

function tempoFromOnsets(flux: Float64Array, hop: number, onsetCount: number): number | null {
  if (onsetCount < 6 || flux.length * hop < 2) return null;
  const minLag = Math.ceil(60 / 180 / hop);
  const maxLag = Math.min(Math.floor(60 / 70 / hop), flux.length - 2);
  let bestLag = 0;
  let bestScore = 0;
  const scores = new Map<number, number>();
  for (let lag = minLag; lag <= maxLag; lag++) {
    let product = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = lag; i < flux.length; i++) {
      product += flux[i]! * flux[i - lag]!;
      energyA += flux[i]! ** 2;
      energyB += flux[i - lag]! ** 2;
    }
    const score = product / (Math.sqrt(energyA * energyB) || 1);
    scores.set(lag, score);
    // A tiny preference breaks octave ties toward the middle of the usual
    // rehearsal range; it never moves the actual detected highway events.
    const weighted = score * (1 - Math.abs(60 / (lag * hop) - 120) / 1200);
    if (weighted > bestScore) {
      bestScore = weighted;
      bestLag = lag;
    }
  }
  if (bestScore < 0.22 || !bestLag) return null;
  const before = scores.get(bestLag - 1) ?? 0;
  const center = scores.get(bestLag)!;
  const after = scores.get(bestLag + 1) ?? 0;
  const denominator = before - 2 * center + after;
  const correction = denominator < -1e-8 ? Math.max(-0.5, Math.min(0.5, (before - after) / (2 * denominator))) : 0;
  return Math.round(60 / ((bestLag + correction) * hop));
}

/**
 * A conservative onset chart, not pitch transcription. Three energy bands
 * retain drum/high-frequency attacks over a sustained bass. Stereo powers are
 * averaged rather than waveforms, so out-of-phase channels cannot cancel.
 * All highway notes come from local increases in the recording's energy;
 * estimating the count-in tempo never adds or snaps notes onto a fake grid.
 */
export function analyzeSongAudio(buffer: SongAudioSamples, filename: string, fingerprint: string): AudioAnalysis {
  const { duration, sampleRate, length, numberOfChannels } = buffer;
  if (!Number.isFinite(duration) || duration < 1 || duration > MAX_AUDIO_SECONDS) {
    throw new Error("Choose a song between 1 second and 6 minutes long.");
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      !Number.isInteger(length) || length <= 0 || !Number.isInteger(numberOfChannels) || numberOfChannels < 1) {
    throw new Error("The decoded audio is not valid. Try exporting the song as WAV or MP3.");
  }
  if (!/^[a-z0-9_-]{1,96}$/i.test(fingerprint)) throw new Error("The audio fingerprint is invalid. Please import the file again.");

  const hopSize = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
  const hop = hopSize / sampleRate;
  const frameCount = Math.ceil(length / hopSize);
  const bands = [new Float64Array(frameCount), new Float64Array(frameCount), new Float64Array(frameCount)];
  const channels = Math.min(2, numberOfChannels);
  const lowCoefficient = 1 - Math.exp(-2 * Math.PI * 300 / sampleRate);
  const midCoefficient = 1 - Math.exp(-2 * Math.PI * 2500 / sampleRate);
  for (let channel = 0; channel < channels; channel++) {
    const samples = buffer.getChannelData(channel);
    if (samples.length !== length) throw new Error("The decoded audio is incomplete. Please choose a different file.");
    let low = 0;
    let smooth = 0;
    for (let frame = 0; frame < frameCount; frame++) {
      const start = frame * hopSize;
      const end = Math.min(length, start + hopSize);
      const scale = 1 / ((end - start) * channels);
      let lowEnergy = 0;
      let midEnergy = 0;
      let highEnergy = 0;
      for (let i = start; i < end; i++) {
        const value = Number.isFinite(samples[i]) ? samples[i]! : 0;
        low += lowCoefficient * (value - low);
        smooth += midCoefficient * (value - smooth);
        lowEnergy += low * low;
        midEnergy += (smooth - low) ** 2;
        highEnergy += (value - smooth) ** 2;
      }
      bands[0]![frame] += lowEnergy * scale;
      bands[1]![frame] += midEnergy * scale;
      bands[2]![frame] += highEnergy * scale;
    }
  }

  const peaks = bands.map((band) => {
    let peak = 0;
    for (let i = 0; i < band.length; i++) {
      band[i] = Math.sqrt(band[i]!);
      peak = Math.max(peak, band[i]!);
    }
    return peak;
  });
  const peak = Math.max(...peaks);
  if (peak < 0.0001) throw new Error("This song is silent or too quiet to analyze. Choose a recording with audible beats.");

  const flux = new Float64Array(frameCount);
  let peakFlux = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
      if (peaks[bandIndex]! < peak * 0.04) continue;
      const band = bands[bandIndex]!;
      const previous = Math.max((band[frame - 1] ?? 0) * 1.06, (band[frame - 2] ?? 0) * 0.95);
      flux[frame] += Math.max(0, band[frame]! - previous) / peaks[bandIndex]!;
    }
    peakFlux = Math.max(peakFlux, flux[frame]!);
  }

  const prefix = new Float64Array(frameCount + 1);
  for (let i = 0; i < frameCount; i++) prefix[i + 1] = prefix[i]! + flux[i]!;
  const candidates: { frame: number; strength: number }[] = [];
  const radius = Math.round(0.3 / hop);
  for (let i = 0; i < frameCount; i++) {
    const start = Math.max(0, i - radius);
    const end = Math.min(frameCount, i + radius + 1);
    const background = (prefix[end]! - prefix[start]!) / (end - start);
    const strength = flux[i]!;
    if (strength < Math.max(0.12, peakFlux * 0.045, background * 1.8) ||
        strength < (flux[i - 1] ?? 0) || strength <= (flux[i + 1] ?? 0)) continue;
    if (i * hop + 0.02 > duration) continue;
    candidates.push({ frame: i, strength });
  }

  // Keep the strongest attack in a playable spacing window, then restore time
  // order. Busy fills become fewer real attacks, never newly invented beats.
  candidates.sort((a, b) => b.strength - a.strength || a.frame - b.frame);
  const blocked = new Uint8Array(frameCount);
  const onsets: typeof candidates = [];
  const minimumFrames = Math.ceil(MIN_ONSET_GAP / hop);
  for (const candidate of candidates) {
    if (blocked[candidate.frame]) continue;
    onsets.push(candidate);
    blocked.fill(1, Math.max(0, candidate.frame - minimumFrames + 1), Math.min(frameCount, candidate.frame + minimumFrames));
    if (onsets.length === MAX_ONSETS) break;
  }
  onsets.sort((a, b) => a.frame - b.frame);
  if (onsets.length < 3) {
    throw new Error("There are not enough clear attacks to make a highway. Try a song with a stronger drum beat or more distinct notes.");
  }

  const estimatedTempo = tempoFromOnsets(flux, hop, onsets.length);
  const bpm = estimatedTempo ?? 120;
  const title = filename.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 160) || "Imported song";
  const notes = onsets.map(({ frame, strength }) => {
    const time = frame * hop;
    return { time, duration: Math.min(0.06, duration - time), pitch: 60, velocity: Math.round(70 + 57 * Math.min(1, strength / peakFlux)) };
  });
  const chart = validateSharedChart({
    schema: CHART_SCHEMA,
    version: 2,
    matching: "rhythm",
    id: `chart-audio-${fingerprint}`,
    title,
    bpm,
    duration,
    firstBeat: notes[0]!.time,
    audioOffset: 0,
    audioName: filename.slice(0, 256),
    origin: "audio-rhythm",
    parts: INSTRUMENTS.map((type) => ({ type, notes: type === "keys" ? notes : [] })),
    tempoMap: [],
    beats: [],
  });
  const warnings = [
    "This rhythm highway follows detected attacks, not individual instrument pitches. Dense mixes and vocals may produce extra or missing hits.",
    estimatedTempo === null
      ? "No steady tempo was found. The count-in uses 120 BPM; the highway still follows the recording's detected timing."
      : `Tempo is estimated at ${bpm} BPM. The highway follows the recording's detected timing.`,
  ];
  if (numberOfChannels > 2) warnings.push("Highway analysis uses the first two audio channels of this recording.");
  return { chart, warnings };
}

/** Read, fingerprint, decode, and analyze a user-selected file entirely locally. */
export async function importAudioFile(file: File): Promise<AudioAnalysis & { buffer: AudioBuffer }> {
  checkAudioSize(file.size);
  if (!isSupportedAudioFile(file)) {
    throw new Error("Choose MP3, WAV, FLAC, M4A, OGG, or another browser-supported audio file.");
  }
  await checkAudioMetadata(file);
  const data = await file.arrayBuffer();
  if (!globalThis.crypto?.subtle) throw new Error("Audio import needs a secure browser connection. Reload the game over HTTPS.");
  // Hash before decodeAudioData, which is permitted to detach its input buffer.
  const hash = await globalThis.crypto.subtle.digest("SHA-256", data);
  const fingerprint = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
  const buffer = await decodeSongAudio(data);
  return { ...analyzeSongAudio(buffer, file.name, fingerprint), buffer };
}
