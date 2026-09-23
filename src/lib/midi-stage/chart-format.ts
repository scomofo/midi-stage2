import type { Harmony, Instrument, Part, Song } from "./types.ts";
import { INSTRUMENTS } from "./types.ts";
import { DRUMS } from "./engine.ts";
import { LABELS } from "./songs.ts";

/**
 * Shared Chart Format — the versioned interchange between the `midi-stage`
 * Song Workshop and `midi-stage2`.
 *
 * Wire-compatible with charts exported by the workshop (`schema:
 * "midi-stage-chart"`). This module validates untrusted input with clear,
 * coded errors and converts it to midi-stage2's `Song` model, which feeds the
 * existing `makeChart` / `Judge` pipeline unchanged.
 *
 * Pure and framework-free: no DOM, no audio, no network. Safe to unit test
 * with `node --test`.
 *
 * Full field reference and mapping decisions: `docs/chart-format.md`.
 */

export const CHART_SCHEMA = "midi-stage-chart" as const;
export const CHART_VERSIONS = [1, 2, 3] as const;
export type ChartVersion = (typeof CHART_VERSIONS)[number];

const MAX_NOTES = 60000;
const MAX_MAP_POINTS = 20000;
const MAX_JSON_BYTES = 12 * 1024 * 1024;
const MAX_SECONDS = 3600;

export type ChartFormatErrorCode =
  | "BAD_JSON"
  | "NOT_AN_OBJECT"
  | "BAD_SCHEMA"
  | "UNSUPPORTED_VERSION"
  | "UNSUPPORTED_MATCHING"
  | "OUT_OF_RANGE"
  | "INVALID_STRING"
  | "INVALID_PARTS"
  | "DRUM_PITCH_UNMAPPED"
  | "TOO_MANY_NOTES"
  | "VARIABLE_TEMPO_UNSUPPORTED";

export class ChartFormatError extends Error {
  readonly code: ChartFormatErrorCode;
  readonly path?: string;

  constructor(code: ChartFormatErrorCode, message: string, path?: string) {
    super(path ? `${message} (at ${path})` : message);
    this.name = "ChartFormatError";
    this.code = code;
    if (path !== undefined) this.path = path;
  }
}

export interface SharedNote {
  time: number;
  duration: number;
  pitch: number;
  velocity: number;
}

export interface SharedPart {
  type: Instrument;
  notes: SharedNote[];
}

export interface SharedTempoPoint {
  time: number;
  bpm: number;
}

export interface SharedBeat {
  time: number;
  bar: boolean;
}

export interface SharedChordTarget {
  time: number;
  duration: number;
  name: string;
  roman: string;
  pitches: number[];
}

export interface SharedSection {
  time: number;
  name: string;
}

/** Canonical, normalized form of a shared chart. `validateSharedChart` output. */
export interface SharedChart {
  schema: typeof CHART_SCHEMA;
  version: ChartVersion;
  id: string;
  title: string;
  bpm: number;
  duration: number;
  firstBeat: number;
  audioOffset: number;
  audioName: string;
  origin: string;
  /** Always 4 entries in INSTRUMENTS order; notes sorted by (time, pitch), deduped. */
  parts: SharedPart[];
  /** Always non-empty and constant (single entry) in v1. */
  tempoMap: SharedTempoPoint[];
  /** As authored; empty means "generate from firstBeat + bpm". */
  beats: SharedBeat[];
  /** Always non-empty. */
  sections: SharedSection[];
  /** Derived from v3 chordHighways (keys + guitar merged, sorted by time). */
  harmony: Harmony[];
  /** Normalized v3 chord targets, kept for re-serialization. */
  chordHighways: { keys: SharedChordTarget[]; guitar: SharedChordTarget[] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(code: ChartFormatErrorCode, message: string, path: string): never {
  throw new ChartFormatError(code, message, path);
}

function num(v: unknown, min: number, max: number, label: string, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    fail("OUT_OF_RANGE", `${label} must be a finite number between ${min} and ${max}`, path);
  }
  return v as number;
}

function int(v: unknown, min: number, max: number, label: string, path: string): number {
  const n = num(v, min, max, label, path);
  if (!Number.isInteger(n)) fail("OUT_OF_RANGE", `${label} must be a whole number`, path);
  return n;
}

function str(v: unknown, label: string, path: string, max: number, fallback?: string): string {
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    fail("INVALID_STRING", `${label} is required`, path);
  }
  if (typeof v !== "string") fail("INVALID_STRING", `${label} must be a string`, path);
  const s = (v as string).slice(0, max);
  if (!s.trim()) fail("INVALID_STRING", `${label} must not be empty`, path);
  return s;
}

