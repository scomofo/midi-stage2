/**
 * Guitar-cable input: a real guitar plugged into an audio interface.
 * Pitch/onset detection runs in `guitar-cable-processor.js` (AudioWorklet);
 * this module holds the message protocol, latency-calibration math, and
 * per-device calibration storage. Scoring reuses the exact-pitch MIDI path:
 * the cable reports pitches, never physical string choices.
 */

export type CableLevelMessage = { type: "cable-level"; rms: number };
export type CableOnsetMessage = {
  type: "cable-onset";
  midi: number;
  frequency: number;
  clarity: number;
  velocity: number;
  /** AudioContext time of the detected onset, same timebase as the song clock. */
  audioTime: number;
};
export type CableReleaseMessage = { type: "cable-release"; audioTime: number };
export type CableMessage = CableLevelMessage | CableOnsetMessage | CableReleaseMessage;

export const CABLE_PROCESSOR_NAME = "guitar-cable-processor";

/** Onsets farther than this from a calibration click are not that click's strum. */
const CALIBRATION_MATCH_WINDOW_S = 0.25;
const CALIBRATION_MIN_TAPS = 3;

export type LatencyCalibration = {
  /** Median detected-onset delay behind the click, in milliseconds. */
  offsetMs: number;
  /** Per-tap offsets in ms, for display. */
  tapsMs: number[];
};

/**
 * Match each calibration click to its nearest detected onset and return the
 * median input latency. Positive means the cable path lags the click.
 * Returns null when too few taps matched.
 */
export function calibrateLatency(
  clickAudioTimes: readonly number[],
  onsetAudioTimes: readonly number[],
): LatencyCalibration | null {
  const tapsMs: number[] = [];
  const used = new Set<number>();
  for (const click of clickAudioTimes) {
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < onsetAudioTimes.length; i++) {
      if (used.has(i)) continue;
      const distance = Math.abs(onsetAudioTimes[i]! - click);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    if (best >= 0 && bestDistance <= CALIBRATION_MATCH_WINDOW_S) {
      used.add(best);
      tapsMs.push((onsetAudioTimes[best]! - click) * 1000);
    }
  }
  if (tapsMs.length < CALIBRATION_MIN_TAPS) return null;
  const sorted = [...tapsMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const offsetMs = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { offsetMs, tapsMs };
}

export type CableCalibrationRecord = {
  deviceLabel: string;
  offsetMs: number;
  taps: number;
  measuredAt: string;
};

export const CABLE_CALIBRATION_KEY = "midi-stage/guitar-cable-calibration/v1";
export const CABLE_DEVICE_KEY = "midi-stage/guitar-cable-device/v1";

function readJson(key: string, storage: Pick<Storage, "getItem">): unknown {
  try {
    return JSON.parse(storage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function getStorage(storage?: Pick<Storage, "getItem" | "setItem"> | null): Pick<Storage, "getItem" | "setItem"> | null {
  if (storage !== undefined) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function loadCableCalibration(
  deviceLabel: string,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): CableCalibrationRecord | null {
  const target = getStorage(storage);
  if (!target || !deviceLabel) return null;
  const raw = readJson(CABLE_CALIBRATION_KEY, target);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = (raw as Record<string, unknown>)[deviceLabel];
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const r = record as Record<string, unknown>;
  if (typeof r.offsetMs !== "number" || !Number.isFinite(r.offsetMs) || Math.abs(r.offsetMs) > 2000) return null;
  if (typeof r.taps !== "number" || !Number.isInteger(r.taps) || r.taps < CALIBRATION_MIN_TAPS) return null;
  return {
    deviceLabel,
    offsetMs: r.offsetMs,
    taps: r.taps,
    measuredAt: typeof r.measuredAt === "string" ? r.measuredAt : "",
  };
}

export function saveCableCalibration(
  record: CableCalibrationRecord,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): boolean {
  const target = getStorage(storage);
  if (!target || !record.deviceLabel) return false;
  if (typeof record.offsetMs !== "number" || !Number.isFinite(record.offsetMs) || Math.abs(record.offsetMs) > 2000) return false;
  try {
    const raw = readJson(CABLE_CALIBRATION_KEY, target);
    const all = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    all[record.deviceLabel] = {
      offsetMs: record.offsetMs,
      taps: record.taps,
      measuredAt: record.measuredAt,
    };
    target.setItem(CABLE_CALIBRATION_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function loadCableDeviceId(storage?: Pick<Storage, "getItem" | "setItem"> | null): string {
  const target = getStorage(storage);
  if (!target) return "";
  const raw = readJson(CABLE_DEVICE_KEY, target);
  return typeof raw === "string" ? raw : "";
}

export function saveCableDeviceId(deviceId: string, storage?: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  const target = getStorage(storage);
  if (!target) return false;
  try {
    target.setItem(CABLE_DEVICE_KEY, JSON.stringify(deviceId));
    return true;
  } catch {
    return false;
  }
}
