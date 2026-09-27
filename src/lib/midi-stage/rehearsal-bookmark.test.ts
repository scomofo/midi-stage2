import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REHEARSAL_BOOKMARK_KEY,
  clearRehearsalBookmark,
  loadRehearsalBookmark,
  parseRehearsalBookmark,
  resolveRehearsalBookmark,
  saveRehearsalBookmark,
  type RehearsalBookmark,
} from "./rehearsal-bookmark.ts";
import { practiceSections } from "./practice.ts";
import type { Song } from "./types.ts";

function bookmark(): RehearsalBookmark {
  return {
    version: 1,
    songId: "rehearsal-fixture",
    section: { id: "section:12", start: 12, end: 24 },
    setup: {
      difficulty: "chill", speed: 0.75, enabledPlayers: ["keys", "bass"],
      guide: true, strumGuide: false, metronome: true, repeat: true,
    },
  };
}

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: "rehearsal-fixture", name: "A song", subtitle: "Practice fixture", tag: "LIVE", bpm: 120,
    duration: 36, original: true, art: "open", beats: [],
    sections: [{ time: 0, name: "Intro" }, { time: 12, name: "Verse" }, { time: 24, name: "Chorus" }],
    parts: ["keys", "bass"].map((type) => ({
      id: type, name: type, type: type as "keys" | "bass", channel: 1,
      notes: [{ time: 13, duration: 0.2, pitch: 60, velocity: 90 }],
    })),
    ...overrides,
  };
}

const parse = (value: unknown) => parseRehearsalBookmark(JSON.stringify(value));

describe("rehearsal bookmark validation", () => {
  it("rejects missing, malformed, incomplete and unsupported records", () => {
    for (const raw of [null, "", "{unfinished", "null", "[]", "42", '"bookmark"']) {
      assert.equal(parseRehearsalBookmark(raw), null);
    }
    for (const value of [
      {}, { ...bookmark(), version: undefined }, { ...bookmark(), version: 2 },
      { ...bookmark(), songId: " " }, { ...bookmark(), songId: 42 },
      { ...bookmark(), section: null }, { ...bookmark(), setup: null },
    ]) assert.equal(parse(value), null);
    for (const key of Object.keys(bookmark().setup)) {
      const value = bookmark();
      delete (value.setup as Record<string, unknown>)[key];
      assert.equal(parse(value), null, `missing ${key} cannot silently fall back`);
    }
  });

  it("accepts every supported choice and requires exact setup types", () => {
    for (const speed of [0.5, 0.75, 1, 1.25]) {
      const value = bookmark();
      value.setup.speed = speed;
      assert.deepEqual(parse(value), value);
    }
    for (const difficulty of ["chill", "standard", "expert"] as const) {
      const value = bookmark();
      value.setup.difficulty = difficulty;
      assert.deepEqual(parse(value), value);
    }
    for (const [key, values] of Object.entries({
      difficulty: ["impossible", 1, null], speed: [0, 0.9, "0.75", null],
      guide: ["true", 1, null], strumGuide: ["false", 0, null],
      metronome: ["true", 1, null], repeat: ["false", 0, null],
      enabledPlayers: [[], ["keys", "keys"], ["keys", "unknown"], [1], "keys", null],
    })) {
      for (const invalid of values) {
        assert.equal(parse({ ...bookmark(), setup: { ...bookmark().setup, [key]: invalid } }), null, `${key}: ${JSON.stringify(invalid)}`);
      }
    }
    const fullBand = bookmark();
    fullBand.setup.enabledPlayers = ["bass", "guitar", "drums", "keys"];
    assert.deepEqual(parse(fullBand), fullBand, "retain the complete selected lineup without substitution");
  });

  it("requires a named passage with finite, nonnegative and ordered bounds", () => {
    for (const section of [
      { id: "", start: 12, end: 24 }, { id: 12, start: 12, end: 24 },
      { id: "section:12", start: "12", end: 24 }, { id: "section:12", start: -1, end: 24 },
      { id: "section:12", start: 24, end: 24 }, { id: "section:12", start: 25, end: 24 },
      { id: "section:12", start: NaN, end: 24 }, { id: "section:12", start: 12, end: Infinity },
    ]) assert.equal(parse({ ...bookmark(), section }), null);
    assert.equal(parseRehearsalBookmark(JSON.stringify(bookmark()).replace('"end":24', '"end":1e999')), null);
    assert.equal(parse({ ...bookmark(), section: { id: "section:0", start: 0, end: 0.25 } })?.section.start, 0);
  });
});

