import type { ChartNote, GuitarPosition } from "./types";

export type GuitarPreviewShape = {
  time: number;
  name?: string;
  targets: GuitarPosition[];
  /** Pitches matched to these authored targets, not verified physical strings. */
  hitTargets: GuitarPosition[];
  lanes: number[];
};

/** Preview authored shapes without consuming notes. A physical strum arrives
 * as several MIDI messages, so a partly played chord keeps its whole shape. */
export function getGuitarPreview(
  notes: readonly ChartNote[],
  time: number,
  lateWindow: number,
): { current: GuitarPreviewShape | null; following: GuitarPreviewShape | null } {
  if (!Number.isFinite(time) || !Number.isFinite(lateWindow)) return { current: null, following: null };
  const earliest = time - Math.max(0, lateWindow) - 1e-8;
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid]!.time < earliest) lo = mid + 1;
    else hi = mid;
  }

  const shapes: GuitarPreviewShape[] = [];
  for (let start = lo; start < notes.length && shapes.length < 2;) {
    const groupTime = notes[start]!.time;
    let end = start + 1;
    while (end < notes.length && notes[end]!.time === groupTime) end++;
    let unresolved = false;
    let name: string | undefined;
    const targets: GuitarPosition[] = [];
    const hitTargets: GuitarPosition[] = [];
    const lanes = new Set<number>();
    for (let index = start; index < end; index++) {
      const note = notes[index]!;
      unresolved ||= note.state === 0;
      name ??= note.name;
      lanes.add(note.lane);
      if (note.guitarPosition && !targets.some((position) => position.string === note.guitarPosition!.string && position.fret === note.guitarPosition!.fret)) {
        targets.push({ ...note.guitarPosition });
      }
      if (note.state === 1 && note.guitarPosition && !hitTargets.some((position) => position.string === note.guitarPosition!.string && position.fret === note.guitarPosition!.fret)) {
        hitTargets.push({ ...note.guitarPosition });
      }
    }
    if (unresolved) shapes.push({ time: groupTime, name, targets, hitTargets, lanes: [...lanes].sort((a, b) => a - b) });
    start = end;
  }
  return { current: shapes[0] ?? null, following: shapes[1] ?? null };
}

export type FretboardWindow = {
  frets: number[];
  /** Frets omitted immediately before a displayed column; the UI labels gaps. */
  gaps: { before: number; from: number; to: number }[];
};

/** Keep all authored fretted targets in at most eight numbered columns.
 * Typical shapes use a contiguous five-fret window. Very wide voicings use
 * explicitly marked gaps rather than clipping a target or implying new frets.
 * Open strings belong in a separate marker column, never fret one. */
export function getFretboardWindow(targets: readonly GuitarPosition[]): FretboardWindow {
  const targetFrets = [...new Set(targets.map((target) => target.fret)
    .filter((fret) => Number.isInteger(fret) && fret >= 1 && fret <= 24))].sort((a, b) => a - b);
  const first = targetFrets[0] ?? 1;
  const last = targetFrets.at(-1) ?? first;
  let frets: number[];
  if (last - first < 8) {
    const width = Math.max(5, last - first + 1);
    const start = Math.min(first, 25 - width);
    frets = Array.from({ length: width }, (_, index) => start + index);
  } else {
    const displayed = new Set(targetFrets);
    // Add useful neighbours without ever removing an authored target.
    for (let distance = 1; distance <= 24 && displayed.size < 8; distance++) {
      for (const fret of targetFrets) {
        for (const neighbour of [fret + distance, fret - distance]) {
          if (displayed.size >= 8) break;
          if (neighbour >= 1 && neighbour <= 24) displayed.add(neighbour);
        }
      }
    }
    frets = [...displayed].sort((a, b) => a - b);
  }
  const gaps = frets.flatMap((fret, index) => index > 0 && fret > frets[index - 1]! + 1
    ? [{ before: fret, from: frets[index - 1]! + 1, to: fret - 1 }] : []);
  return { frets, gaps };
}
