import assert from "node:assert/strict";
import test from "node:test";
import { nextVisibleLaneTimes, rendererBeatStart, rendererNoteWindow } from "./renderer-window";
import type { ChartNote, Song } from "./types";

type Note = Pick<ChartNote, "time" | "lane" | "state">;

function previousCandidates(notes: Note[], time: number, speed: number) {
  const lo = Math.max(0, notes.findIndex((note) => note.time >= time - 0.5 * speed));
  const indices: number[] = [];
  let drawn = 0;
  for (let i = Math.min(notes.length, lo + 900) - 1; i >= Math.max(0, lo - 8); i--) {
    indices.push(i);
    if (++drawn > 900) break;
  }
  return indices;
}

function previousNext(notes: Note[], lanes: number, time: number) {
  const next = Array.from({ length: lanes }, () => Infinity);
  for (const note of notes) {
    if (note.state === 0 && note.time >= time - 0.08 && note.time < next[note.lane]!) {
      next[note.lane] = note.time;
    }
  }
  return next;
}

test("candidate lookup preserves legacy order and budget through seeking and the chart end", () => {
  for (const length of [0, 8, 899, 900, 901, 1800]) {
    const notes: Note[] = Array.from({ length }, (_, i) => ({ time: i * 0.05, lane: i % 8, state: 0 }));
    for (const speed of [0.5, 1, 1.5]) {
      // Descending times also exercise backward seeks without cached cursors.
      for (const time of [100, 90, 89.5, 50, 0.5, 0, -3]) {
        const { start, end } = rendererNoteWindow(notes, time, speed);
        const actual = Array.from({ length: end - start }, (_, i) => end - 1 - i);
        assert.deepEqual(actual, previousCandidates(notes, time, speed), `${length} notes at ${time}/${speed}`);
        assert.ok(actual.length <= 901, "must not expand the existing per-pass draw budget");
      }
    }
  }
});

test("lane lookahead skips resolved notes and preserves every visible approach cue", () => {
  const notes: Note[] = [
    { time: 9.919, lane: 0, state: 0 },
    { time: 9.92, lane: 1, state: 0 },
    { time: 10, lane: 0, state: 1 },
    { time: 10, lane: 2, state: 2 },
    { time: 10.1, lane: 0, state: 0 },
    { time: 10.1, lane: 2, state: 0 },
    { time: 10.2, lane: 2, state: 0 },
    { time: 11, lane: 3, state: 0 },
    { time: 12.7, lane: 4, state: 0 },
    { time: 50, lane: 5, state: 0 },
  ];
  assert.deepEqual(nextVisibleLaneTimes(notes, 6, 10, 2.7), [10.1, 9.92, 10.1, 11, Infinity, Infinity]);
  for (const time of [51, 12.7, 10.08, 10, 9, -2]) {
    for (const look of [1.35, 2.7, 4.05]) {
      const expected = previousNext(notes, 6, time).map((next) => next < time + look ? next : Infinity);
      assert.deepEqual(nextVisibleLaneTimes(notes, 6, time, look), expected);
    }
  }
});

test("beat lookup preserves rendered lines including the final apron and empty charts", () => {
  const drawn = (beats: Song["beats"], start: number, time: number, look: number) => {
    const result: number[] = [];
    for (let i = start; i < beats.length && beats[i]!.time < time + look; i++) {
      const progress = 1 - (beats[i]!.time - time) / look;
      if (progress >= 0 && progress <= 1.14) result.push(i);
    }
    return result;
  };
  for (const length of [0, 1, 2000]) {
    const beats = Array.from({ length }, (_, i) => ({ time: i * 0.125, bar: i % 4 === 0 }));
    const last = beats.at(-1)?.time ?? 0;
    for (const time of [-3, 0, 8, last, last + 0.2, last + 0.21, last + 0.35, last + 3]) {
      for (const look of [1.35, 2.7, 4.05]) {
        const previous = Math.max(0, beats.findIndex((beat) => beat.time >= time - 0.2));
        assert.deepEqual(drawn(beats, rendererBeatStart(beats, time, look), time, look), drawn(beats, previous, time, look));
      }
    }
  }
});

test("60,000-note lookups read a bounded local window rather than the entire imported chart", () => {
  let reads = 0;
  const notes: Note[] = Array.from({ length: 60000 }, (_, i) => ({
    get time() { reads++; return i * 0.05; },
    lane: i % 8,
    state: i % 3 === 0 ? 1 : 0,
  }));
  const time = 2400;
  const expected = previousNext(notes, 8, time);
  assert.ok(reads >= 40000, "reference must exercise the legacy whole-chart scan");
  reads = 0;
  assert.deepEqual(nextVisibleLaneTimes(notes, 8, time, 2.7), expected);
  const { start, end } = rendererNoteWindow(notes, time, 1);
  assert.ok(end - start <= 901);
  assert.ok(reads < 250, `local note lookup read ${reads} timestamps`);

  const beats: Song["beats"] = Array.from({ length: 20000 }, (_, i) => ({
    get time() { reads++; return i * 0.125; },
    bar: i % 4 === 0,
  }));
  reads = 0;
  const beatStart = rendererBeatStart(beats, 2500.1, 2.7);
  for (let i = beatStart; i < beats.length; i++) void beats[i]!.time;
  assert.ok(reads < 100, `final beat window read ${reads} timestamps`);
});