function optStr(v: unknown, label: string, path: string, max: number, fallback: string): string {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string") fail("INVALID_STRING", `${label} must be a string`, path);
  return (v as string).slice(0, max);
}

function checkParts(raw: unknown, duration: number): SharedPart[] {
  const path = "parts";
  if (!Array.isArray(raw) || raw.length !== 4) {
    fail("INVALID_PARTS", "A chart must contain exactly four instrument parts", path);
  }
  const byType = new Map<string, Record<string, unknown>>();
  for (const [i, p] of (raw as unknown[]).entries()) {
    if (!isRecord(p) || typeof p.type !== "string" || !INSTRUMENTS.includes(p.type as Instrument)) {
      fail("INVALID_PARTS", `Part ${i} must declare a type of ${INSTRUMENTS.join("/")}`, `${path}[${i}]`);
    }
    if (byType.has(p.type as string)) fail("INVALID_PARTS", `Duplicate part type "${p.type}"`, `${path}[${i}]`);
    byType.set(p.type as string, p);
  }
  let total = 0;
  const parts = INSTRUMENTS.map((type) => {
    const p = byType.get(type)!;
    const rawNotes = p.notes;
    if (!Array.isArray(rawNotes)) fail("INVALID_PARTS", `Part "${type}" must have a notes array`, `${path}.${type}`);
    const notes: SharedNote[] = (rawNotes as unknown[]).map((n, i) => {
      const np = `parts.${type}.notes[${i}]`;
      if (!isRecord(n)) fail("OUT_OF_RANGE", "Note must be an object", np);
      const time = num(n.time, 0, duration - 0.000001, "Note time", `${np}.time`);
      const noteDur = num(n.duration, 0.02, MAX_SECONDS, "Note duration", `${np}.duration`);
      if (time + noteDur > duration + 0.00001) {
        fail("OUT_OF_RANGE", "Note extends beyond the song duration", np);
      }
      const pitch = int(n.pitch, 0, 127, "MIDI pitch", `${np}.pitch`);
      if (type === "drums" && !DRUMS.some((d) => d.notes?.includes(pitch))) {
        fail("DRUM_PITCH_UNMAPPED", `Drum pitch ${pitch} maps to no drum lane`, `${np}.pitch`);
      }
      const velocity = n.velocity === undefined || n.velocity === null
        ? 100
        : int(n.velocity, 1, 127, "Velocity", `${np}.velocity`);
      return { time, duration: noteDur, pitch, velocity };
    });
    total += notes.length;
    if (total > MAX_NOTES) fail("TOO_MANY_NOTES", `A chart can contain at most ${MAX_NOTES} notes`, path);
    // Canonical order + exact (time, pitch) duplicates dropped, like the workshop.
    const seen = new Set<string>();
    const deduped = notes
      .sort((a, b) => a.time - b.time || a.pitch - b.pitch)
      .filter((n) => {
        const key = `${n.time}:${n.pitch}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { type, notes: deduped };
  });
  return parts;
}

function checkTempoMap(raw: unknown, duration: number, bpm: number): SharedTempoPoint[] {
  const path = "tempoMap";
  const list = raw === undefined || raw === null ? [] : raw;
  if (!Array.isArray(list) || list.length > MAX_MAP_POINTS) {
    fail("OUT_OF_RANGE", "Invalid tempo map", path);
  }
  let prev = -1;
  const points = (list as unknown[]).map((t, i) => {
    const tp = `${path}[${i}]`;
    if (!isRecord(t)) fail("OUT_OF_RANGE", "Tempo point must be an object", tp);
    const time = num(t.time, 0, duration, "Tempo time", `${tp}.time`);
    if (time <= prev) fail("OUT_OF_RANGE", "Tempo map must be sorted with unique times", tp);
    prev = time;
    return { time, bpm: num(t.bpm, 0.01, 6e7, "Tempo bpm", `${tp}.bpm`) };
  });
  if (!points.length) return [{ time: 0, bpm }];
  const first = points[0]!.bpm;
  if (!points.every((p) => Math.abs(p.bpm - first) < 1e-9)) {
    fail(
      "VARIABLE_TEMPO_UNSUPPORTED",
      "Stage 2 plays at a constant tempo; charts with tempo changes are not supported yet",
      path,
    );
  }
  return [{ time: 0, bpm: first }];
}

function checkBeats(raw: unknown, duration: number): SharedBeat[] {
  const path = "beats";
  const list = raw === undefined || raw === null ? [] : raw;
  if (!Array.isArray(list) || list.length > MAX_MAP_POINTS) {
    fail("OUT_OF_RANGE", "Too many beat markers", path);
  }
  let prev = -1;
  return (list as unknown[]).map((b, i) => {
    const bp = `${path}[${i}]`;
    if (!isRecord(b)) fail("OUT_OF_RANGE", "Beat marker must be an object", bp);
    const time = num(b.time, 0, duration + 0.00001, "Beat time", `${bp}.time`);
    if (time <= prev) fail("OUT_OF_RANGE", "Beat markers must be sorted with unique times", bp);
    prev = time;
    return { time, bar: !!b.bar };
  });
}

function checkChordHighways(
  raw: unknown,
  duration: number,
): { keys: SharedChordTarget[]; guitar: SharedChordTarget[] } {
  const out = { keys: [] as SharedChordTarget[], guitar: [] as SharedChordTarget[] };
  if (raw === undefined || raw === null) return out;
  if (!isRecord(raw)) fail("OUT_OF_RANGE", "Invalid chord-highway data", "chordHighways");
  for (const role of ["keys", "guitar"] as const) {
    const list = (raw as Record<string, unknown>)[role] ?? [];
    if (!Array.isArray(list) || list.length > 10000) {
      fail("OUT_OF_RANGE", `${role} chord highway has too many targets`, `chordHighways.${role}`);
    }
    let last = -1;
    out[role] = (list as unknown[]).map((e, i) => {
      const ep = `chordHighways.${role}[${i}]`;
      if (!isRecord(e)) fail("OUT_OF_RANGE", "Chord target must be an object", ep);
      const time = num(e.time, 0, duration - 0.000001, "Chord time", `${ep}.time`);
      const length = num(e.duration, 0.05, MAX_SECONDS, "Chord duration", `${ep}.duration`);
      if (time + length > duration + 0.00001) fail("OUT_OF_RANGE", "A chord extends beyond the song", ep);
      if (time < last - 0.00001) fail("OUT_OF_RANGE", "Chord targets must be sorted by time", ep);
      last = time;
      if (!Array.isArray(e.pitches)) fail("OUT_OF_RANGE", "Chord targets need 2–6 MIDI pitches", `${ep}.pitches`);
      const pitches = [...new Set((e.pitches as unknown[]).map((v) => int(v, 0, 127, "Chord pitch", `${ep}.pitches`)))].sort(
        (a, b) => a - b,
      );
      if (pitches.length < 2 || pitches.length > 6) {
        fail("OUT_OF_RANGE", "Chord targets need 2–6 distinct MIDI pitches", `${ep}.pitches`);
      }
      return {
        time,
        duration: length,
        name: optStr(e.name, "Chord name", `${ep}.name`, 32, ""),
        roman: optStr(e.roman, "Chord roman", `${ep}.roman`, 8, ""),
        pitches,
      };
    });
  }
  return out;
}

function checkSections(raw: unknown, duration: number, title: string): SharedSection[] {
  if (raw === undefined || raw === null) return [{ time: 0, name: title }];
  if (!Array.isArray(raw)) fail("OUT_OF_RANGE", "Sections must be an array", "sections");
  let prev = -1;
  const sections = (raw as unknown[]).map((s, i) => {
    const sp = `sections[${i}]`;
    if (!isRecord(s)) fail("OUT_OF_RANGE", "Section must be an object", sp);
    const time = num(s.time, 0, duration, "Section time", `${sp}.time`);
    if (time < prev - 0.00001) fail("OUT_OF_RANGE", "Sections must be sorted by time", sp);
    prev = time;
    return { time, name: str(s.name, "Section name", `${sp}.name`, 160) };
  });
  return sections.length ? sections : [{ time: 0, name: title }];
}

/**
 * Validate untrusted input against the shared chart contract and return the
 * canonical normalized form. Throws `ChartFormatError` on any problem.
 */
export function validateSharedChart(input: unknown): SharedChart {
  if (!isRecord(input)) fail("NOT_AN_OBJECT", "Chart must be a JSON object", "");
  const root = input;
  if (root.schema !== CHART_SCHEMA) {
    fail("BAD_SCHEMA", `Chart schema must be "${CHART_SCHEMA}"`, "schema");
  }
  const version = root.version;
  if (version !== 1 && version !== 2 && version !== 3) {
    fail("UNSUPPORTED_VERSION", "Unsupported chart version", "version");
  }
  if (version === 2 || root.matching === "rhythm") {
    fail(
      "UNSUPPORTED_MATCHING",
      'Rhythm-only charts ("matching": "rhythm") are not playable in Stage 2 yet',
      "matching",
    );
  }

  const duration = num(root.duration, 0.25, MAX_SECONDS, "Song duration", "duration");
  const bpm = num(root.bpm, 20, 400, "Tempo", "bpm");
  const id = str(root.id, "Chart id", "id", 160);
  const title = str(root.title, "Chart title", "title", 160).trim() || "Untitled chart";
  const firstBeat = root.firstBeat === undefined || root.firstBeat === null
    ? 0
    : num(root.firstBeat, 0, duration, "First beat", "firstBeat");
  const audioOffset = root.audioOffset === undefined || root.audioOffset === null
    ? 0
    : num(root.audioOffset, -120, 120, "Audio offset", "audioOffset");
  const audioName = optStr(root.audioName, "Audio name", "audioName", 256, "");
  const origin = optStr(root.origin, "Origin", "origin", 32, "manual");

  const parts = checkParts(root.parts, duration);
  const tempoMap = checkTempoMap(root.tempoMap, duration, bpm);
  const beats = checkBeats(root.beats, duration);
  const chordHighways = checkChordHighways(root.chordHighways, duration);
  const sections = checkSections(root.sections, duration, title);

  const hasChords = chordHighways.keys.length > 0 || chordHighways.guitar.length > 0;
  const harmony: Harmony[] = [...chordHighways.keys, ...chordHighways.guitar]
    .sort((a, b) => a.time - b.time)
    .map((c) => ({ time: c.time, duration: c.duration, name: c.name || "Chord", roman: c.roman }));

  return {
    schema: CHART_SCHEMA,
    version: hasChords ? 3 : (version as ChartVersion),
    id,
    title,
    bpm,
    duration,
    firstBeat,
    audioOffset,
    audioName,
    origin,
    parts,
    tempoMap,
    beats,
    sections,
    harmony,
    chordHighways,
  };
}

/** Parse a JSON string into a canonical `SharedChart`. Enforces a 12 MB cap. */
export function parseSharedChartText(text: string): SharedChart {
  if (typeof text !== "string" || text.length > MAX_JSON_BYTES) {
    throw new ChartFormatError("BAD_JSON", "Chart JSON must be a string smaller than 12 MB");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ChartFormatError("BAD_JSON", "Chart file is not valid JSON");
  }
  return validateSharedChart(raw);
}

function generateBeats(firstBeat: number, bpm: number, duration: number): SharedBeat[] {
  const beat = 60 / bpm;
  const out: SharedBeat[] = [];
  for (let i = 0; i < MAX_MAP_POINTS; i++) {
    const time = firstBeat + i * beat;
    if (time > duration + 1e-8) break;
    out.push({ time, bar: i % 4 === 0 });
  }
  return out;
}

/**
 * Convert a canonical shared chart to midi-stage2's `Song` model.
 * The result feeds the existing `makeChart(song, player)` / `Judge` pipeline
 * unchanged — no procedural-song code is touched.
 */
export function sharedChartToSong(chart: SharedChart): Song {
  const parts: Part[] = INSTRUMENTS.map((type, i) => {
    const src = chart.parts.find((p) => p.type === type)!;
    return {
      id: type,
      name: LABELS[type]!,
      type,
      channel: type === "drums" ? 10 : i,
      notes: src.notes.map((n) => ({ ...n })),
    };
  });
  return {
    id: chart.id,
    name: chart.title,
    subtitle: "",
    tag: "IMPORT",
    bpm: chart.bpm,
    duration: chart.duration,
    original: false,
    parts,
    beats: chart.beats.length
      ? chart.beats.map((b) => ({ time: b.time, bar: b.bar }))
      : generateBeats(chart.firstBeat, chart.bpm, chart.duration),
    sections: chart.sections.map((s) => ({ time: s.time, name: s.name })),
    harmony: chart.harmony.length ? chart.harmony.map((h) => ({ ...h })) : undefined,
    audioOffset: chart.audioOffset,
    audioName: chart.audioName,
    tempoMap: chart.tempoMap.map((t) => ({ ...t })),
    art: "open",
  };
}

/**
 * Parse a shared chart (JSON string or already-parsed object) all the way to
 * a playable `Song`. Throws `ChartFormatError` on invalid input.
 */
export function parseSharedChart(input: unknown): Song {
  const chart = typeof input === "string" ? parseSharedChartText(input) : validateSharedChart(input);
  return sharedChartToSong(chart);
}

/** Emit the canonical JSON form. `parse(serialize(parse(x)))` is stable. */
export function serializeSharedChart(chart: SharedChart): string {
  const { schema, version, id, title, bpm, duration, firstBeat, audioOffset, audioName, origin, parts, tempoMap, beats, sections, chordHighways } =
    chart;
  const wire: Record<string, unknown> = {
    schema,
    version,
    id,
    title,
    bpm,
    duration,
    firstBeat,
    audioOffset,
    audioName,
    origin,
    parts,
    tempoMap,
    beats,
    sections,
  };
  if (chordHighways.keys.length || chordHighways.guitar.length) wire.chordHighways = chordHighways;
  return JSON.stringify(wire, null, 2);
}
