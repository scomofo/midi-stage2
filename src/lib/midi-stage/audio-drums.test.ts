import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drumFixture } from "../../../scripts/fixtures/drum-draft.mjs";
import { analyzeSongAudio } from "./audio-import.ts";
import { applyDrumReview, drumReviewRows, isReviewableDrumDraft } from "./drum-chart-review.ts";
import { serializeSharedChart, parseSharedChartText, sharedChartToSong, validateSharedChart } from "./chart-format.ts";
import { chartIdentity, prepareChartImport, songFromSavedChart } from "./song-library.ts";
import { Judge, makeChart, laneForPitch } from "./engine.ts";

describe("audio drum drafts", () => {
  it("detects separate drum families and simultaneous strikes on the controlled percussion fixture", () => {
    const source = drumFixture();
    const { chart, warnings } = analyzeSongAudio(source, "Drum study.wav", "drumfixture", "drums");
    const notes = chart.parts[0]!.notes;
    for (const pitch of [36, 38, 42]) {
      const expected = source.events.filter((event) => event.pitch === pitch);
      const found = notes.filter((note) => note.pitch === pitch);
      const matches = expected.filter((event) => found.some((note) => Math.abs(note.time - event.time) <= 0.04));
      // Hats under broadband snare hits remain an explicit limitation of this
      // timbral draft. This fixture's acceptance is not a general accuracy rate.
      assert.ok(matches.length / expected.length >= (pitch === 42 ? 0.75 : 1), `${pitch}: matched ${matches.length}/${expected.length}, detected ${found.length}`);
      assert.ok(found.length <= expected.length * 1.25, `${pitch}: too many false hits (${found.length})`);
    }
    assert.equal(chart.version, 1);
    assert.equal(chart.matching, undefined);
    assert.equal(chart.origin, "audio-drums-draft");
    assert.ok(chart.parts.slice(1).every((part) => !part.notes.length));
    assert.match(warnings[0]!, /estimated.*false hits/);
    assert.ok(notes.filter((note) => Math.abs(note.time - 0.3) < 0.04).length >= 2, "kick and hat can share an attack");
  });

  it("preserves stereo phase, bounded notes and separate identities from rhythm charts", () => {
    const mono = analyzeSongAudio(drumFixture(), "Study.wav", "samebytes", "drums").chart;
    const stereo = analyzeSongAudio(drumFixture(44100, 2), "Study.wav", "samebytes", "drums").chart;
    assert.deepEqual(mono.parts, stereo.parts);
    assert.notEqual(mono.id, analyzeSongAudio(drumFixture(), "Study.wav", "samebytes").chart.id);
    assert.ok(mono.parts[0]!.notes.every((note) => note.time >= 0 && note.time + note.duration <= mono.duration));
  });

  it("rejects silence and sustained notes rather than inventing drum patterns", () => {
    const source = drumFixture();
    const data = source.getChannelData(0);
    data.fill(0);
    assert.throws(() => analyzeSongAudio(source, "Silence.wav", "silent", "drums"), /silent/);
    for (const frequency of [65, 110, 220, 440]) {
      for (let i = 0; i < data.length; i++) data[i] = Math.sin(2 * Math.PI * frequency * i / source.sampleRate) * 0.5;
      assert.throws(() => analyzeSongAudio(source, "Tone.wav", "tone", "drums"), /Not enough distinct/, `${frequency} Hz`);
    }
  });

  it("reviews atomically without stretching source audio, and exports reusable identities", () => {
    const source = analyzeSongAudio(drumFixture(), "Study.wav", "review", "drums").chart;
    const wire = serializeSharedChart(source);
    const rows = drumReviewRows(source);
    rows[0]!.time = "0.32"; rows[0]!.pitch = "49";
    const edited = applyDrumReview(source, rows, "80");
    assert.equal(edited.bpm, 80);
    assert.equal(edited.duration, source.duration);
    assert.equal(edited.audioOffset, source.audioOffset);
    assert.equal(edited.audioName, source.audioName);
    assert.ok(edited.parts[0]!.notes.some((n) => n.pitch === 49 && n.time === 0.32));
    assert.equal(edited.parts[0]!.notes.find((n) => n.time === 0.8)!.time, 0.8);
    assert.equal(serializeSharedChart(source), wire);
    assert.notEqual(chartIdentity(source), chartIdentity(edited));
    assert.equal(chartIdentity(parseSharedChartText(serializeSharedChart(edited))), chartIdentity(edited));
    const boundary = drumReviewRows(source); boundary[0]!.time = "7.98";
    assert.equal(applyDrumReview(source, boundary, "120").parts[0]!.notes.at(-1)!.duration, 0.02, "rounding at the recording boundary must not create an invalid short tap");
    for (const value of ["", "-1", "8"]) {
      const invalid = drumReviewRows(source); invalid[0]!.time = value;
      assert.throws(() => applyDrumReview(source, invalid, "120"));
    }
    assert.throws(() => applyDrumReview(source, [...rows, rows[0]!], "120"), /same drum/);
    const invalidPitch = drumReviewRows(source); invalidPitch[0]!.pitch = "60";
    assert.throws(() => applyDrumReview(source, invalidPitch, "120"), /supported drum/);
    assert.throws(() => applyDrumReview(source, [], "120"), /at least one/);
  });

  it("creates real drum lanes with family-specific judging and simultaneous targets", () => {
    const source = analyzeSongAudio(drumFixture(), "Study.wav", "judge", "drums").chart;
    const player = { id: "drums", type: "drums", label: "Drums", source: "drums", enabled: true } as const;
    const chart = makeChart(sharedChartToSong(source), player);
    assert.equal(chart.lanes.length, 6);
    const judge = new Judge(chart, { difficulty: "standard", speed: 1, drums: true, onJudge() {} });
    const hit = (pitch: number) => judge.hit(0.3, laneForPitch(pitch, player, chart.lanes));
    assert.equal(hit(38), null);
    assert.equal(hit(36)?.grade, "perfect");
    assert.equal(hit(42)?.grade, "perfect");
    assert.equal(judge.stats.perfect, 2);
  });

  it("keeps author-labeled rhythm charts importable without opening pitch review", () => {
    const source = analyzeSongAudio(drumFixture(), "Study.wav", "rhythm-origin", "drums").chart;
    const rhythm = validateSharedChart({ ...source, version: 2, matching: "rhythm",
      parts: source.parts.map((part) => ({ ...part, notes: part.type === "drums" ? [{ time: 0.3, pitch: 60, duration: 0.06, velocity: 100 }] : [] })) });
    const { entry } = prepareChartImport(serializeSharedChart(rhythm), "Rhythm.json");
    assert.equal(entry.chart.parts[0]!.notes[0]!.pitch, 60);
    assert.equal(isReviewableDrumDraft(entry.chart), false);
    assert.deepEqual(drumReviewRows(entry.chart), []);
    assert.throws(() => applyDrumReview(entry.chart, [], "120"), /pitch-matched/);
    assert.equal(songFromSavedChart(entry).arrangement, "Imported chart");
    assert.equal(isReviewableDrumDraft(source), true);
  });
});
