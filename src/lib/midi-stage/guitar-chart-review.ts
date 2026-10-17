import { validateSharedChart, type SharedChart } from "./chart-format.ts";
import { withReviewedAudioPart } from "./audio-part-review.ts";
import type { GuitarPosition } from "./types.ts";

export type GuitarReviewRow = { id: number; time: string; duration: string; string: string; fret: string; velocity: number; confidence?: number };

export function guitarReviewRows(chart: SharedChart): GuitarReviewRow[] {
  return chart.parts.find((part) => part.type === "guitar")!.notes.map((note, id) => ({
    id, time: String(note.time), duration: String(note.duration),
    string: String(note.guitarPosition!.string), fret: String(note.guitarPosition!.fret), velocity: note.velocity, confidence: note.confidence,
  }));
}

/** Validate a complete draft before it can replace the import candidate. */
export function applyGuitarReview(source: SharedChart, rows: GuitarReviewRow[], tempo: string): SharedChart {
  if (source.guitarMode !== "strings" || !source.guitarTuning) throw new Error("This chart has no authored guitar positions.");
  if (!rows.length) throw new Error("Keep at least one guitar note.");
  const value = (text: string, label: string) => {
    if (!text.trim() || !Number.isFinite(Number(text))) throw new Error(`${label} needs a number.`);
    return Number(text);
  };
  const bpm = value(tempo, "Tempo");
  if (bpm < 20 || bpm > 400) throw new Error("Tempo must be between 20 and 400 BPM.");
  const fixedTimeline = source.origin.startsWith("audio-");
  const scale = fixedTimeline ? 1 : source.bpm / bpm;
  const notes = rows.map((row, index) => {
    const string = value(row.string, `Note ${index + 1} string`);
    const fret = value(row.fret, `Note ${index + 1} fret`);
    if (!Number.isInteger(string) || string < 1 || string > 6 || !Number.isInteger(fret) || fret < 0 || fret > 24) {
      throw new Error(`Note ${index + 1} needs a string 1–6 and a whole fret 0–24.`);
    }
    return {
      time: value(row.time, `Note ${index + 1} time`) * scale,
      duration: value(row.duration, `Note ${index + 1} length`) * scale,
      velocity: row.velocity,
      ...(row.confidence !== undefined ? { confidence: row.confidence } : {}),
      pitch: source.guitarTuning![6 - string]! + fret,
      guitarPosition: { string: string as GuitarPosition["string"], fret },
    };
  });
  const originalNotes = source.parts.find((part) => part.type === "guitar")!.notes;
  const unchangedNotes = originalNotes.length === notes.length && notes.every((note, index) => {
    const original = originalNotes[index]!;
    return Number(rows[index]!.time) === original.time && Number(rows[index]!.duration) === original.duration
      && note.guitarPosition.string === original.guitarPosition!.string && note.guitarPosition.fret === original.guitarPosition!.fret;
  });
  if (fixedTimeline && notes.some((note) => note.time < 0 || note.duration < 0.02 || note.time + note.duration > source.duration + 1e-6)) {
    throw new Error("Guitar notes must fit inside the original recording and last at least 0.02 seconds.");
  }
  if (fixedTimeline) return withReviewedAudioPart(source, "guitar", notes, bpm);
  const duration = fixedTimeline ? source.duration : Math.max(source.duration, ...notes.map((n) => n.time / scale + n.duration / scale)) * scale;
  return validateSharedChart({
    ...source, bpm, duration,
    firstBeat: source.firstBeat * scale,
    audioOffset: source.audioOffset * scale,
    tempoMap: [{ time: 0, bpm }],
    parts: source.parts.map((part) => ({ ...part, notes: part.type === "guitar" ? notes
      : part.notes.map((note) => ({ ...note, time: note.time * scale, duration: note.duration * scale })) })),
    beats: source.beats.map((beat) => ({ ...beat, time: beat.time * scale })),
    sections: source.sections.map((section) => ({ ...section, time: section.time * scale })),
    chordHighways: Object.fromEntries(Object.entries(source.chordHighways).map(([part, targets]) => [part,
      part === "guitar" && !unchangedNotes ? [] : targets.map((target) => ({ ...target, time: target.time * scale, duration: target.duration * scale }))])),
  });
}
