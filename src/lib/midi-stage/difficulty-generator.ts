import type { SharedChart, SharedNote } from "./chart-format.ts";
import { validateSharedChart } from "./chart-format.ts";
import type { Difficulty } from "./types.ts";

function byTimePitch(a: SharedNote, b: SharedNote) {
  return a.time - b.time || a.pitch - b.pitch;
}

function simplifyGroup(notes: SharedNote[], difficulty: Difficulty): SharedNote[] {
  if (difficulty === "expert" || notes.length <= 1) return notes;
  if (difficulty === "standard") {
    if (notes.length <= 3) return notes;
    const sorted = [...notes].sort((a, b) => a.pitch - b.pitch);
    return [sorted[0]!, sorted[Math.floor((sorted.length - 1) / 2)]!, sorted.at(-1)!]
      .filter((n, i, arr) => arr.indexOf(n) === i);
  }
  const sorted = [...notes].sort((a, b) => a.pitch - b.pitch);
  return notes.length === 2 ? [sorted[0]!] : [sorted[0]!, sorted.at(-1)!];
}

function thinNotes(notes: SharedNote[], difficulty: Difficulty): SharedNote[] {
  if (difficulty === "expert") return [...notes];
  const minGap = difficulty === "standard" ? 0.075 : 0.15;
  const groups: SharedNote[][] = [];
  for (const note of [...notes].sort(byTimePitch)) {
    const last = groups.at(-1);
    if (!last || Math.abs(note.time - last[0]!.time) > 0.025) groups.push([note]);
    else last.push(note);
  }
  const simplified = groups.map((g) => simplifyGroup(g, difficulty));
  const out: SharedNote[] = [];
  let lastOnset = -Infinity;
  for (const group of simplified) {
    const onset = group[0]!.time;
    if (onset - lastOnset < minGap) continue;
    out.push(...group);
    lastOnset = onset;
  }
  return out;
}

export function generateDifficulty(chart: SharedChart, difficulty: Difficulty): SharedChart {
  if (difficulty === "expert") return validateSharedChart(chart);
  return validateSharedChart({
    ...chart,
    id: `${chart.id}-${difficulty}`,
    title: `${chart.title} · ${difficulty === "chill" ? "Easy" : "Medium"}`,
    origin: `${chart.origin}-difficulty`,
    parts: chart.parts.map((part) => ({
      ...part,
      notes: thinNotes(part.notes, difficulty),
    })),
    chordHighways: { keys: [], guitar: [] },
  });
}

export function generateDifficultySet(chart: SharedChart) {
  return {
    chill: generateDifficulty(chart, "chill"),
    standard: generateDifficulty(chart, "standard"),
    expert: generateDifficulty(chart, "expert"),
  };
}
