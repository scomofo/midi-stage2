import assert from "node:assert/strict";
import test from "node:test";
import { drummerStroke } from "./drummer-motion";

const notes = [
  { time: 1, lane: 1 },
  { time: 1, lane: 2 },
  { time: 2, lane: 0 },
];
test("chart attacks move the appropriate hands and leave kick-only passages still", () => {
  assert.deepEqual(drummerStroke(notes, 0.99, 120, true), { left: 0, right: 0 });
  const attack = drummerStroke(notes, 1.11, 120, true);
  assert.ok(attack.left > 0.99 && attack.right > 0.99);
  assert.deepEqual(drummerStroke(notes, 1.3, 120, true), { left: 0, right: 0 });
  assert.deepEqual(drummerStroke(notes, 2.11, 120, true), { left: 0, right: 0 });
});
test("rest, disabled motion, count-in and empty charts stay neutral", () => {
  for (const time of [-1, 0, 3])
    assert.deepEqual(drummerStroke(notes, time, 120, true), { left: 0, right: 0 });
  assert.deepEqual(drummerStroke(notes, 1.11, 120, false), { left: 0, right: 0 });
  assert.deepEqual(drummerStroke([], 1.11, 120, true), { left: 0, right: 0 });
});
test("frozen chart time freezes the pose, while a seek derives the destination pose", () => {
  const paused = drummerStroke(notes, 1.1, 120, true);
  assert.deepEqual(drummerStroke(notes, 1.1, 120, true), paused);
  assert.deepEqual(drummerStroke(notes, 3, 120, true), { left: 0, right: 0 });
  assert.deepEqual(drummerStroke(notes, 1.1, 120, true), paused);
});
