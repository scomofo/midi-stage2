import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultStemMix, loadStemMixes, parseStemMix, saveStemMixes, stemGain } from "./stem-mix.ts";
import { parseAudioAsset } from "./audio-assets.ts";
import { practiceSong } from "./practice.ts";
import type { Song } from "./types.ts";

describe("stem practice mix", () => {
  it("starts with the original, independent channel defaults, and safe malformed settings", () => {
    const first = defaultStemMix(); first.channels.keys.muted = true;
    assert.equal(defaultStemMix().channels.keys.muted, false);
    assert.equal(parseStemMix(null).mode, "original");
    const malformed = parseStemMix({ mode: "both", channels: { keys: { level: Infinity, muted: "true" }, bass: { level: -5, solo: true } } });
    assert.deepEqual(malformed.channels.keys, { level: 100, muted: false, solo: false });
    assert.equal(malformed.channels.bass.level, 0);
    assert.equal(malformed.mode, "original");
  });

  it("supports multiple solos, mute precedence and silent zero levels without unavailable solos silencing a partial set", () => {
    const mix = defaultStemMix();
    mix.channels.keys.level = 50;
    mix.channels.guitar.solo = true;
    assert.equal(stemGain(mix, "keys", ["keys", "drums"]), 0.25);
    mix.channels.drums.solo = true;
    assert.equal(stemGain(mix, "keys", ["keys", "drums"]), 0);
    mix.channels.keys.solo = true;
    assert.equal(stemGain(mix, "keys", ["keys", "drums"]), 0.25);
    mix.channels.keys.muted = true;
    assert.equal(stemGain(mix, "keys", ["keys", "drums"]), 0);
    mix.channels.drums.level = 0;
    assert.equal(stemGain(mix, "drums", ["keys", "drums"]), 0);
  });

  it("keeps per-song settings across reload and ignores removed songs, bad versions and blocked storage", () => {
    let raw = "";
    const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } };
    const one = defaultStemMix(), two = defaultStemMix();
    one.mode = "stems"; one.channels.guitar.muted = true; two.channels.keys.solo = true;
    assert.equal(saveStemMixes({ one, two }, storage), true);
    assert.deepEqual(loadStemMixes(["one", "two"], storage), { one, two });
    assert.deepEqual(loadStemMixes(["two"], storage), { two });
    raw = '{"version":2,"songs":{}}'; assert.deepEqual(loadStemMixes(["one"], storage), {});
    raw = "{"; assert.deepEqual(loadStemMixes(["one"], storage), {});
    assert.equal(saveStemMixes({ one }, { setItem() { throw new Error("quota"); } }), false);
    assert.deepEqual(loadStemMixes(["one"], { getItem() { throw new Error("blocked"); } }), {});
  });

  it("reads legacy audio blobs and versioned bundles, retaining only real instrument blobs", () => {
    const original = new Blob(["original"]), keys = new Blob(["keys"]);
    assert.deepEqual(parseAudioAsset(original), { version: 1, original, stems: {} });
    assert.deepEqual(parseAudioAsset({ version: 1, original, stems: { keys, guitar: "missing", vocals: keys } }), { version: 1, original, stems: { keys } });
    for (const value of [null, {}, { version: 2, original }, { version: 1, original: "broken" }]) assert.equal(parseAudioAsset(value), null);
  });

  it("keeps the same local asset and source-time offset when seeking into a practice passage", () => {
    const song = { id: "band", audioAssetId: "bundle", audioOffset: 1, duration: 30, bpm: 120, parts: [], sections: [], beats: [] } as unknown as Song;
    const practice = practiceSong(song, { id: "bridge", name: "Bridge", start: 12, end: 20 });
    assert.equal(practice.audioAssetId, "bundle");
    assert.equal(practice.audioOffset, -11);
    assert.equal(practice.duration, 8);
  });
});
