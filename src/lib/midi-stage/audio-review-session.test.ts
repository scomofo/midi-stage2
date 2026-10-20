import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHART_SCHEMA, validateSharedChart } from "./chart-format.ts";
import { acceptGuitarCandidate, guitarCandidateRow, applyAudioReviewDraft, audioReviewDraftKey, audioReviewPitch, createAudioReviewHistory, needsAudioReview, pushAudioReviewHistory, redoAudioReview, selectedAudioReviewRow, undoAudioReview } from "./audio-review-session.ts";
import { serializeSharedChart } from "./chart-format.ts";

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
  it("accepts a suggestion on a free string and undoes its decision and note together", () => {
    const source = fixture(), initial = createAudioReviewHistory(source, "guitar");
    const candidate = { id: "candidate-a", time: 0.5, estimatedDuration: 0.08, pitchMidi: 45 };
    const next = acceptGuitarCandidate(source, initial.present, candidate, 100);
    const accepted = pushAudioReviewHistory(initial, next);
    assert.equal(next.rows.length, 2); assert.equal(next.selectedId, 100);
    assert.equal(next.rows[1]!.string, "5"); assert.equal(next.rows[1]!.fret, "0");
    assert.deepEqual(next.rows[0], initial.present.rows[0]);
    assert.equal(next.rows[1]!.confidence, undefined, "manual acceptance is not calibrated confidence");
    assert.equal(next.candidateDecisions?.[candidate.id], "accepted");
    assert.deepEqual(undoAudioReview(accepted).present, initial.present);
    assert.deepEqual(redoAudioReview(undoAudioReview(accepted)).present, next);
    const applied = applyAudioReviewDraft(source, "guitar", next);
    assert.deepEqual(applied.parts.filter((part) => part.type !== "guitar"), source.parts.filter((part) => part.type !== "guitar"));
    assert.deepEqual(applied.parts.find((part) => part.type === "guitar")!.notes[0], source.parts.find((part) => part.type === "guitar")!.notes[0]);
    assert.ok(!serializeSharedChart(applied).includes("candidate-a"), "suggestions and decisions are not chart notes or export fields");
    const remounted = createAudioReviewHistory(applied, "guitar", next.candidateDecisions);
    assert.equal(remounted.present.candidateDecisions?.[candidate.id], "accepted");
    assert.throws(() => acceptGuitarCandidate(applied, remounted.present, candidate, 101), /Reopen/);
    assert.throws(() => guitarCandidateRow(applied, { ...remounted.present, candidateDecisions: {} }, candidate, 101), /already in the draft/);
  });
  it("keeps dismissal in edit history and refuses a tone that requires shortening or moving existing notes", () => {
    const source = fixture(), initial = createAudioReviewHistory(source, "guitar");
    const dismissed = pushAudioReviewHistory(initial, { ...initial.present, candidateDecisions: { suggestion: "dismissed" } });
    assert.notEqual(audioReviewDraftKey(dismissed.present), audioReviewDraftKey(initial.present));
    assert.deepEqual(dismissed.present.rows, initial.present.rows);
    assert.deepEqual(undoAudioReview(dismissed).present, initial.present);
    const occupied = { id: "unplayable", time: 0.5, estimatedDuration: 0.08, pitchMidi: 40 };
    assert.throws(() => acceptGuitarCandidate(source, initial.present, occupied, 100), /No free string/);
    assert.throws(() => acceptGuitarCandidate(source, initial.present, { ...occupied, time: 3.99 }, 100), /does not fit/);
    assert.deepEqual(source, fixture());
  });
});
