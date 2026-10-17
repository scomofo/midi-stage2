import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultPlayers } from "./engine.ts";
import { hasScoredGuitar, isGuitarOnlySong, lineupForSong } from "./lineup.ts";
import { makeGuitarDraft } from "./guitar-draft.ts";
import { makeKeyboardDraft } from "./keyboard-draft.ts";
import { combineStemCharts } from "./multi-stem-import.ts";
import { sharedChartToSong } from "./chart-format.ts";
import { makeBacklineDrive, makeBacklineDriveArcade } from "./guitar-song.ts";

const event = { startTimeSeconds: 0.5, durationSeconds: 0.4, pitchMidi: 60, amplitude: 0.9 };
const guitar = makeGuitarDraft([event], 4, "guitar.wav", "guitar").chart;
const keys = makeKeyboardDraft([event], 4, "piano.wav", "keys").chart;

describe("imported song lineup", () => {
  it("preserves built-in solo guitar controls while its synthesized backing band plays", () => {
    for (const song of [makeBacklineDrive(), makeBacklineDriveArcade(), { ...makeBacklineDriveArcade(), original: false }]) {
      assert.equal(isGuitarOnlySong(song), true);
      assert.deepEqual(lineupForSong(song, defaultPlayers()).filter((player) => player.enabled).map((player) => player.id), ["guitar"]);
    }
  });
  it("keeps a mixed chart on the current playable instrument instead of forcing guitar", () => {
    const song = sharedChartToSong(combineStemCharts({ guitar, keys }, "Song.wav"));
    const current = defaultPlayers();
    const next = lineupForSong(song, current);
    assert.equal(isGuitarOnlySong(song), false);
    assert.deepEqual(next.filter((player) => player.enabled).map((player) => player.id), ["keys"]);
    assert.equal(hasScoredGuitar(song, next), false);
    next.find((player) => player.id === "guitar")!.enabled = true;
    assert.equal(hasScoredGuitar(song, next), true);
    assert.deepEqual(lineupForSong(song, next).filter((player) => player.enabled).map((player) => player.id), ["keys", "guitar"]);
    assert.equal(current.find((player) => player.id === "guitar")!.enabled, false);
  });

  it("retains the solo guitar setup and finds a playable fallback for unavailable parts", () => {
    const solo = sharedChartToSong(guitar);
    assert.equal(isGuitarOnlySong(solo), true);
    assert.deepEqual(lineupForSong(solo, defaultPlayers()).filter((player) => player.enabled).map((player) => player.id), ["guitar"]);
    const mixed = sharedChartToSong(combineStemCharts({ guitar, keys }, "Song.wav"));
    const drums = defaultPlayers().map((player) => ({ ...player, enabled: player.id === "drums" }));
    assert.deepEqual(lineupForSong(mixed, drums).filter((player) => player.enabled).map((player) => player.id), ["keys"]);
  });
});