describe("rehearsal bookmark storage", () => {
  it("round trips one latest bookmark and excludes global, routing and playback state", () => {
    const values = new Map<string, string>([["unrelated-preferences", "keep"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const value = bookmark();
    const extended = {
      ...value, score: 900, position: 18, status: "playing", routes: { keys: "device-1" },
      setup: { ...value.setup, volume: 0, focusStage: true },
    };
    assert.equal(saveRehearsalBookmark(extended, storage), true);
    assert.deepEqual(JSON.parse(values.get(REHEARSAL_BOOKMARK_KEY)!), value);
    assert.deepEqual(loadRehearsalBookmark(storage), value);
    const next = { ...value, section: { id: "section:24", start: 24, end: 36 } };
    assert.equal(saveRehearsalBookmark(next, storage), true);
    assert.equal(values.size, 2);
    assert.deepEqual(loadRehearsalBookmark(storage), next);
    assert.equal(clearRehearsalBookmark(storage), true);
    assert.equal(loadRehearsalBookmark(storage), null);
    assert.deepEqual([...values], [["unrelated-preferences", "keep"]]);
    assert.equal(clearRehearsalBookmark(storage), true, "clearing an absent bookmark is safe");
  });

  it("does not overwrite a valid record with an invalid runtime value", () => {
    const before = JSON.stringify(bookmark());
    let saved = before;
    const storage = { setItem: (_key: string, value: string) => { saved = value; } };
    for (const enabledPlayers of [[], new Array(1)]) {
      const invalid = { ...bookmark(), setup: { ...bookmark().setup, enabledPlayers } };
      assert.equal(saveRehearsalBookmark(invalid, storage), false);
    }
    assert.equal(saved, before);
  });

  it("handles blocked, full, absent and corrupt storage without throwing", () => {
    const blocked = {
      getItem() { throw new Error("Storage blocked"); },
      setItem() { throw new Error("Quota exceeded"); },
      removeItem() { throw new Error("Storage blocked"); },
    };
    for (const storage of [blocked, null, undefined]) {
      assert.equal(loadRehearsalBookmark(storage), null);
      assert.equal(saveRehearsalBookmark(bookmark(), storage), false);
      assert.equal(clearRehearsalBookmark(storage), false);
    }
    assert.equal(loadRehearsalBookmark({ getItem: () => "{corrupt" }), null);
  });
});

describe("rehearsal bookmark resolution", () => {
  it("resolves the exact song and passage, using its current name and an independent setup", () => {
    const value = bookmark();
    const current = song();
    current.sections[1]!.name = "Renamed verse";
    const resolved = resolveRehearsalBookmark(value, [current]);
    assert.ok(resolved);
    assert.equal(resolved.song, current);
    assert.deepEqual(resolved.section, { ...value.section, name: "Renamed verse" });
    assert.deepEqual(resolved.bookmark, value);
    resolved.bookmark.setup.enabledPlayers.push("drums");
    resolved.bookmark.section.end = 100;
    assert.deepEqual(value, bookmark(), "resolved UI state cannot alter the saved bookmark");
  });

  it("rejects a missing song, deleted passage, or even slightly changed passage bounds", () => {
    assert.equal(resolveRehearsalBookmark(bookmark(), []), null);
    assert.equal(resolveRehearsalBookmark(bookmark(), [song({ id: "different-song" })]), null);
    assert.equal(resolveRehearsalBookmark(bookmark(), [song({ sections: [{ time: 0, name: "Intro" }, { time: 24, name: "Chorus" }] })]), null);
    for (const section of [
      { id: "section:12", start: 12, end: 24.000001 },
      { id: "section:12", start: 12.000001, end: 24 },
      { id: "different-id", start: 12, end: 24 },
    ]) assert.equal(resolveRehearsalBookmark({ ...bookmark(), section }, [song()]), null);
    const edited = song();
    edited.sections[2]!.time = 25;
    assert.equal(resolveRehearsalBookmark(bookmark(), [edited]), null);
    const last = { ...bookmark(), section: { id: "section:24", start: 24, end: 36 } };
    assert.equal(resolveRehearsalBookmark(last, [song({ duration: 37 })]), null);
  });

  it("resolves generated imported passages against the actual beat grid", () => {
    const current = song({
      original: false, duration: 36, sections: [],
      beats: Array.from({ length: 72 }, (_, index) => ({ time: index / 2, bar: index % 4 === 0 })),
    });
    const { id, start, end } = practiceSections(current)[1]!;
    const value = { ...bookmark(), section: { id, start, end } };
    assert.ok(resolveRehearsalBookmark(value, [current]));
    current.beats[64]!.time += 0.01;
    assert.equal(resolveRehearsalBookmark(value, [current]), null, "a changed beat-derived boundary invalidates the saved passage");
  });

  it("rejects imported lineups with missing or empty parts instead of substituting another part", () => {
    const current = song({ original: false });
    assert.ok(resolveRehearsalBookmark(bookmark(), [current]));
    current.parts = current.parts.filter((part) => part.type !== "bass");
    assert.equal(resolveRehearsalBookmark(bookmark(), [current]), null);
    current.parts.push({ id: "bass", name: "Bass", type: "bass", channel: 2, notes: [] });
    assert.equal(resolveRehearsalBookmark(bookmark(), [current]), null);
    const keysOnly = bookmark();
    keysOnly.setup.enabledPlayers = ["keys"];
    assert.ok(resolveRehearsalBookmark(keysOnly, [current]));
  });

  it("validates direct callers without turning an incomplete setup into a default setup", () => {
    const invalid = { ...bookmark(), setup: { ...bookmark().setup, repeat: undefined } };
    assert.equal(resolveRehearsalBookmark(invalid as unknown as RehearsalBookmark, [song()]), null);
  });
});


it("restores authored guitar rehearsals only with the guitar lineup", () => {
  for (const guitarMode of ["strings", "fret-strum"] as const) {
    const chart = song({ guitarMode });
    const saved = bookmark();
    assert.equal(resolveRehearsalBookmark(saved, [chart]), null);
    saved.setup.enabledPlayers = ["guitar"];
    assert.ok(resolveRehearsalBookmark(saved, [chart]));
    saved.setup.enabledPlayers = ["guitar", "keys"];
    assert.equal(resolveRehearsalBookmark(saved, [chart]), null);
  }
});
