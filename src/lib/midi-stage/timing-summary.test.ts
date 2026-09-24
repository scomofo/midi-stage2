import { it } from "node:test";
import assert from "node:assert/strict";
import { Judge } from "./engine.ts";
import { MIN_TIMING_HITS, summarizeTiming, TIMING_CENTER_MS } from "./timing-summary.ts";
import type { Chart } from "./types.ts";

function playOffsets(offsets: readonly number[], speed: number): Judge {
  const chart: Chart = {
    lanes: [{ name: "Hit", short: "HIT", pitch: 60, pc: 0, color: "#8fd4c4" }],
    notes: offsets.map((_, id) => ({
      id, time: 30 + id, lane: 0, duration: 0.06, pitch: 60, velocity: 80,
      state: 0, hold: null,
    })),
  };
  const judge = new Judge(chart, { difficulty: "standard", speed, drums: true, onJudge: () => {} });
  offsets.forEach((offset, index) => {
    assert.ok(judge.hit(chart.notes[index]!.time + offset * speed / 1000, 0), "fixture hit must be accepted");
  });
  return judge;
}

it("withholds a timing tendency until eight successful hits", () => {
  assert.equal(MIN_TIMING_HITS, 8);
  assert.deepEqual(summarizeTiming([]), {
    count: 0, early: 0, centered: 0, late: 0, medianMs: null, tendency: "insufficient",
  });
  assert.deepEqual(summarizeTiming([-45, -35, -25]), {
    count: 3, early: 3, centered: 0, late: 0, medianMs: -35, tendency: "insufficient",
  });
  assert.equal(summarizeTiming(Array(7).fill(0)).tendency, "insufficient");
  assert.equal(summarizeTiming(Array(8).fill(0)).tendency, "centered");
});

it("requires a 60 percent majority rather than choosing the largest minority", () => {
  for (const [offset, tendency] of [[-40, "early"], [0, "centered"], [40, "late"]] as const) {
    const others = [-40, 0, 40].filter((value) => value !== offset);
    assert.equal(summarizeTiming([...Array(6).fill(offset), ...Array(2).fill(others[0]), ...Array(2).fill(others[1])]).tendency, tendency);
    assert.equal(summarizeTiming([...Array(5).fill(offset), ...Array(3).fill(others[0]), ...Array(2).fill(others[1])]).tendency, "mixed");
  }
  assert.equal(summarizeTiming([-40, -40, -40, -40, -40, 0, 0, 0]).tendency, "early");
  assert.equal(summarizeTiming([-40, -40, -40, -40, 0, 0, 0, 0]).tendency, "mixed");
});

it("does not call alternating early and late hits centered because their median cancels out", () => {
  assert.deepEqual(summarizeTiming([-60, 60, -60, 60, -60, 60, -60, 60]), {
    count: 8, early: 4, centered: 0, late: 4, medianMs: 0, tendency: "mixed",
  });
});

it("includes both 20 ms boundaries and allows only clock-rounding tolerance", () => {
  assert.equal(TIMING_CENTER_MS, 20);
  assert.deepEqual(summarizeTiming([-20, 20, -20 - 1e-6, 20 + 1e-6, -20 - 1e-4, 20 + 1e-4, 0, 0]), {
    count: 8, early: 1, centered: 6, late: 1, medianMs: 0, tendency: "centered",
  });
});

it("uses the latest 200 finite samples and leaves the original order untouched", () => {
  const input = Object.freeze([
    ...Array(30).fill(-70), ...Array(200).fill(35), NaN, Infinity, -Infinity,
  ]);
  const before = [...input];
  assert.deepEqual(summarizeTiming(input), {
    count: 200, early: 0, centered: 0, late: 200, medianMs: 35, tendency: "late",
  });
  assert.deepEqual(input, before);
  assert.deepEqual(summarizeTiming([NaN, Infinity, -Infinity]), summarizeTiming([]));
});

it("calculates odd and even medians without sorting the supplied offsets", () => {
  const input = Object.freeze([50, -10, 10, -30]);
  assert.equal(summarizeTiming(input).medianMs, 0);
  assert.equal(summarizeTiming([...input, 30]).medianMs, 10);
  assert.deepEqual(input, [50, -10, 10, -30]);
});

for (const speed of [0.5, 0.75, 1, 1.25]) {
  it(`keeps real Judge offsets in real milliseconds at ${speed}× speed`, () => {
    for (const [offsets, tendency] of [
      [[-50, -50, -50, -50, -50, -50, -20, 20, 0, 50], "early"],
      [[50, 50, 50, 50, 50, 50, -20, 20, 0, -50], "late"],
      [[-20, 20, -20, 20, -20, 20, -50, 50, -50, 50], "centered"],
      [[-50, 50, -50, 50, -50, 50, -50, 50, -50, 50], "mixed"],
    ] as const) {
      const judge = playOffsets(offsets, speed);
      const before = structuredClone(judge.stats);
      const summary = summarizeTiming(judge.stats.offsets);
      assert.equal(summary.tendency, tendency);
      assert.equal(summary.count, offsets.length);
      assert.equal(summary.early, offsets.filter((offset) => offset < -20).length);
      assert.equal(summary.centered, offsets.filter((offset) => Math.abs(offset) <= 20).length);
      assert.equal(summary.late, offsets.filter((offset) => offset > 20).length);
      assert.ok(Math.abs(summary.medianMs! - summarizeTiming(offsets).medianMs!) < 1e-5);
      assert.deepEqual(judge.stats, before, "coaching does not change scoring or recorded offsets");
    }
  });
}

it("summarizes the Judge's rolling window and does not count misses or extra presses as timed hits", () => {
  const judge = playOffsets([...Array(25).fill(-50), ...Array(200).fill(50)], 0.75);
  assert.equal(judge.stats.offsets.length, 200);
  assert.equal(judge.hit(300, 0), null);
  assert.equal(judge.stats.extra, 1);
  assert.deepEqual(summarizeTiming(judge.stats.offsets), {
    count: 200, early: 0, centered: 0, late: 200,
    medianMs: judge.stats.offsets[100]!, tendency: "late",
  });

  const unplayed = new Judge({ lanes: judge.lanes, notes: judge.notes }, {
    difficulty: "standard", speed: 1, drums: true, onJudge: () => {},
  });
  unplayed.finish(300);
  assert.equal(unplayed.stats.miss, 225);
  assert.equal(summarizeTiming(unplayed.stats.offsets).tendency, "insufficient");
  assert.equal(summarizeTiming(unplayed.stats.offsets).count, 0);
});
