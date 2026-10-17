import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHART_SCHEMA, parseSharedChartText, serializeSharedChart, validateSharedChart, type SharedChart } from "./chart-format.ts";
import { restoreAudioPart, type AudioReviewInstrument } from "./audio-part-review.ts";
import { applyDrumReview, drumReviewRows, isReviewableDrumDraft } from "./drum-chart-review.ts";
import { applyKeyboardReview, keyboardReviewRows } from "./keyboard-chart-review.ts";
import { applyGuitarReview, guitarReviewRows } from "./guitar-chart-review.ts";
import { isReviewableKeyboardDraft } from "./keyboard-draft.ts";
import { isReviewableBassDraft } from "./bass-draft.ts";
import { chartIdentity } from "./song-library.ts";

const instruments = ["drums", "keys", "guitar", "bass"] as const;
const part = (chart: SharedChart, type: AudioReviewInstrument) => chart.parts.find((part) => part.type === type)!;
function fixture(): SharedChart {
  return validateSharedChart({
    schema: CHART_SCHEMA, version: 4, id: "chart-band-review", title: "Band review", origin: "audio-full-band-draft",
    guitarMode: "strings", guitarTuning: [40, 45, 50, 55, 59, 64], bpm: 120, duration: 10, firstBeat: 0.15, audioOffset: 0.125, audioName: "master.wav",
    beats: [{ time: 0.5, bar: true }, { time: 1, bar: false }], sections: [{ time: 0, name: "Intro" }, { time: 4, name: "Verse" }],
    parts: [
      { type: "drums", notes: [{ time: 0.15, duration: 0.09, pitch: 35, velocity: 98, confidence: 0.7 }, { time: 1.5, duration: 0.06, pitch: 38, velocity: 90 }] },
      { type: "keys", notes: [{ time: 0.3, duration: 0.5, pitch: 60, velocity: 96, confidence: 0.65 }, { time: 0.3, duration: 0.5, pitch: 64, velocity: 91, confidence: 0.8 }] },
      { type: "guitar", notes: [{ time: 0.5, duration: 0.4, pitch: 40, velocity: 92, confidence: 0.6, guitarPosition: { string: 6, fret: 0 } }] },
      { type: "bass", notes: [{ time: 0.4, duration: 0.6, pitch: 40, velocity: 100, confidence: 0.75 }] },
    ],
    chordHighways: {
      keys: [{ time: 0.3, duration: 0.5, name: "C", roman: "I", pitches: [60, 64] }],
      guitar: [{ time: 0.5, duration: 0.4, name: "E5", roman: "I", pitches: [40, 47] }],
    },
  });
}
function edit(source: SharedChart, type: AudioReviewInstrument): SharedChart {
  if (type === "guitar") {
    const rows = guitarReviewRows(source); rows[0] = { ...rows[0]!, time: "0.6", fret: "2", duration: "0.7" };
    return applyGuitarReview(source, rows, "90");
  }
  if (type === "drums") {
    const rows = drumReviewRows(source); rows[0] = { ...rows[0]!, time: "0.9", pitch: "49" };
    return applyDrumReview(source, rows, "90");
  }
  const rows = keyboardReviewRows(source, type);
  rows[0] = { ...rows[0]!, time: type === "keys" ? "0.25" : "0.1", pitch: type === "keys" ? "61" : "43", duration: "0.7" };
  return applyKeyboardReview(source, rows, "90", type);
}

