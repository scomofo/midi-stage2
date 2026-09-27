import { practiceSections, type PracticeSection } from "./practice";
import { INSTRUMENTS, type Difficulty, type Instrument, type Song } from "./types";

export type RehearsalBookmark = {
  version: 1;
  songId: string;
  section: { id: string; start: number; end: number };
  setup: {
    difficulty: Difficulty;
    speed: number;
    enabledPlayers: Instrument[];
    guide: boolean;
    strumGuide: boolean;
    metronome: boolean;
    repeat: boolean;
  };
};

export const REHEARSAL_BOOKMARK_KEY = "midi-stage/rehearsal-bookmark";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInstrument(value: unknown): value is Instrument {
  return INSTRUMENTS.some((instrument) => instrument === value);
}

/** A bookmark is one complete setup; never recover it with substituted defaults. */
function validateBookmark(value: unknown): RehearsalBookmark | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.songId !== "string" || !value.songId.trim()) return null;
  const { section, setup } = value;
  if (!isRecord(section) || typeof section.id !== "string" || !section.id.trim()
    || typeof section.start !== "number" || !Number.isFinite(section.start) || section.start < 0
    || typeof section.end !== "number" || !Number.isFinite(section.end) || section.end <= section.start) return null;
  if (!isRecord(setup)
    || (setup.difficulty !== "chill" && setup.difficulty !== "standard" && setup.difficulty !== "expert")
    || typeof setup.speed !== "number" || ![0.5, 0.75, 1, 1.25].includes(setup.speed)
    || !Array.isArray(setup.enabledPlayers) || !setup.enabledPlayers.length
    || ![...setup.enabledPlayers].every(isInstrument)
    || new Set(setup.enabledPlayers).size !== setup.enabledPlayers.length
    || typeof setup.guide !== "boolean" || typeof setup.strumGuide !== "boolean"
    || typeof setup.metronome !== "boolean" || typeof setup.repeat !== "boolean") return null;

  // Copy only the portable rehearsal setup, excluding routes, volume and playback state.
  return {
    version: 1,
    songId: value.songId,
    section: { id: section.id, start: section.start, end: section.end },
    setup: {
      difficulty: setup.difficulty,
      speed: setup.speed,
      enabledPlayers: [...setup.enabledPlayers],
      guide: setup.guide,
      strumGuide: setup.strumGuide,
      metronome: setup.metronome,
      repeat: setup.repeat,
    },
  };
}

export function parseRehearsalBookmark(raw: string | null): RehearsalBookmark | null {
  if (!raw) return null;
  try {
    return validateBookmark(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadRehearsalBookmark(storage?: Pick<Storage, "getItem"> | null): RehearsalBookmark | null {
  try {
    const source = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    return parseRehearsalBookmark(source?.getItem(REHEARSAL_BOOKMARK_KEY) ?? null);
  } catch {
    return null;
  }
}

export function saveRehearsalBookmark(
  bookmark: RehearsalBookmark,
  storage?: Pick<Storage, "setItem"> | null,
): boolean {
  try {
    const valid = validateBookmark(bookmark);
    if (!valid) return false;
    const target = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    if (!target) return false;
    target.setItem(REHEARSAL_BOOKMARK_KEY, JSON.stringify(valid));
    return true;
  } catch {
    return false;
  }
}

export function clearRehearsalBookmark(storage?: Pick<Storage, "removeItem"> | null): boolean {
  try {
    const target = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    if (!target) return false;
    target.removeItem(REHEARSAL_BOOKMARK_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Resolve against the catalog for the saved difficulty plus currently available imports. */
export function resolveRehearsalBookmark(
  bookmark: RehearsalBookmark,
  songs: readonly Song[],
): { bookmark: RehearsalBookmark; song: Song; section: PracticeSection } | null {
  const valid = validateBookmark(bookmark);
  if (!valid) return null;
  const song = songs.find((candidate) => candidate.id === valid.songId);
  if (!song) return null;
  if (song.guitarMode && (valid.setup.enabledPlayers.length !== 1 || valid.setup.enabledPlayers[0] !== "guitar")) return null;
  if (!song.original && valid.setup.enabledPlayers.some((instrument) =>
    !song.parts.some((part) => part.type === instrument && part.notes.length > 0))) return null;
  const section = practiceSections(song).find((candidate) =>
    candidate.id === valid.section.id && candidate.start === valid.section.start && candidate.end === valid.section.end);
  return section ? { bookmark: valid, song, section } : null;
}
