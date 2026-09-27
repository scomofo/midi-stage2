/**
 * Guitar-cable input: monophonic pitch + onset detection for a real guitar
 * plugged into an audio interface. Runs inside an AudioWorklet; the same
 * pure DSP functions are imported by the Node test suite.
 *
 * This file has no imports so the bundler can emit it verbatim for
 * `audioWorklet.addModule()`. Keep it dependency-free.
 */

/** Lowest/highest frequencies the detector searches, in Hz. Covers low E (82.41 Hz) to high E at the 24th fret. */
export const DETECT_MIN_HZ = 60;
export const DETECT_MAX_HZ = 1400;
/** Analysis window in samples; 2048 @ 48 kHz spans ~43 ms, several periods of low E. */
export const ANALYSIS_SIZE = 2048;
/** RMS below this is treated as silence; no pitch is reported. */
export const SILENCE_RMS = 0.008;

/**
 * @param {number} frequencyHz
 * @returns {number} Nearest MIDI note number (may be fractional input).
 */
export function frequencyToMidi(frequencyHz) {
  return 69 + 12 * Math.log2(frequencyHz / 440);
}

/**
 * @param {number} midi
 * @returns {number} Frequency in Hz.
 */
export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * @param {Float32Array} samples
 * @returns {number} Root-mean-square level.
 */
