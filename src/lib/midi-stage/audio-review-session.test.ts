import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHART_SCHEMA, validateSharedChart } from "./chart-format.ts";
import { applyAudioReviewDraft, audioReviewDraftKey, audioReviewPitch, createAudioReviewHistory, needsAudioReview, pushAudioReviewHistory, redoAudioReview, selectedAudioReviewRow, undoAudioReview } from "./audio-review-session.ts";

function fixture() {
  return validateSharedChart({ schema: CHART_SCHEMA, version: 4, id: "review-studio", title: "Studio", origin: "audio-full-band-draft",
    guitarMode: "strings", guitarTuning: [40, 45, 50, 55, 59, 64], bpm: 120, duration: 4, firstBeat: 0.5, audioOffset: 0.1,
    parts: [
      { type: "drums", notes: [{ time: 0.5, duration: 0.09, pitch: 46, velocity: 100 }] },
      { type: "keys", notes: [{ time: 0.5, duration: 0.3, pitch: 60, velocity: 95, confidence: 0.6 }, { time: 1, duration: 0.5, pitch: 64, velocity: 80, confidence: 0.9 }] },
      { type: "guitar", notes: [{ time: 0.5, duration: 0.08, pitch: 43, velocity: 90, confidence: 0.5, guitarPosition: { string: 6, fret: 3 } }] },
      { type: "bass", notes: [{ time: 0.5, duration: 0.6, pitch: 28, velocity: 100 }] },
    ] });
}
describe("audio review studio session", () => {
  it("keeps the selected chord tone when Apply sorts and renumbers the notes", () => {
    const chart = fixture(), history = createAudioReviewHistory(chart, "keys");
    const selected = { ...history.present.rows[1]!, time: "0.5000", pitch: "65" };
    const result = applyAudioReviewDraft(chart, "keys", { ...history.present, rows: [history.present.rows[0]!, selected] });
    const normalized = createAudioReviewHistory(result, "keys").present.rows;
    assert.equal(selectedAudioReviewRow(normalized, selected, "keys")?.pitch, "65");
    assert.equal(selectedAudioReviewRow([], selected, "keys"), undefined);
  });
  it("distinguishes guitar unisons on separate strings and falls back to a nearby surviving note", () => {
    const row = createAudioReviewHistory(fixture(), "guitar").present.rows[0]!;
    const rows = [{ ...row, id: 0, string: "6", fret: "5" }, { ...row, id: 1, string: "5", fret: "0" }];
    assert.equal(selectedAudioReviewRow(rows, { ...rows[1]!, id: 42 }, "guitar")?.id, 1);
    assert.equal(selectedAudioReviewRow(rows, { ...row, time: "0.6", fret: "24" }, "guitar")?.id, 0);
  });
  it("round-trips every part without losing drum aliases, short guitar holds or confidence", () => {
    const source = fixture();
    for (const instrument of ["drums", "keys", "guitar", "bass"] as const) {
      const history = createAudioReviewHistory(source, instrument);
      const result = applyAudioReviewDraft(source, instrument, { ...history.present, tempo: "90" });
      assert.deepEqual(result.parts, source.parts);
      assert.equal(result.bpm, 90); assert.equal(result.audioOffset, 0.1); assert.equal(result.duration, 4);
      const row = history.present.rows[0]!;
      assert.equal(audioReviewPitch(row, instrument, source.guitarTuning), instrument === "guitar" ? 43 : instrument === "drums" ? 42 : instrument === "keys" ? 60 : 28);
    }
  });
  it("keeps selection out of pending edits and undoes deletion with its selected note intact", () => {
    const source = fixture(), original = structuredClone(source);
    const initial = createAudioReviewHistory(source, "keys");
    const selected = pushAudioReviewHistory(initial, { ...initial.present, selectedId: 1 });
    assert.equal(selected.past.length, 0); assert.equal(audioReviewDraftKey(selected.present), audioReviewDraftKey(initial.present));
    const deleted = pushAudioReviewHistory(selected, { ...selected.present, rows: [selected.present.rows[0]!], selectedId: 0 });
    const undone = undoAudioReview(deleted);
    assert.deepEqual(undone.present, selected.present);
    assert.deepEqual(redoAudioReview(undone).present, deleted.present);
    const replaced = pushAudioReviewHistory(undone, { ...undone.present, tempo: "80" });
    assert.equal(replaced.future.length, 0); assert.equal(deleted.present.rows.length, 1);
    assert.deepEqual(source, original);
  });
  it("includes unscored notes in review and rejects incomplete pitch input", () => {
    assert.equal(needsAudioReview({}), true); assert.equal(needsAudioReview({ confidence: 0.5 }), true);
    assert.equal(needsAudioReview({ confidence: 0.75 }), false);
    const row = createAudioReviewHistory(fixture(), "guitar").present.rows[0]!;
    assert.ok(Number.isNaN(audioReviewPitch({ ...row, fret: "" }, "guitar", [40, 45, 50, 55, 59, 64])));
    assert.ok(Number.isNaN(audioReviewPitch({ ...row, string: "7" }, "guitar", [40, 45, 50, 55, 59, 64])));
    const session = createAudioReviewHistory(fixture(), "keys");
    assert.throws(() => applyAudioReviewDraft(fixture(), "keys", { ...session.present, rows: [{ ...session.present.rows[0]!, time: "3.9", duration: "0.5" }] }), /fit inside/);
  });
});
