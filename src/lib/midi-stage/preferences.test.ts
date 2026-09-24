import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SESSION_PREFERENCES,
  SESSION_PREFERENCES_KEY,
  loadSessionPreferences,
  parseSessionPreferences,
  saveSessionPreferences,
  type SessionPreferences,
} from "./preferences.ts";

const songIds = ["open-stage", "first-rehearsal", "after-hours"];
const parse = (value: unknown) => parseSessionPreferences(JSON.stringify(value), songIds);

describe("session preferences", () => {
  it("falls back safely for missing, corrupt, or unsupported saved records", () => {
    for (const raw of [null, "", "{unfinished", "null", "[]", "42", '"volume"', '{"version":2,"volume":0}']) {
      assert.deepEqual(parseSessionPreferences(raw, songIds), DEFAULT_SESSION_PREFERENCES);
    }
  });

  it("keeps valid fields from a partial record while rejecting invalid types and choices", () => {
    assert.deepEqual(parse({
      songId: "after-hours",
      difficulty: "impossible",
      speed: 0.9,
      enabledPlayers: "bass",
      guide: true,
      metronome: "false",
      volume: "20",
      focusStage: true,
    }), {
      ...DEFAULT_SESSION_PREFERENCES,
      songId: "after-hours",
      guide: true,
      focusStage: true,
    });
  });

  it("restores each supported tempo and difficulty without coercing values", () => {
    for (const speed of [0.5, 0.75, 1, 1.25]) assert.equal(parse({ speed }).speed, speed);
    for (const difficulty of ["chill", "standard", "expert"]) assert.equal(parse({ difficulty }).difficulty, difficulty);
    assert.equal(parse({ speed: "0.75" }).speed, 1);
  });

  it("deduplicates the lineup in canonical order and always leaves a playable instrument", () => {
    assert.deepEqual(parse({ enabledPlayers: ["bass", "keys", "bass", "unknown", "drums", 1] }).enabledPlayers,
      ["drums", "keys", "bass"]);
    for (const enabledPlayers of [[], ["unknown"], null, false]) {
      assert.deepEqual(parse({ enabledPlayers }).enabledPlayers, ["keys"]);
    }
  });

  it("only restores available songs and falls back to the first song when the usual default is unavailable", () => {
    assert.equal(parse({ songId: "removed-song" }).songId, "open-stage");
    assert.equal(parseSessionPreferences('{"songId":"open-stage"}', ["new-song"]).songId, "new-song");
    assert.equal(parseSessionPreferences(null, []).songId, "open-stage");
  });

  it("clamps finite volume values and rejects non-finite values", () => {
    assert.equal(parse({ volume: -10 }).volume, 0);
    assert.equal(parse({ volume: 120 }).volume, 100);
    assert.equal(parse({ volume: 0 }).volume, 0);
    assert.equal(parse({ volume: 37.5 }).volume, 37.5);
    assert.equal(parseSessionPreferences('{"volume":1e999}', songIds).volume, 55);
    assert.equal(parse({ volume: null }).volume, 55);
  });

  it("returns independent defaults so a changed lineup cannot alter later loads", () => {
    const first = parseSessionPreferences(null, songIds);
    first.enabledPlayers.push("bass");
    assert.deepEqual(parseSessionPreferences(null, songIds).enabledPlayers, ["keys"]);
    assert.deepEqual(DEFAULT_SESSION_PREFERENCES.enabledPlayers, ["keys"]);
  });

  it("round trips the preferences in one versioned record without retaining playback state", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const preferences: SessionPreferences = {
      songId: "first-rehearsal",
      enabledPlayers: ["guitar", "bass"],
      difficulty: "chill",
      speed: 0.75,
      guide: true,
      metronome: true,
      volume: 0,
      focusStage: true,
    };
    assert.equal(saveSessionPreferences({ ...preferences, status: "playing", position: 12 } as SessionPreferences, storage), true);
    assert.equal(values.size, 1);
    assert.deepEqual(JSON.parse(values.get(SESSION_PREFERENCES_KEY)!), { version: 1, ...preferences });
    assert.deepEqual(loadSessionPreferences(songIds, storage), preferences);
  });

  it("handles blocked, full, or absent storage without preventing play", () => {
    const blocked = {
      getItem() { throw new Error("Storage blocked"); },
      setItem() { throw new Error("Quota exceeded"); },
    };
    assert.deepEqual(loadSessionPreferences(songIds, blocked), DEFAULT_SESSION_PREFERENCES);
    assert.equal(saveSessionPreferences(DEFAULT_SESSION_PREFERENCES, blocked), false);
    assert.deepEqual(loadSessionPreferences(songIds, null), DEFAULT_SESSION_PREFERENCES);
    assert.equal(saveSessionPreferences(DEFAULT_SESSION_PREFERENCES, null), false);
    assert.deepEqual(loadSessionPreferences(songIds), DEFAULT_SESSION_PREFERENCES);
    assert.equal(saveSessionPreferences(DEFAULT_SESSION_PREFERENCES), false);
  });
});
