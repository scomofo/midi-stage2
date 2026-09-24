import { it } from "node:test";
import assert from "node:assert/strict";
import { Judge } from "./engine.ts";
import { recommendPractice } from "./practice-recommendation.ts";
import type { PracticeSection } from "./practice.ts";
import type { Chart, ChartNote } from "./types.ts";

type Target = Pick<ChartNote, "time" | "state" | "hold">;
const section = (start: number, end: number): PracticeSection => ({ id: `section:${start}`, name: `Passage ${start}`, start, end });
const sections = [section(0, 10), section(10, 20), section(20, 30)];
const target = (time: number, state: Target["state"] = 1, hold: Target["hold"] = null): Target => ({ time, state, hold });
const passage = (start: number, count: number, misses: number): Target[] => Array.from(
  { length: count }, (_, index) => target(start + (index + 1) * 9 / (count + 1), index < misses ? 2 : 1),
);

it("prefers the greater affected-target rate over a larger raw miss count", () => {
  const result = recommendPractice(sections, [...passage(0, 20, 6), ...passage(10, 8, 4)]);
  assert.deepEqual(result, { section: sections[1], notes: 8, misses: 4, brokenHolds: 0 });
});

it("breaks equal-rate ties by affected count, then by earliest onset regardless of input order", () => {
  const notes = [...passage(0, 8, 4), ...passage(10, 16, 8), ...passage(20, 16, 8)];
  assert.deepEqual(recommendPractice([...sections].reverse(), notes.reverse()), {
    section: sections[1], notes: 16, misses: 8, brokenHolds: 0,
  });
});

it("counts broken successful holds once and never double-counts a missed hold", () => {
  const notes = [
    target(1, 1, "broken"), target(2, 1, "complete"), target(3, 1, "held"), target(4, 1, "paused"),
    target(5), target(6), target(7, 2, "broken"), target(8, 2),
  ];
  assert.deepEqual(recommendPractice(sections, notes), { section: sections[0], notes: 8, misses: 2, brokenHolds: 1 });
});

it("can recommend holds alone without inventing a missed onset", () => {
  const notes = passage(10, 8, 0);
  notes[0]!.hold = "broken";
  assert.deepEqual(recommendPractice(sections, notes), { section: sections[1], notes: 8, misses: 0, brokenHolds: 1 });
});

it("assigns an exact section boundary to the next passage and excludes the song end", () => {
  const notes = [...passage(10, 6, 0), target(10, 2), target(19.999, 1, "broken"), target(20, 2), target(30, 2)];
  assert.deepEqual(recommendPractice(sections, notes), { section: sections[1], notes: 8, misses: 1, brokenHolds: 1 });
});

it("includes the opening onset and ignores pending and out-of-range targets", () => {
  const notes = [
    target(0, 2), ...passage(0, 7, 0), target(1, 0, "broken"), target(-1, 2), target(30, 2), target(NaN, 2),
  ];
  assert.deepEqual(recommendPractice(sections, notes), { section: sections[0], notes: 8, misses: 1, brokenHolds: 0 });
});

it("does not use pending targets to meet the eight-resolved-target threshold", () => {
  assert.equal(recommendPractice(sections, [...passage(0, 7, 3), target(8, 0), target(9, 0, "broken")]), null);
  assert.equal(recommendPractice(sections, [...passage(0, 7, 3), ...passage(10, 7, 3)]), null);
});

it("returns no recommendation for a clean take or fewer than two passages", () => {
  assert.equal(recommendPractice(sections, passage(0, 16, 0)), null);
  assert.equal(recommendPractice([sections[0]!], passage(0, 16, 8)), null);
  assert.equal(recommendPractice([], passage(0, 16, 8)), null);
});

it("suppresses all-miss and empty takes, but can target an unplayed section after a successful hit elsewhere", () => {
  assert.equal(recommendPractice(sections, [...passage(0, 8, 8), ...passage(10, 8, 8)]), null);
  assert.equal(recommendPractice(sections, []), null);
  assert.deepEqual(recommendPractice(sections, [...passage(0, 8, 8), target(15)]), {
    section: sections[0], notes: 8, misses: 8, brokenHolds: 0,
  });
});

it("combines simultaneous targets from multiple played instruments without deduplicating onsets", () => {
  const drums = passage(10, 4, 2);
  const keys = passage(10, 4, 0);
  keys[2]!.hold = "broken";
  assert.deepEqual(recommendPractice(sections, [...drums, ...keys]), {
    section: sections[1], notes: 8, misses: 2, brokenHolds: 1,
  });
});

it("does not mutate caller-owned sections or finished notes", () => {
  const frozenSections = Object.freeze(sections.map((part) => Object.freeze({ ...part })));
  const frozenNotes = Object.freeze([...passage(10, 8, 3), ...passage(0, 8, 3)].map((note) => Object.freeze(note)));
  const before = structuredClone({ sections: frozenSections, notes: frozenNotes });
  assert.equal(recommendPractice(frozenSections, frozenNotes)?.section.id, sections[0]!.id);
  assert.deepEqual({ sections: frozenSections, notes: frozenNotes }, before);
});

it("uses actual finalized Judge misses and keeps a cross-boundary broken hold with its onset", () => {
  const chart: Chart = {
    lanes: [{ name: "C", short: "C", pitch: 60, pc: 0, color: "#fff" }],
    notes: [...Array.from({ length: 7 }, (_, index) => index + 1), 9.5, ...Array.from({ length: 8 }, (_, index) => index + 11)]
      .map((time, id) => ({ id, time, duration: time === 9.5 ? 2 : 0.1, pitch: 60, velocity: 80, lane: 0, state: 0, hold: null })),
  };
  const judge = new Judge(chart, { difficulty: "standard", speed: 1, drums: false, onJudge: () => {} });
  for (const note of judge.notes) {
    if (note.time === 2 || note.time === 11) continue;
    judge.hit(note.time, note.lane, `note:${note.id}`);
    if (note.time === 9.5) judge.release(`note:${note.id}`, 10.1);
  }
  const stats = judge.finish(20);
  assert.equal(stats.miss, 2);
  assert.equal(stats.holdBreaks, 1);
  assert.deepEqual(recommendPractice(sections, judge.notes), {
    section: sections[0], notes: 8, misses: 1, brokenHolds: 1,
  });
});
