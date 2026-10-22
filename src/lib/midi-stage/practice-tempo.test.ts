import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canConfirmTempo, confirmManualTempo, createTempoPlan, isPracticeSpeed, loadTempoPlans, PRACTICE_SPEEDS, recordManualTempoTake, recordTempoTake, saveTempoPlans, tempoPlanKey } from "./practice-tempo.ts";
import { catalog } from "./songs.ts";
import { defaultPlayers } from "./engine.ts";
import { practiceSections } from "./practice.ts";

const good = { accuracy: 100, targets: 4, miss: 0, extra: 0, holdBreaks: 0 };
describe("progressive practice tempo", () => {
  it("accepts exact five-point steps and rejects invalid, reversed or coerced goals", () => {
    for (const speed of PRACTICE_SPEEDS) assert.equal(isPracticeSpeed(speed), true);
    for (const value of [NaN, Infinity, 0.49, 1.26, 0.751, "0.75", null]) assert.equal(isPracticeSpeed(value), false);
    assert.throws(() => createTempoPlan(1, 0.75));
    assert.throws(() => createTempoPlan(0.71, 1));
  });
  it("requires consecutive strong takes, resets on difficulty and caps the next tempo", () => {
    let plan = createTempoPlan(0.75, 0.8);
    plan = recordTempoTake(plan, 0.75, good);
    assert.equal(plan.current, 0.75); assert.equal(plan.streak, 1); assert.equal(plan.bestClean, 0.75);
    plan = recordTempoTake(plan, 0.75, { ...good, accuracy: 90 });
    assert.equal(plan.streak, 0);
    plan = recordTempoTake(recordTempoTake(plan, 0.75, good), 0.75, good);
    assert.equal(plan.current, 0.8); assert.equal(plan.streak, 0); assert.equal(plan.complete, false);
    plan = recordTempoTake(recordTempoTake(plan, 0.8, good), 0.8, good);
    assert.equal(plan.complete, true); assert.equal(plan.bestClean, 0.8);
    assert.equal(recordTempoTake(plan, 0.8, good), plan);
  });
  it("never advances from empty, invalid, missed, extra or broken-hold takes", () => {
    for (const change of [{ targets: 0 }, { accuracy: NaN }, { accuracy: 101 }, { miss: 1 }, { extra: 1 }, { holdBreaks: 1 }]) {
      const first = recordTempoTake(createTempoPlan(0.75, 1), 0.75, good);
      const next = recordTempoTake(first, 0.75, { ...good, ...change });
      assert.equal(next.current, 0.75); assert.equal(next.streak, 0); assert.equal(next.bestClean, 0.75);
    }
    const plan = createTempoPlan(0.75, 1);
    assert.equal(recordTempoTake(plan, 1, good), plan, "stale tempo cannot earn progress");
  });
  it("manual confirmations require a completed unscored take and cannot be double-used", () => {
    let plan = createTempoPlan(0.75, 0.8);
    assert.equal(confirmManualTempo(plan), plan);
    plan = recordManualTempoTake(plan, 0.75);
    assert.equal(canConfirmTempo(plan), true);
    assert.equal(plan.history[0]!.accuracy, null);
    plan = confirmManualTempo(plan);
    assert.equal(plan.current, 0.8); assert.equal(plan.bestClean, null);
    assert.equal(canConfirmTempo(plan), false); assert.equal(confirmManualTempo(plan), plan);
    plan = confirmManualTempo(recordManualTempoTake(plan, 0.8));
    assert.equal(plan.complete, true); assert.equal(plan.bestClean, null);
    assert.equal(plan.history.every(t => t.mode === "manual" && t.confirmed && !t.strong), true);
  });
  it("keeps the latest twelve takes without losing completed count", () => {
    let plan = createTempoPlan(0.5, 1);
    for (let i = 0; i < 30; i++) plan = recordTempoTake(plan, 0.5, { ...good, accuracy: 50 });
    assert.equal(plan.history.length, 12); assert.equal(plan.takes, 30); assert.equal(plan.history[0]!.id, 19);
  });
  it("isolates chart edits, passage boundaries, difficulty and actual lineup assignments", () => {
    const song = catalog("standard")[0]!, section = practiceSections(song)[0]!, players = defaultPlayers();
    const key = tempoPlanKey(song, section, players, "standard");
    assert.equal(tempoPlanKey(structuredClone(song), { ...section }, structuredClone(players), "standard"), key);
    for (const other of [
      tempoPlanKey({ ...song, duration: song.duration + 1 }, section, players, "standard"),
      tempoPlanKey({ ...song, parts: song.parts.map(p => ({ ...p, notes: p.notes.slice(1) })) }, section, players, "standard"),
      tempoPlanKey(song, { ...section, end: section.end + 0.1 }, players, "standard"),
      tempoPlanKey(song, section, players, "chill"),
      tempoPlanKey(song, section, players.map(p => ({ ...p, source: "bass" as const })), "standard"),
    ]) assert.notEqual(other, key);
  });
  it("round-trips independent goals and safely handles corrupt or blocked storage", () => {
    let raw = "";
    const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } };
    const plan = recordTempoTake(createTempoPlan(0.75, 1), 0.75, good);
    assert.equal(saveTempoPlans({ "tempo-v1/a/b": plan, "tempo-v1/a/c": createTempoPlan(0.5, 0.8) }, storage), true);
    assert.deepEqual(loadTempoPlans(storage)["tempo-v1/a/b"], plan);
    for (const value of ["{", "null", '{"version":2}', JSON.stringify({ version: 1, plans: { "tempo-v1/a/b": { ...plan, current: 1.1, target: 1 } } })]) {
      raw = value; assert.deepEqual(loadTempoPlans(storage), {});
    }
    assert.deepEqual(loadTempoPlans({ getItem() { throw Error("blocked"); } }), {});
    assert.equal(saveTempoPlans({}, { setItem() { throw Error("quota"); } }), false);
  });
  it("bounds stored goals to forty", () => {
    let raw = "";
    const entries = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`tempo-v1/a/${i.toString(16)}`, { ...createTempoPlan(0.5, 1), updated: i }]));
    saveTempoPlans(entries, { setItem: (_: string, value: string) => { raw = value; } });
    const loaded = loadTempoPlans({ getItem: () => raw });
    assert.equal(Object.keys(loaded).length, 40); assert.equal(loaded["tempo-v1/a/0"], undefined);
  });
});