describe("full-band part review", () => {
  it("edits all four parts in sequence without changing other notes or the recording clock", () => {
    const original = fixture(), before = serializeSharedChart(original);
    let current = original;
    for (const instrument of instruments) {
      const next = edit(current, instrument);
      for (const other of instruments.filter((part) => part !== instrument)) assert.deepEqual(part(next, other), part(current, other), `${instrument} must preserve ${other}`);
      for (const key of ["duration", "audioOffset", "audioName", "origin", "beats", "sections", "guitarTuning"] as const) assert.deepEqual(next[key], original[key], key);
      assert.equal(next.bpm, 90);
      assert.equal(next.firstBeat, Math.min(...next.parts.flatMap((part) => part.notes.map((note) => note.time))));
      current = next;
    }
    assert.equal(current.firstBeat, 0.1);
    assert.equal(part(current, "keys").notes[0]!.pitch, 61);
    assert.equal(part(current, "guitar").notes[0]!.pitch, 42);
    assert.equal(part(current, "bass").notes[0]!.pitch, 43);
    assert.equal(part(current, "drums").notes[0]!.confidence, 0.7);
    assert.deepEqual(current.chordHighways, { keys: [], guitar: [] });
    assert.equal(serializeSharedChart(original), before, "source is immutable");
    const reloaded = parseSharedChartText(serializeSharedChart(current));
    assert.deepEqual(reloaded.parts, current.parts);
    assert.equal(chartIdentity(reloaded), chartIdentity(current));
  });

  it("restores each original part after other edits, retaining the shared count-in and other corrections", () => {
    const original = fixture();
    let current = instruments.reduce(edit, original);
    for (const instrument of ["keys", "guitar", "drums", "bass"] as const) {
      const restored = restoreAudioPart(current, original, instrument);
      assert.deepEqual(part(restored, instrument), part(original, instrument));
      for (const other of instruments.filter((part) => part !== instrument)) assert.deepEqual(part(restored, other), part(current, other));
      assert.equal(restored.bpm, 90);
      assert.deepEqual(restored.tempoMap, [{ time: 0, bpm: 90 }]);
      assert.equal(restored.audioOffset, original.audioOffset);
      if (instrument === "keys" || instrument === "guitar") assert.deepEqual(restored.chordHighways[instrument], original.chordHighways[instrument]);
      current = restored;
    }
    assert.deepEqual(current.parts, original.parts);
    assert.deepEqual(current.chordHighways, original.chordHighways);
    assert.equal(current.firstBeat, original.firstBeat);
  });

  it("changes count-in without normalizing drum aliases, lengths, confidence or chord labels", () => {
    const original = fixture();
    const edited = applyDrumReview(original, drumReviewRows(original), "90");
    assert.deepEqual(edited.parts, original.parts);
    assert.deepEqual(edited.chordHighways, original.chordHighways);
    const keys = applyKeyboardReview(edited, keyboardReviewRows(edited), "80");
    assert.deepEqual(keys.parts, original.parts);
    assert.deepEqual(keys.chordHighways, original.chordHighways);
    const duplicate = drumReviewRows(original); duplicate.push({ ...duplicate[0]!, pitch: "36" });
    assert.throws(() => applyDrumReview(original, duplicate, "120"), /same drum/);
  });

  it("validates bass edits atomically, including range, recording bounds, empty and duplicate notes", () => {
    const original = fixture(), before = serializeSharedChart(original);
    for (const patch of [{ pitch: "27" }, { pitch: "68" }, { pitch: "40.5" }, { time: "" }, { time: "-1" }, { time: "9.9" }, { duration: "0.01" }]) {
      const rows = keyboardReviewRows(original, "bass"); rows[0] = { ...rows[0]!, ...patch };
      assert.throws(() => applyKeyboardReview(original, rows, "90", "bass"));
    }
    const rows = keyboardReviewRows(original, "bass");
    assert.throws(() => applyKeyboardReview(original, [...rows, rows[0]!], "90", "bass"), /same pitch/);
    assert.throws(() => applyKeyboardReview(original, [], "90", "bass"), /at least one bass/);
    assert.throws(() => applyKeyboardReview(original, rows, "", "bass"), /needs a number/);
    assert.equal(serializeSharedChart(original), before);
  });

  it("reviews partial bands without guitar and rejects rhythm placeholders or out-of-range parts", () => {
    const source = fixture();
    assert.equal(isReviewableDrumDraft(source), true);
    assert.equal(isReviewableKeyboardDraft(source), true);
    assert.equal(isReviewableBassDraft(source), true);
    const partial = validateSharedChart({ ...source, version: 3, guitarMode: undefined, guitarTuning: undefined,
      parts: source.parts.map((part) => part.type === "guitar" ? { ...part, notes: [] } : part) });
    assert.equal(isReviewableKeyboardDraft(partial), true);
    assert.equal(isReviewableBassDraft(partial), true);
    const rhythm = validateSharedChart({ ...partial, matching: "rhythm" });
    assert.equal(isReviewableDrumDraft(rhythm), false);
    assert.equal(isReviewableKeyboardDraft(rhythm), false);
    assert.equal(isReviewableBassDraft(rhythm), false);
  });
});
