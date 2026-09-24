import {
  parseSharedChartText,
  serializeSharedChart,
  sharedChartToSong,
  validateSharedChart,
  type SharedChart,
} from "./chart-format.ts";
import type { Song } from "./types.ts";

export type SavedChart = {
  /** Content identity, separate from the author-supplied chart id. */
  id: string;
  chart: SharedChart;
  fileName: string;
  addedAt: number;
  /** Set by a local audio import, never inferred from chart metadata. */
  audio?: boolean;
};

export const SONG_LIBRARY_KEY = "midi-stage/song-library";
export const MAX_SAVED_CHARTS = 12;
export const MAX_CHART_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_SONG_LIBRARY_BYTES = 3 * 1024 * 1024;

const UNAVAILABLE_WARNING =
  "Available for this visit. Browser storage is full or unavailable; keep the original chart files to import again.";
const TOO_LARGE_WARNING =
  "Available for this visit. Your chart library is too large to save in this browser; keep the original chart files.";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireNotes(chart: SharedChart): void {
  if (!chart.parts.some((part) => part.notes.length > 0)) {
    throw new Error("This chart has no playable notes. Add notes before importing it.");
  }
}

function cleanFileName(value: unknown): string {
  if (typeof value !== "string") return "Imported chart.json";
  const name = value.split(/[\\/]/).at(-1)?.replace(/\p{Cc}/gu, "").trim().slice(0, 160);
  return name || "Imported chart.json";
}

/** FNV-1a 64-bit over canonical UTF-8; this identifies content, not trusted data. */
export function chartIdentity(chart: SharedChart): string {
  const bytes = new TextEncoder().encode(serializeSharedChart(chart));
  let high = 0xcbf29ce4;
  let low = 0x84222325;
  for (const byte of bytes) {
    low = (low ^ byte) >>> 0;
    const carry = Math.floor((low * 0x1b3) / 0x100000000);
    high = (Math.imul(high, 0x1b3) + carry + (low << 8)) >>> 0;
    low = Math.imul(low, 0x1b3) >>> 0;
  }
  return `import:${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
}

export function prepareChartImport(text: string, fileName: string): { entry: SavedChart; warnings: string[] } {
  if (new TextEncoder().encode(text).byteLength > MAX_CHART_IMPORT_BYTES) {
    throw new Error("Chart files must be 4 MB or smaller.");
  }
  const chart = parseSharedChartText(text);
  requireNotes(chart);
  return {
    entry: { id: chartIdentity(chart), chart, fileName: cleanFileName(fileName), addedAt: Date.now() },
    warnings: chart.audioName || chart.audioOffset !== 0
      ? ["Original audio is not attached. This chart plays with synthesized stage instruments; its audio offset is ignored."]
      : [],
  };
}

export function songFromSavedChart(entry: SavedChart): Song {
  return {
    ...sharedChartToSong(entry.chart),
    id: entry.id,
    subtitle: entry.fileName,
    arrangement: entry.audio === true ? "Audio rhythm" : "Imported chart",
    arrangementDescription: entry.audio === true
      ? "Rhythm chart detected from your audio. Play any MIDI note or the shown key; the original track plays with you."
      : "Plays with the stage instruments. Backing audio and audio offsets are not used.",
    ...(entry.audio === true ? { audioAssetId: entry.id } : {}),
  };
}

/** Reimports preserve order and added date; importing actual audio can attach it. */
export function addLibraryEntry(entries: readonly SavedChart[], entry: SavedChart): SavedChart[] {
  const existingIndex = entries.findIndex((existing) => existing.id === entry.id);
  if (existingIndex >= 0) {
    return entries.map((existing, index) => index === existingIndex && entry.audio === true && existing.audio !== true
      ? { ...existing, audio: true, fileName: entry.fileName }
      : existing);
  }
  if (entries.length >= MAX_SAVED_CHARTS) {
    throw new Error(`Your library has ${MAX_SAVED_CHARTS} charts. Remove one before importing another.`);
  }
  return [...entries, entry];
}

function restoreEntry(value: unknown): SavedChart {
  if (!record(value)) throw new Error("Invalid saved chart");
  const chart = validateSharedChart(value.chart);
  requireNotes(chart);
  const id = chartIdentity(chart);
  if (value.id !== id) throw new Error("Saved chart identity does not match its content");
  return {
    id,
    chart,
    fileName: cleanFileName(value.fileName),
    addedAt: typeof value.addedAt === "number" && Number.isFinite(value.addedAt) && value.addedAt >= 0 ? value.addedAt : 0,
    ...(typeof value.audio === "boolean" ? { audio: value.audio } : {}),
  };
}

export function loadSongLibrary(
  storage?: Pick<Storage, "getItem"> | null,
): { entries: SavedChart[]; warning: string | null } {
  try {
    const source = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    if (!source) return { entries: [], warning: null };
    const raw = source.getItem(SONG_LIBRARY_KEY);
    if (!raw) return { entries: [], warning: null };
    // localStorage stores UTF-16 strings. Bound work before parsing untrusted data.
    if (raw.length * 2 > MAX_SONG_LIBRARY_BYTES) {
      return { entries: [], warning: "Your saved chart library is too large to restore. Import the original chart files again." };
    }
    const saved: unknown = JSON.parse(raw);
    if (!record(saved) || saved.version !== 1 || !Array.isArray(saved.entries)) {
      return { entries: [], warning: "Your saved chart library could not be read. Import the original chart files again." };
    }
    const entries: SavedChart[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    for (const value of saved.entries) {
      try {
        const entry = restoreEntry(value);
        if (seen.has(entry.id)) {
          const index = entries.findIndex((existing) => existing.id === entry.id);
          if (entry.audio === true && entries[index]!.audio !== true) {
            entries[index] = { ...entries[index]!, audio: true, fileName: entry.fileName };
          }
          continue;
        }
        if (entries.length >= MAX_SAVED_CHARTS) {
          skipped++;
          continue;
        }
        entries.push(entry);
        seen.add(entry.id);
      } catch {
        skipped++;
      }
    }
    return {
      entries,
      warning: skipped ? `${skipped} saved chart${skipped === 1 ? "" : "s"} could not be restored. Import the original files again.` : null,
    };
  } catch {
    return { entries: [], warning: "Your saved chart library could not be read. Browser storage may be unavailable." };
  }
}

/** A failed save leaves the existing stored library intact and the caller's list playable. */
export function saveSongLibrary(
  entries: readonly SavedChart[],
  storage?: Pick<Storage, "setItem"> | null,
): { saved: boolean; warning: string | null } {
  try {
    const target = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    if (!target) return { saved: false, warning: UNAVAILABLE_WARNING };
    if (entries.length > MAX_SAVED_CHARTS) return { saved: false, warning: TOO_LARGE_WARNING };
    const raw = JSON.stringify({
      version: 1,
      entries: entries.map((entry) => ({
        id: entry.id,
        // Exclude derived harmony; validation reconstructs it from chord highways.
        chart: JSON.parse(serializeSharedChart(entry.chart)),
        fileName: cleanFileName(entry.fileName),
        addedAt: entry.addedAt,
        ...(typeof entry.audio === "boolean" ? { audio: entry.audio } : {}),
      })),
    });
    if (raw.length * 2 > MAX_SONG_LIBRARY_BYTES) return { saved: false, warning: TOO_LARGE_WARNING };
    target.setItem(SONG_LIBRARY_KEY, raw);
    return { saved: true, warning: null };
  } catch {
    return { saved: false, warning: UNAVAILABLE_WARNING };
  }
}
