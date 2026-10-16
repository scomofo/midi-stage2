import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keyboardFixture } from "../../../scripts/fixtures/keyboard-draft.mjs";
import { makeKeyboardDraft, isReviewableKeyboardDraft, type KeyboardEvent } from "./keyboard-draft.ts";
import { keyboardMono } from "./keyboard-transcription.ts";
import { applyKeyboardReview, keyboardReviewRows } from "./keyboard-chart-review.ts";
import { parseSharedChartText, serializeSharedChart, sharedChartToSong, validateSharedChart } from "./chart-format.ts";
import { chartIdentity } from "./song-library.ts";
import { makeChart, Judge, laneForPitch } from "./engine.ts";

const events: KeyboardEvent[] = keyboardFixture().events.map((n) => ({ pitchMidi: n.pitch, startTimeSeconds: n.time, durationSeconds: n.duration, amplitude: 0.8 }));
const draft = () => makeKeyboardDraft(events, 6, "Piano study.wav", "keyboardfixture").chart;

describe("keyboard audio drafts", () => {
  it("preserves chord onsets, octaves and holds, and drops weak/non-piano/padded candidates", () => {
    const { chart } = makeKeyboardDraft([...events, { ...events[0]!, pitchMidi: 76, amplitude: 0.3 },
      { ...events[0]!, pitchMidi: 120 }, { ...events[0]!, startTimeSeconds: 7 },
      { ...events[0]!, startTimeSeconds: 5.7, durationSeconds: 0.8, pitchMidi: 21 }], 6, "Piano.wav", "notes");
    assert.equal(chart.version, 1); assert.equal(chart.matching, undefined);
    assert.equal(chart.origin, "audio-keys-draft"); assert.equal(chart.firstBeat, 0.6);
    assert.deepEqual(chart.parts[1]!.notes.slice(0, 3).map((n) => [n.time, n.pitch, n.duration]), [[0.6, 60, 0.8], [0.6, 64, 0.8], [0.6, 67, 0.8]]);
    assert.equal(chart.parts[1]!.notes.at(-1)!.duration, 0.3);
    assert.ok(chart.parts.filter((p) => p.type !== "keys").every((p) => !p.notes.length));
    assert.throws(() => makeKeyboardDraft([], 6, "Empty.wav", "none"), /No clear keyboard/);
  });

  it("reviews time, pitch and length atomically without retiming the backing", () => {
    const source = draft(), original = serializeSharedChart(source), rows = keyboardReviewRows(source);
    rows[0] = { ...rows[0]!, pitch: "61", time: "0.62", duration: "1.1" };
    const result = applyKeyboardReview(source, rows, "90");
    assert.equal(result.bpm, 90); assert.equal(result.duration, 6); assert.equal(result.audioOffset, 0);
    assert.ok(result.parts[1]!.notes.some((n) => n.pitch === 61 && n.time === 0.62 && n.duration === 1.1));
    assert.equal(result.parts[1]!.notes.find((n) => n.pitch === 72)!.time, 3);
    assert.equal(serializeSharedChart(source), original);
    assert.equal(chartIdentity(parseSharedChartText(serializeSharedChart(result))), chartIdentity(result));
    for (const patch of [{ pitch: "20" }, { pitch: "60.5" }, { time: "" }, { time: "-1" }, { duration: "0.01" }, { duration: "7" }]) {
      const invalid = keyboardReviewRows(source); invalid[0] = { ...invalid[0]!, ...patch };
      assert.throws(() => applyKeyboardReview(source, invalid, "120"));
    }
    assert.throws(() => applyKeyboardReview(source, [], "120"), /at least one/);
    assert.throws(() => applyKeyboardReview(source, [...keyboardReviewRows(source), keyboardReviewRows(source)[0]!], "120"), /same pitch/);
    const rhythm = validateSharedChart({ ...source, version: 2, matching: "rhythm" });
    assert.equal(isReviewableKeyboardDraft(rhythm), false); assert.deepEqual(keyboardReviewRows(rhythm), []);
    const authored = validateSharedChart({ ...source, version: 4, guitarMode: "strings", guitarTuning: [40, 45, 50, 55, 59, 64],
      parts: source.parts.map((p) => ({ ...p, notes: p.type === "guitar" ? [{ time: 0.5, pitch: 40, duration: 0.5, velocity: 100, guitarPosition: { string: 6, fret: 0 } }] : p.notes })),
    });
    assert.equal(isReviewableKeyboardDraft(authored), false, "authored guitar arrangements keep their own editor");
    const widePitch = validateSharedChart({ ...source, parts: source.parts.map((p) => ({ ...p, notes: p.type === "keys" ? [{ time: 0.5, pitch: 127, duration: 0.5, velocity: 100 }] : [] })) });
    assert.equal(isReviewableKeyboardDraft(widePitch), false);
  });

  it("keeps leading silence and antiphase stereo in a separate analysis copy, with cancellation", async () => {
    const mono = keyboardFixture(22050), stereo = keyboardFixture(22050, 2);
    const before = stereo.getChannelData(0).slice();
    assert.deepEqual(await keyboardMono(stereo), await keyboardMono(mono));
    assert.deepEqual(stereo.getChannelData(0), before);
    assert.ok((await keyboardMono(mono)).subarray(0, 22050 * 0.6).every((v) => v === 0));
    const controller = new AbortController();
    const pending = keyboardMono(mono, controller.signal); controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    const silent = { ...mono, getChannelData: () => new Float32Array(mono.length) };
    await assert.rejects(keyboardMono(silent), /silent/);
    for (const numberOfChannels of [0, NaN, 1.5]) await assert.rejects(keyboardMono({ ...mono, numberOfChannels }), /not valid/);
  });

  it("makes chord lanes and sustained keyboard targets through the existing judge", () => {
    const player = { id: "keys", type: "keys", source: "keys", label: "Keys", enabled: true } as const;
    const chart = makeChart(sharedChartToSong(draft()), player);
    assert.equal(chart.lanes.length, 3); assert.equal(chart.notes.length, 5);
    const judge = new Judge(chart, { difficulty: "standard", speed: 1, drums: false, onJudge() {} });
    for (const pitch of [60, 64, 67]) assert.equal(judge.hit(0.6, laneForPitch(pitch, player, chart.lanes), `midi:${pitch}`, pitch)?.grade, "perfect");
    assert.equal(judge.stats.perfect, 3); assert.equal(judge.activeHolds.size, 3);
    judge.tick(1.5); assert.ok(judge.notes.slice(0, 3).every((n) => n.hold === "complete"));
  });
});
