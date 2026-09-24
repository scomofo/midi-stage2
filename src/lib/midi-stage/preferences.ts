import { INSTRUMENTS, type Difficulty, type Instrument } from "./types";

export type SessionPreferences = {
  songId: string;
  enabledPlayers: Instrument[];
  difficulty: Difficulty;
  speed: number;
  guide: boolean;
  metronome: boolean;
  volume: number;
  focusStage: boolean;
};

export const SESSION_PREFERENCES_KEY = "midi-stage/session-preferences";

export const DEFAULT_SESSION_PREFERENCES: SessionPreferences = {
  songId: "open-stage",
  enabledPlayers: ["keys"],
  difficulty: "standard",
  speed: 1,
  guide: false,
  metronome: false,
  volume: 55,
  focusStage: false,
};

function defaults(songIds: readonly string[]): SessionPreferences {
  return {
    ...DEFAULT_SESSION_PREFERENCES,
    songId: songIds.includes(DEFAULT_SESSION_PREFERENCES.songId)
      ? DEFAULT_SESSION_PREFERENCES.songId
      : (songIds[0] ?? DEFAULT_SESSION_PREFERENCES.songId),
    enabledPlayers: [...DEFAULT_SESSION_PREFERENCES.enabledPlayers],
  };
}

/** Recover each valid setting independently; saved data never restores playback. */
export function parseSessionPreferences(raw: string | null, songIds: readonly string[]): SessionPreferences {
  const result = defaults(songIds);
  if (!raw) return result;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return result;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const saved = value as Record<string, unknown>;
  if (saved.version !== undefined && saved.version !== 1) return result;

  if (typeof saved.songId === "string" && songIds.includes(saved.songId)) result.songId = saved.songId;
  if (Array.isArray(saved.enabledPlayers)) {
    const selected = saved.enabledPlayers;
    const enabledPlayers = INSTRUMENTS.filter((instrument) => selected.includes(instrument));
    if (enabledPlayers.length) result.enabledPlayers = enabledPlayers;
  }
  if (saved.difficulty === "chill" || saved.difficulty === "standard" || saved.difficulty === "expert") {
    result.difficulty = saved.difficulty;
  }
  if (typeof saved.speed === "number" && [0.5, 0.75, 1, 1.25].includes(saved.speed)) result.speed = saved.speed;
  if (typeof saved.guide === "boolean") result.guide = saved.guide;
  if (typeof saved.metronome === "boolean") result.metronome = saved.metronome;
  if (typeof saved.focusStage === "boolean") result.focusStage = saved.focusStage;
  if (typeof saved.volume === "number" && Number.isFinite(saved.volume)) {
    result.volume = Math.min(100, Math.max(0, saved.volume));
  }
  return result;
}

export function loadSessionPreferences(
  songIds: readonly string[],
  storage?: Pick<Storage, "getItem"> | null,
): SessionPreferences {
  try {
    const source = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    return parseSessionPreferences(source?.getItem(SESSION_PREFERENCES_KEY) ?? null, songIds);
  } catch {
    return defaults(songIds);
  }
}

/** Storage may be blocked or full; preferences still work for the current visit. */
export function saveSessionPreferences(
  value: SessionPreferences,
  storage?: Pick<Storage, "setItem"> | null,
): boolean {
  try {
    const target = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    if (!target) return false;
    const preferences = parseSessionPreferences(JSON.stringify(value), [value.songId]);
    target.setItem(SESSION_PREFERENCES_KEY, JSON.stringify({ version: 1, ...preferences }));
    return true;
  } catch {
    return false;
  }
}