export function rmsOf(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * YIN pitch estimate (de Cheveigné & Kawahara) with parabolic interpolation.
 * The cumulative-mean-normalized difference function prefers the true
 * fundamental over harmonic peaks, which plain autocorrelation does not.
 *
 * @param {Float32Array} samples Mono audio, ANALYSIS_SIZE samples recommended.
 * @param {number} sampleRate
 * @returns {{ frequency: number, clarity: number } | null} clarity is 0–1; null on silence / unpitched.
 */
export function detectPitch(samples, sampleRate) {
  const size = samples.length;
  const rms = rmsOf(samples);
  if (rms < SILENCE_RMS) return null;

  const minPeriod = Math.max(2, Math.floor(sampleRate / DETECT_MAX_HZ));
  const maxPeriod = Math.min(size - 2, Math.ceil(sampleRate / DETECT_MIN_HZ));
  if (maxPeriod <= minPeriod) return null;

  // Difference function: small when the signal repeats every tau samples.
  const diff = new Float64Array(maxPeriod + 1);
  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    let sum = 0;
    for (let i = 0; i < size - tau; i++) {
      const d = samples[i] - samples[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // Cumulative-mean normalization; the first dip below threshold wins.
  const cmnd = new Float64Array(maxPeriod + 1);
  let running = 0;
  const THRESHOLD = 0.15;
  let tauStar = -1;
  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    running += diff[tau];
    cmnd[tau] = running > 0 ? (diff[tau] * (tau - minPeriod + 1)) / running : 1;
    if (tauStar < 0 && tau > minPeriod && cmnd[tau] < THRESHOLD) {
      tauStar = tau;
    }
  }
  if (tauStar < 0) return null;

  // Walk to the local minimum past the threshold crossing.
  while (tauStar + 1 <= maxPeriod && cmnd[tauStar + 1] < cmnd[tauStar]) tauStar++;

  // Parabolic interpolation around the minimum for sub-sample accuracy.
  let period = tauStar;
  if (tauStar > minPeriod && tauStar < maxPeriod) {
    const y0 = cmnd[tauStar - 1];
    const y1 = cmnd[tauStar];
    const y2 = cmnd[tauStar + 1];
    const denom = y0 - 2 * y1 + y2;
    if (denom > 0) period = tauStar + (0.5 * (y0 - y2)) / denom;
  }
  const clarity = Math.max(0, Math.min(1, 1 - cmnd[tauStar]));
  return { frequency: sampleRate / period, clarity };
}

/**
 * @param {number} rms Current window RMS.
 * @returns {number} MIDI velocity 1–127 mapped from input level.
 */
export function velocityOf(rms) {
  return Math.max(1, Math.min(127, Math.round(30 + rms * 420)));
}

// Message protocol: worklet -> main thread.
// { type: "cable-level", rms }
// { type: "cable-onset", midi, frequency, clarity, velocity, audioTime }
// { type: "cable-release", audioTime }

/**
 * @typedef {object} CableWorkletPort
 * @property {(message: unknown) => void} postMessage
 * @property {((event: { data: unknown }) => void) | null} [onmessage]
 */

/**
 * @typedef {new () => { port?: CableWorkletPort }} WorkletProcessorConstructor
 */

/**
 * The AudioWorkletGlobalScope (real worklet) or globalThis (Node tests).
 * @returns {any}
 */
function workletScope() {
  return /** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : {});
}

/*
 * AudioWorkletProcessor / registerProcessor / sampleRate / currentTime exist
 * on the AudioWorkletGlobalScope at runtime. They are read through
 * workletScope() so this module also loads in Node for unit tests.
 */
/** @type {WorkletProcessorConstructor} */
const BaseProcessor =
  workletScope().AudioWorkletProcessor ??
  class {
    constructor() {
      /** @type {CableWorkletPort | undefined} */
      this.port = undefined;
    }
  };

/** @type {(name: string, ctor: WorkletProcessorConstructor) => void} */
const register = workletScope().registerProcessor ?? (() => {});

export class GuitarCableProcessor extends BaseProcessor {
  constructor() {
    super();
    /** @type {Float32Array} ring buffer of the most recent audio */
    this.buffer = new Float32Array(ANALYSIS_SIZE);
    this.bufferFill = 0;
    this.sinceAnalysis = 0;
    /** AudioContext time of the newest sample currently in the buffer. */
    this.bufferEndTime = 0;
    this.sampleRateGuess = 48000;

    this.onsetRms = 0.05;
    this.releaseRms = 0.018;
    this.cooldownUntil = 0;
    this.settling = null; // { deadline, pitches: number[], startTime }
    this.active = false;
    this.activeMidi = 0;
    this.lastOnsetTime = -1;
    this.quietSince = -1;
    this.lastLevelPost = 0;
    try {
      const port = this.port;
      if (port) port.onmessage = /** @param {{ data: unknown }} event */ (event) => this.handleMessage(event);
    } catch {
      /* port is assigned after construction in tests */
    }
  }

  /**
   * @param {Float32Array[][]} inputs
   * @returns {boolean}
   */
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0] || !input[0].length) return true;
    const channel = input[0];
    const scope = workletScope();
    const sr = typeof scope.sampleRate === "number" && scope.sampleRate > 0 ? scope.sampleRate : this.sampleRateGuess;
    this.sampleRateGuess = sr;
    // currentTime is the timestamp of the first sample in this quantum.
    const blockTime = typeof scope.currentTime === "number" ? scope.currentTime : 0;
    this.bufferEndTime = blockTime + channel.length / sr;

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.bufferFill] = channel[i];
      this.bufferFill = (this.bufferFill + 1) % ANALYSIS_SIZE;
      if (++this.sinceAnalysis >= 256) {
        this.sinceAnalysis = 0;
        // Analyze the most recent ANALYSIS_SIZE samples ending now.
        const window = new Float32Array(ANALYSIS_SIZE);
        for (let j = 0; j < ANALYSIS_SIZE; j++) {
          window[j] = this.buffer[(this.bufferFill + j) % ANALYSIS_SIZE];
        }
        const sampleRate = this.sampleRateGuess;
        this.analyze(window, sampleRate, this.bufferEndTime - ANALYSIS_SIZE / sampleRate / 2);
      }
    }
    return true;
  }

  /**
   * @param {Float32Array} window
   * @param {number} sampleRate
   * @param {number} windowCenterTime AudioContext time of the window center.
   */
  analyze(window, sampleRate, windowCenterTime) {
    const rms = rmsOf(window);

    if (windowCenterTime - this.lastLevelPost > 0.1) {
      this.lastLevelPost = windowCenterTime;
      this.post({ type: "cable-level", rms });
    }

    const pitch = rms >= Math.min(this.onsetRms, this.releaseRms) ? detectPitch(window, sampleRate) : null;
    const midi = pitch && pitch.clarity >= 0.75 ? Math.round(frequencyToMidi(pitch.frequency)) : -1;

    if (this.settling) {
      if (midi >= 0) this.settling.pitches.push(midi);
      if (windowCenterTime >= this.settling.deadline || rms < this.releaseRms) {
        const pitches = this.settling.pitches.sort((a, b) => a - b);
        const median = pitches.length ? pitches[Math.floor(pitches.length / 2)] : -1;
        const startTime = this.settling.startTime;
        this.settling = null;
        if (median >= 0 && median >= 28 && median <= 96) {
          this.emitOnset(median, pitch ? pitch.frequency : 0, pitch ? pitch.clarity : 0, rms, startTime);
        }
      }
      return;
    }

    if (!this.active) {
      if (rms >= this.onsetRms && windowCenterTime >= this.cooldownUntil && midi >= 0) {
        // Let the pick attack settle briefly so the scored pitch is stable.
        this.settling = { deadline: windowCenterTime + 0.035, pitches: [midi], startTime: windowCenterTime };
      }
      return;
    }

    // Active note: release on sustained quiet, retrigger on a clear pitch change.
    if (rms < this.releaseRms) {
      if (this.quietSince < 0) this.quietSince = windowCenterTime;
      if (windowCenterTime - this.quietSince > 0.15) {
        this.active = false;
        this.quietSince = -1;
        this.cooldownUntil = windowCenterTime + 0.05;
        this.post({ type: "cable-release", audioTime: windowCenterTime });
      }
      return;
    }
    this.quietSince = -1;
    if (midi >= 0 && Math.abs(midi - this.activeMidi) >= 1 && windowCenterTime - this.lastOnsetTime > 0.12) {
      // Legato pitch change: close the old note and open the new one.
      this.post({ type: "cable-release", audioTime: windowCenterTime });
      this.settling = { deadline: windowCenterTime + 0.03, pitches: [midi], startTime: windowCenterTime };
    }
  }

  /**
   * @param {number} midi
   * @param {number} frequency
   * @param {number} clarity
   * @param {number} rms
   * @param {number} audioTime
   */
  emitOnset(midi, frequency, clarity, rms, audioTime) {
    this.active = true;
    this.activeMidi = midi;
    this.lastOnsetTime = audioTime;
    this.cooldownUntil = audioTime + 0.09;
    this.post({
      type: "cable-onset",
      midi,
      frequency,
      clarity,
      velocity: velocityOf(rms),
      audioTime,
    });
  }

  /**
   * @param {unknown} message
   */
  post(message) {
    const port = this.port;
    if (port && typeof port.postMessage === "function") port.postMessage(message);
  }

  /**
   * @param {{ data: unknown }} event
   */
  handleMessage(event) {
    const data = event.data;
    if (data && typeof data === "object" && /** @type {{type?: unknown}} */ (data).type === "cable-reset") {
      this.settling = null;
      this.active = false;
      this.quietSince = -1;
      this.cooldownUntil = 0;
    }
  }
}

// In the worklet scope this registers the processor; in Node (tests) it is a noop.
register("guitar-cable-processor", GuitarCableProcessor);
