import type { GuitarPosition } from "./types.ts";

export type FingeringEvent = {
  startTimeSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number;
};

export type FingeringAssignment = FingeringEvent & { string: GuitarPosition["string"]; fret: number };

type Position = { string: GuitarPosition["string"]; fret: number };
type Solution = { assignments: FingeringAssignment[]; cost: number; center: number };

const CHORD_WINDOW = 0.03;

function positionsFor(pitch: number, tuning: readonly number[]): Position[] {
  const positions: Position[] = [];
  for (let low = 0; low < tuning.length; low++) {
    const fret = pitch - tuning[low]!;
    if (fret >= 0 && fret <= 24) {
      positions.push({ string: (6 - low) as GuitarPosition["string"], fret });
    }
  }
  return positions;
}

function groupOnsets(events: FingeringEvent[]): FingeringEvent[][] {
  const sorted = [...events].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.pitchMidi - b.pitchMidi);
  const groups: FingeringEvent[][] = [];
  for (const event of sorted) {
    const last = groups.at(-1);
    if (!last || event.startTimeSeconds - last[0]!.startTimeSeconds > CHORD_WINDOW) groups.push([event]);
    else last.push(event);
  }
  return groups;
}

function shapeCost(positions: Position[], previousCenter: number) {
  const fretted = positions.filter((p) => p.fret > 0);
  const min = fretted.length ? Math.min(...fretted.map((p) => p.fret)) : 0;
  const max = fretted.length ? Math.max(...fretted.map((p) => p.fret)) : 0;
  const center = fretted.length ? fretted.reduce((sum, p) => sum + p.fret, 0) / fretted.length : previousCenter;
  const span = max - min;
  const openBonus = positions.filter((p) => p.fret === 0).length * 0.45;
  const highPenalty = positions.reduce((sum, p) => sum + Math.max(0, p.fret - 17) * 0.6, 0);
  const spanPenalty = Math.max(0, span - 4) ** 2 * 2.5;
  const travel = Math.abs(center - previousCenter) * 1.7;
  return { cost: travel + spanPenalty + highPenalty - openBonus, center };
}

function solveGroup(
  events: FingeringEvent[],
  tuning: readonly number[],
  activeUntil: number[],
  previousCenter: number,
): Solution | null {
  const ordered = [...events].sort((a, b) => a.pitchMidi - b.pitchMidi);
  let best: Solution | null = null;

  function visit(index: number, used: Set<number>, picked: Position[]) {
    if (index === ordered.length) {
      const { cost, center } = shapeCost(picked, previousCenter);
      const assignments = ordered.map((event, i) => ({ ...event, ...picked[i]! }));
      if (!best || cost < best.cost) best = { assignments, cost, center };
      return;
    }

    const event = ordered[index]!;
    const options = positionsFor(event.pitchMidi, tuning)
      .filter((position) => !used.has(position.string))
      .filter((position) => activeUntil[position.string] <= event.startTimeSeconds + 0.015)
      .sort((a, b) => a.fret - b.fret);

    for (const option of options) {
      used.add(option.string);
      picked.push(option);
      visit(index + 1, used, picked);
      picked.pop();
      used.delete(option.string);
    }
  }

  visit(0, new Set(), []);
  return best;
}

export function solveGuitarFingering(
  events: FingeringEvent[],
  tuning: readonly number[],
): { assignments: FingeringAssignment[]; dropped: FingeringEvent[] } {
  if (tuning.length !== 6) throw new Error("Guitar fingering needs six tuning pitches.");
  const activeUntil = Array(7).fill(-Infinity) as number[];
  const assignments: FingeringAssignment[] = [];
  const dropped: FingeringEvent[] = [];
  let previousCenter = 5;

  for (const group of groupOnsets(events)) {
    const solution = solveGroup(group, tuning, activeUntil, previousCenter);
    if (!solution) {
      // Salvage playable single notes rather than dropping an entire dense group.
      for (const event of group) {
        const single = solveGroup([event], tuning, activeUntil, previousCenter);
        if (!single) {
          dropped.push(event);
          continue;
        }
        const assignment = single.assignments[0]!;
        assignments.push(assignment);
        activeUntil[assignment.string] = assignment.startTimeSeconds + assignment.durationSeconds;
        previousCenter = single.center;
      }
      continue;
    }
    for (const assignment of solution.assignments) {
      assignments.push(assignment);
      activeUntil[assignment.string] = assignment.startTimeSeconds + assignment.durationSeconds;
    }
    previousCenter = solution.center;
  }

  return {
    assignments: assignments.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.pitchMidi - b.pitchMidi),
    dropped,
  };
}
