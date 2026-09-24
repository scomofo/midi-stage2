import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHART_SCHEMA, ChartFormatError, serializeSharedChart } from "./chart-format.ts";
import {
  MAX_CHART_IMPORT_BYTES,
  MAX_SAVED_CHARTS,
  SONG_LIBRARY_KEY,
  addLibraryEntry,
  chartIdentity,
  loadSongLibrary,
  prepareChartImport,
  saveSongLibrary,
  songFromSavedChart,
  type SavedChart,
} from "./song-library.ts";

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: CHART_SCHEMA,
    version: 1,
    id: "open-stage",
    title: "My chart",
    bpm: 100,
    duration: 20,
    parts: [
      { type: "drums", notes: [] },
      { type: "keys", notes: [{ time: 0, duration: 1, pitch: 64 }] },
      { type: "guitar", notes: [] },
      { type: "bass", notes: [] },
    ],
    ...overrides,
  };
}

function imported(overrides: Record<string, unknown> = {}): SavedChart {
  return prepareChartImport(JSON.stringify(fixture(overrides)), "my-chart.json").entry;
}

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[SONG_LIBRARY_KEY, initial]]);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("imported song library", () => {
  it("builds a playable song without allowing authored ids to replace built-in songs", () => {
    const entry = imported();
    const song = songFromSavedChart(entry);
    assert.match(entry.id, /^import:[a-f0-9]{16}$/);
    assert.equal(entry.chart.id, "open-stage");
    assert.equal(song.id, entry.id);
    assert.equal(song.name, "My chart");
    assert.equal(song.tag, "IMPORT");
    assert.equal(song.parts.find((part) => part.type === "keys")!.notes.length, 1);
    assert.equal(song.subtitle, "my-chart.json");
    assert.match(song.arrangementDescription!, /Backing audio/);
  });

  it("identifies canonical content independently of JSON formatting or file name", () => {
    const source = fixture();
    const first = prepareChartImport(JSON.stringify(source), "one.json").entry;
    const second = prepareChartImport(JSON.stringify(source, null, 4), "renamed.json").entry;
    const reordered = prepareChartImport(JSON.stringify({ parts: source.parts, ...source }), "third.json").entry;
    assert.equal(first.id, second.id);
    assert.equal(first.id, reordered.id);
    assert.notEqual(first.id, imported({ title: "A different chart with the same author id" }).id);
  });

  it("uses the full 64-bit hash consistently for Unicode chart content", () => {
    const chart = imported({ title: "Été 🎹" }).chart;
    let reference = 0xcbf29ce484222325n;
    for (const byte of new TextEncoder().encode(serializeSharedChart(chart))) {
      reference = BigInt.asUintN(64, (reference ^ BigInt(byte)) * 0x100000001b3n);
    }
    assert.equal(chartIdentity(chart), `import:${reference.toString(16).padStart(8, "0")}`);
  });

  it("preserves exact reimports while keeping different charts with the same authored id", () => {
    const first = imported();
    const original = [first];
    const duplicate = { ...imported(), addedAt: first.addedAt + 1, fileName: "renamed.json" };
    const repeated = addLibraryEntry(original, duplicate);
    assert.deepEqual(repeated, original);
    assert.equal(repeated[0], first);
    assert.equal(original.length, 1);
    const other = imported({ title: "Another chart" });
    assert.deepEqual(addLibraryEntry(original, other), [first, other]);
  });

  it("enforces the library limit without deleting existing charts or rejecting a reimport", () => {
    const full = Array.from({ length: MAX_SAVED_CHARTS }, (_, i) => imported({ title: `Chart ${i}` }));
    assert.throws(() => addLibraryEntry(full, imported({ title: "One more" })), /Remove one before importing/);
    assert.equal(full.length, MAX_SAVED_CHARTS);
    assert.deepEqual(addLibraryEntry(full, full[0]!), full);
  });

  it("rejects empty, malformed, and unsupported charts with helpful errors", () => {
    assert.throws(() => prepareChartImport("{unfinished", "broken.json"), ChartFormatError);
    assert.throws(() => imported({ version: 99 }), /Unsupported chart version/);
    assert.throws(() => imported({
      parts: ["drums", "keys", "guitar", "bass"].map((type) => ({ type, notes: [] })),
    }), /no playable notes/);
  });

  it("applies the import size limit to UTF-8 bytes", () => {
    const oversized = "é".repeat(MAX_CHART_IMPORT_BYTES / 2 + 1);
    assert.throws(() => prepareChartImport(oversized, "large.json"), /4 MB or smaller/);
  });

  it("cleans display filenames and explains referenced backing audio", () => {
    const { entry, warnings } = prepareChartImport(JSON.stringify(fixture({ audioName: "recording.mp3", audioOffset: 0.4 })),
      "C:\\fakepath\\my\u0000-chart.json");
    assert.equal(entry.fileName, "my-chart.json");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /audio offset is ignored/);
    assert.equal(entry.chart.audioName, "recording.mp3");
    assert.equal(entry.chart.audioOffset, 0.4);
    assert.deepEqual(prepareChartImport(JSON.stringify(fixture()), "").warnings, []);
    assert.equal(prepareChartImport(JSON.stringify(fixture()), "").entry.fileName, "Imported chart.json");
  });

  it("round trips the versioned library in a single storage write", () => {
    const storage = memoryStorage();
    const entries = [imported(), imported({
      title: "Second chart",
      chordHighways: {
        keys: [{ time: 0, duration: 1, pitches: [64, 67, 71], name: "Em", roman: "iii" }],
        guitar: [],
      },
    })];
    assert.deepEqual(saveSongLibrary(entries, storage), { saved: true, warning: null });
    assert.equal(storage.values.size, 1);
    assert.equal(JSON.parse(storage.values.get(SONG_LIBRARY_KEY)!).version, 1);
    assert.deepEqual(loadSongLibrary(storage), { entries, warning: null });
  });

  it("restores attached audio while chart JSON metadata alone never claims an audio file", () => {
    const json = JSON.stringify(fixture({ origin: "audio-rhythm", audioName: "session.wav" }));
    const prepared = prepareChartImport(json, "session.json");
    assert.equal(prepared.entry.audio, undefined);
    assert.equal(songFromSavedChart(prepared.entry).audioAssetId, undefined);
    assert.match(prepared.warnings[0]!, /Original audio is not attached/);
    const attached = { ...prepared.entry, fileName: "session.wav", audio: true };
    const storage = memoryStorage();
    assert.equal(saveSongLibrary([attached], storage).saved, true);
    const restored = loadSongLibrary(storage).entries[0]!;
    assert.equal(restored.audio, true);
    const song = songFromSavedChart(restored);
    assert.equal(song.audioAssetId, attached.id);
    assert.match(song.arrangementDescription!, /original track plays with you/);
    const invalidFlag = loadSongLibrary(memoryStorage(JSON.stringify({
      version: 1, entries: [{ ...attached, audio: "true" }],
    }))).entries[0]!;
    assert.equal(songFromSavedChart(invalidFlag).audioAssetId, undefined);
  });

  it("upgrades a JSON-only entry when audio is imported and never downgrades attached audio", () => {
    const jsonEntry = imported({ origin: "audio-rhythm", audioName: "session.wav" });
    const audioEntry = { ...jsonEntry, audio: true, fileName: "session.wav", addedAt: jsonEntry.addedAt + 500 };
    const later = imported({ title: "Another chart" });
    const upgraded = addLibraryEntry([jsonEntry, later], audioEntry);
    assert.deepEqual(upgraded, [{ ...jsonEntry, audio: true, fileName: "session.wav" }, later]);
    assert.deepEqual(addLibraryEntry(upgraded, jsonEntry), upgraded);
    const restored = loadSongLibrary(memoryStorage(JSON.stringify({ version: 1, entries: [jsonEntry, audioEntry] })));
    assert.deepEqual(restored.entries, [upgraded[0]]);
    assert.equal(restored.warning, null);
  });

  it("recovers good entries around a corrupt record and deduplicates exact copies", () => {
    const first = imported();
    const second = imported({ title: "Second chart" });
    const storage = memoryStorage(JSON.stringify({ version: 1, entries: [first, { chart: {} }, second, first] }));
    const restored = loadSongLibrary(storage);
    assert.deepEqual(restored.entries, [first, second]);
    assert.match(restored.warning!, /1 saved chart could not be restored/);
  });

  it("rejects tampered identities and restores no more than the supported number of charts", () => {
    const entries = Array.from({ length: MAX_SAVED_CHARTS + 1 }, (_, i) => imported({ title: `Chart ${i}` }));
    const tampered = { ...entries[0], id: "open-stage" };
    const restored = loadSongLibrary(memoryStorage(JSON.stringify({ version: 1, entries: [tampered, ...entries] })));
    assert.deepEqual(restored.entries, entries.slice(0, MAX_SAVED_CHARTS));
    assert.match(restored.warning!, /2 saved charts/);
  });

  it("handles corrupt records and unavailable storage without throwing", () => {
    for (const raw of ["{broken", "null", "[]", '{"version":2,"entries":[]}', '{"version":1,"entries":null}']) {
      const result = loadSongLibrary(memoryStorage(raw));
      assert.deepEqual(result.entries, []);
      assert.ok(result.warning);
    }
    assert.deepEqual(loadSongLibrary(memoryStorage()), { entries: [], warning: null });
    assert.deepEqual(loadSongLibrary(null), { entries: [], warning: null });
    assert.deepEqual(loadSongLibrary(), { entries: [], warning: null });
    const blocked = {
      getItem() { throw new Error("SecurityError"); },
      setItem() { throw new Error("QuotaExceededError"); },
    };
    assert.deepEqual(loadSongLibrary(blocked).entries, []);
    assert.ok(loadSongLibrary(blocked).warning);
    for (const storage of [blocked, null, undefined]) {
      const result = saveSongLibrary([imported()], storage);
      assert.equal(result.saved, false);
      assert.match(result.warning!, /Available for this visit/);
    }
  });

  it("preserves the old saved library when the new payload exceeds the storage budget", () => {
    const storage = memoryStorage();
    const entry = imported();
    assert.equal(saveSongLibrary([entry], storage).saved, true);
    const old = storage.getItem(SONG_LIBRARY_KEY);
    const large = structuredClone(entry);
    large.chart.duration = 3600;
    large.chart.parts[1]!.notes = Array.from({ length: 30000 }, (_, i) => ({
      time: i / 10, duration: 0.02, pitch: 64, velocity: 100,
    }));
    large.id = chartIdentity(large.chart);
    const result = saveSongLibrary([large], storage);
    assert.equal(result.saved, false);
    assert.match(result.warning!, /too large/);
    assert.equal(storage.getItem(SONG_LIBRARY_KEY), old);
    assert.equal(large.chart.parts[1]!.notes.length, 30000, "the in-memory chart remains playable");
  });
});
