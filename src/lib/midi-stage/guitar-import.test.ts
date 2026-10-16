import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { importGuitarMusicXml } from "./musicxml-import.ts";
import { parseSharedChartText, serializeSharedChart, sharedChartToSong, validateSharedChart } from "./chart-format.ts";
import { applyGuitarReview, guitarReviewRows } from "./guitar-chart-review.ts";
import { addLibraryEntry, chartIdentity, loadSongLibrary, prepareChartImport, saveSongLibrary, songFromSavedChart } from "./song-library.ts";
import { Judge, makeChart } from "./engine.ts";
import type { Player } from "./types.ts";

const example = readFileSync(new URL("../../../public/examples/open-string-study.musicxml", import.meta.url), "utf8");
const parseXml = (xml: string) => new DOMParser({ onError: (level, message) => {
  if (level !== "warning") throw new Error(message);
} }).parseFromString(xml, "application/xml") as unknown as Document;
const read = (xml = example) => importGuitarMusicXml(xml, "study.musicxml", parseXml);
const withInitialDirection = (direction: string) => example.replace(/<direction>[\s\S]*?<\/direction>/, direction);
const player: Player = { id: "guitar", type: "guitar", label: "Guitar", enabled: true, source: "guitar" };
const clone = () => structuredClone(read().chart);

describe("authored guitar import", () => {
  it("reads the original MusicXML example into exact positions, chord attacks and holds", () => {
    const { chart, warnings } = read();
    assert.deepEqual(warnings, []);
    assert.equal(chart.version, 4);
    assert.equal(chart.bpm, 96);
    assert.equal(chart.duration, 7.5);
    assert.equal(chart.title, "Open-string Study");
    assert.deepEqual(chart.guitarTuning, [40, 45, 50, 55, 59, 64]);
    const guitar = chart.parts.find((p) => p.type === "guitar")!.notes;
    assert.equal(guitar.length, 16);
    assert.deepEqual(guitar.slice(0, 2).map((n) => [n.time, n.pitch, n.duration, n.guitarPosition]), [
      [0, 40, 0.3125, { string: 6, fret: 0 }], [0.3125, 43, 0.3125, { string: 6, fret: 3 }],
    ]);
    assert.equal(guitar.filter((n) => n.time === 2.5).length, 3);
    assert.equal(guitar.filter((n) => n.time === 5 && n.pitch === 64).length, 2, "unison on two strings must survive normalization");
    const playable = makeChart(sharedChartToSong(chart), player);
    assert.equal(playable.lanes.length, 6);
    assert.equal(playable.notes.length, 16);
    assert.deepEqual(playable.notes.filter((n) => n.time === 5).map((n) => n.lane), [4, 5]);
    const judge = new Judge(playable, { difficulty: "standard", speed: 1, drums: false, onJudge() {} });
    assert.equal(judge.hitPitch(5, 64, "string-2")?.hold, "held");
    assert.equal(judge.hitPitch(5, 64, "string-1")?.hold, "held");
    judge.release("string-2", 6.25);
    judge.release("string-1", 6.25);
    assert.equal(judge.stats.holds, 2);
  });

  it("round trips through canonical JSON and browser storage with six-string identity intact", () => {
    const chart = read().chart;
    const wire = serializeSharedChart(chart);
    assert.deepEqual(parseSharedChartText(wire), chart);
    const entry = prepareChartImport(wire, "study.midistage.json").entry;
    const storage = { data: "", setItem(_key: string, value: string) { this.data = value; }, getItem() { return this.data; } };
    assert.equal(saveSongLibrary([entry], storage).saved, true);
    const restored = loadSongLibrary(storage).entries[0]!;
    assert.equal(restored.id, entry.id);
    const song = songFromSavedChart(restored);
    assert.equal(song.guitarMode, "strings");
    assert.deepEqual(song.guitarTuning, chart.guitarTuning);
    assert.equal(makeChart(song, player).notes.length, 16);
    assert.match(song.arrangementDescription!, /All difficulty levels/);
    assert.equal(addLibraryEntry([entry], restored).length, 1);
  });

  it("rejects missing, contradictory and overlapping physical positions", () => {
    for (const change of [
      (c: ReturnType<typeof clone>) => { delete c.parts[2]!.notes[0]!.guitarPosition; },
      (c: ReturnType<typeof clone>) => { c.parts[2]!.notes[0]!.pitch++; },
      (c: ReturnType<typeof clone>) => { c.parts[2]!.notes[0]!.guitarPosition!.fret = 25; },
      (c: ReturnType<typeof clone>) => { c.parts[2]!.notes[0]!.duration = 1; },
      (c: ReturnType<typeof clone>) => { c.guitarTuning = [40, 45]; },
      (c: ReturnType<typeof clone>) => { c.matching = "rhythm"; },
      (c: ReturnType<typeof clone>) => { c.version = 1; },
      (c: ReturnType<typeof clone>) => { c.parts[2]!.notes.push({ ...c.parts[2]!.notes[0]!, duration: 0.1 }); },
    ]) {
      const chart = clone(); change(chart);
      assert.throws(() => validateSharedChart(chart));
    }
  });

  it("keeps legacy canonical identities unchanged", () => {
    const chart = validateSharedChart({ schema: "midi-stage-chart", version: 1, id: "legacy-golden", title: "Legacy chart",
      bpm: 100, duration: 20, parts: ["drums", "keys", "guitar", "bass"].map((type) => ({ type,
        notes: type === "keys" ? [{ time: 0, duration: 1, pitch: 64 }] : [] })) });
    // Captured with main's parser/serializer before adding version 4.
    assert.equal(chartIdentity(chart), "import:b7fc33d7beb4bc41");
  });

  it("positions multiple voices/staves with backup/forward and respects pickup duration", () => {
    const attributes = example.match(/<attributes>[\s\S]*?<\/attributes>/)![0]
      .replace('<staff-details>', '<staff-details number="2">').replace('<clef>', '<clef number="2">');
    const notes = example.match(/<note>[\s\S]*?<\/note>/g)!.slice(0, 8);
    const tab = notes.map((n) => n.replace('</voice>', '</voice><staff>2</staff>')).join('');
    const staff = notes.map((n) => n.replace(/<notations>[\s\S]*?<\/notations>/, '')).join('');
    const prefix = example.slice(0, example.indexOf('<measure'));
    const dual = `${prefix}<measure number="1">${attributes}<sound tempo="96"/>${staff}<backup><duration>16</duration></backup>${tab}</measure>`
      + `<measure number="2"><forward><duration>4</duration></forward>${tab.slice(0, tab.indexOf('</note>') + 7)}</measure></part></score-partwise>`;
    const result = read(dual);
    assert.equal(result.chart.parts[2]!.notes.length, 9, 'plain notation staff is omitted, not duplicated');
    assert.equal(result.chart.parts[2]!.notes[0]!.time, 0);
    assert.equal(result.chart.parts[2]!.notes[8]!.time, 3.125);
    assert.ok(result.warnings.some((w) => /Other parts\/staves/.test(w)));
    const one = notes[0]!.replace('<duration>2</duration>', '<duration>4</duration>');
    const pickup = `${prefix}<measure number="0" implicit="yes">${attributes.replace('number="2"', 'number="1"').replace('number="2"', 'number="1"')}<sound tempo="96"/>${one}</measure>`
      + `<measure number="1">${one}</measure></part></score-partwise>`;
    assert.equal(read(pickup).chart.parts[2]!.notes[1]!.time, 0.625);
  });

  it("omits silent cue attacks while preserving their duration and chord positioning", () => {
    const attributes = example.match(/<attributes>[\s\S]*?<\/attributes>/)![0];
    const prefix = example.slice(0, example.indexOf('<measure'));
    const position = '<notations><technical><string>1</string><fret>0</fret></technical></notations>';
    for (const metadata of ['', position]) {
      const cue = `<note><cue/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration>${metadata}</note>`;
      const chordCue = '<note><cue/><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration></note>';
      const graceCue = '<note><grace/><cue/><pitch><step>C</step><octave>5</octave></pitch></note>';
      const playable = '<note><pitch><step>E</step><octave>2</octave></pitch><duration>4</duration><notations><technical><string>6</string><fret>0</fret></technical></notations></note>';
      const result = read(`${prefix}<measure number="0" implicit="yes">${attributes}<sound tempo="96"/>${graceCue}${cue}${chordCue}${playable}</measure></part></score-partwise>`);
      assert.deepEqual(result.chart.parts[2]!.notes.map((n) => [n.time, n.duration, n.pitch]), [[0.625, 0.625, 40]]);
      assert.equal(result.chart.duration, 1.25, 'silent cue duration still advances the pickup measure');
      assert.ok(result.warnings.some((w) => /Silent cue notes/.test(w)));
    }
  });

  it("does not treat a cue-only staff as another guitar arrangement", () => {
    const cue = '<note><cue/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><staff>2</staff><notations><technical><string>1</string><fret>0</fret></technical></notations></note>';
    const result = read(example.replace('<note>', `${cue}<backup><duration>2</duration></backup><note>`));
    assert.deepEqual(result.chart.parts[2]!.notes, read().chart.parts[2]!.notes);
    assert.equal(result.chart.duration, read().chart.duration);
    assert.throws(() => read(example.replaceAll('<note>', '<note><cue/>')), /No authored/);
  });

  it("keeps sounding notes whose printed size is cue", () => {
    const result = read(example.replaceAll('<type>eighth</type>', '<type size="cue">eighth</type>'));
    assert.deepEqual(result.chart.parts[2]!.notes, read().chart.parts[2]!.notes);
    assert.deepEqual(result.warnings, []);
  });

  it("keeps visual-only direction offsets out of playback tempo timing", () => {
    const original = read().chart;
    const metronome = '<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>96</per-minute></metronome></direction-type>';
    for (const attribute of ['', ' sound="no"']) {
      for (const offset of ['4', '-4']) {
        for (const sound of ['', '<sound tempo="96"/>']) {
          const direction = `<direction>${metronome}<offset${attribute}>${offset}</offset>${sound}</direction>`;
          const result = read(withInitialDirection(direction)).chart;
          assert.equal(result.bpm, 96);
          assert.deepEqual(result.parts, original.parts);
        }
      }
    }
  });

  it("honors standalone sound offsets and direction playback offsets", () => {
    const metronome = '<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>96</per-minute></metronome></direction-type>';
    for (const sound of ['', '<sound tempo="96"/>']) {
      const later = `<direction>${metronome}<offset sound="yes">4</offset>${sound}</direction>`;
      assert.throws(() => read(withInitialDirection(later)), /initial tempo at the start/);
    }
    assert.throws(() => read(withInitialDirection('<sound tempo="96"><offset>4</offset></sound>')), /initial tempo at the start/);
    const initial = '<forward><duration>4</duration></forward><sound tempo="96"><offset>-4</offset></sound><backup><duration>4</duration></backup>';
    assert.deepEqual(read(withInitialDirection(initial)).chart.parts, read().chart.parts);
    assert.throws(() => read(withInitialDirection('<sound tempo="96"><offset>-4</offset></sound>')), /invalid timing/);
  });

  it("lets a nested sound offset override the direction without moving rehearsal markers", () => {
    const metronome = '<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>96</per-minute></metronome></direction-type>';
    const direction = `<direction>${metronome}<direction-type><rehearsal>Offset section</rehearsal></direction-type><offset sound="yes">4</offset><sound tempo="96"><offset>0</offset></sound></direction>`;
    const result = read(withInitialDirection(direction)).chart;
    assert.equal(result.bpm, 96);
    assert.deepEqual(result.parts, read().chart.parts);
    assert.equal(result.sections.find((s) => s.name === 'Offset section')!.time, 0.625);
    const later = `<direction>${metronome}<offset sound="yes">0</offset><sound tempo="96"><offset>4</offset></sound></direction>`;
    assert.throws(() => read(withInitialDirection(later)), /initial tempo at the start/);
    const change = example.replace('<measure number="2">', '<measure number="2"><sound tempo="96"><offset>0</offset></sound><sound tempo="100"><offset>4</offset></sound>');
    assert.throws(() => read(change), /Tempo changes/);
  });

  it("applies row corrections atomically, derives pitches, and retimes the whole chart for tempo changes", () => {
    const source = clone();
    const original = serializeSharedChart(source);
    const rows = guitarReviewRows(source);
    rows[0]!.fret = "1";
    const edited = applyGuitarReview(source, rows, "48");
    assert.equal(edited.bpm, 48);
    assert.equal(edited.duration, 15);
    assert.equal(edited.parts[2]!.notes[0]!.pitch, 41);
    assert.equal(edited.parts[2]!.notes[1]!.time, 0.625);
    assert.equal(edited.sections[1]!.time, 5);
    assert.equal(edited.beats[1]!.time, 1.25);
    assert.notEqual(chartIdentity(edited), chartIdentity(source));
    assert.equal(serializeSharedChart(source), original, "review never mutates the source");
    rows[0]!.time = "";
    assert.throws(() => applyGuitarReview(source, rows, "96"), /needs a number/);
    assert.throws(() => applyGuitarReview(source, [], "96"), /at least one/);
    assert.throws(() => applyGuitarReview(source, guitarReviewRows(source), "0"), /Tempo/);
    rows[0]!.time = "0"; rows[0]!.duration = "1";
    assert.throws(() => applyGuitarReview(source, rows, "96"), /overlapping/);
  });

  it("retimes chord labels for tempo-only changes and clears stale guitar labels after note edits", () => {
    const source = clone();
    source.chordHighways.guitar = [{ time: 2.5, duration: 1.25, name: "E5", roman: "i", pitches: [40, 47, 52] }];
    const rows = guitarReviewRows(source);
    assert.equal(applyGuitarReview(source, rows, "48").chordHighways.guitar[0]!.time, 5);
    rows[0]!.fret = "1";
    assert.deepEqual(applyGuitarReview(source, rows, "96").chordHighways.guitar, []);
    assert.equal(source.chordHighways.guitar.length, 1);
  });

  it("keeps custom tuning and explicit transposition, and merges ties without new attacks", () => {
    const detuned = example.replace("<tuning-step>E</tuning-step><tuning-octave>2", "<tuning-step>D</tuning-step><tuning-octave>2")
      .replaceAll("<step>E</step><octave>2", "<step>D</step><octave>2")
      .replace("<step>G</step><octave>2", "<step>F</step><octave>2");
    assert.equal(read(detuned).chart.guitarTuning![0], 38);
    const transposed = example.replace("</divisions>", "</divisions><transpose><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>")
      .replace(/<octave>(\d)<\/octave>/g, (_match, octave) => `<octave>${Number(octave) + 1}</octave>`);
    assert.deepEqual(read(transposed).chart.parts[2]!.notes, read().chart.parts[2]!.notes);
    const tieNotes = '<note><pitch><step>E</step><octave>2</octave></pitch><duration>8</duration><tie type="start"/><notations><technical><string>6</string><fret>0</fret></technical></notations></note>'
      + '<note><pitch><step>E</step><octave>2</octave></pitch><duration>8</duration><tie type="stop"/><notations><technical><string>6</string><fret>0</fret></technical></notations></note>';
    const tied = example.replace(/<note>[\s\S]*<\/note>/, tieNotes);
    const note = read(tied).chart.parts[2]!.notes;
    assert.equal(note.length, 1);
    assert.equal(note[0]!.duration, 2.5);
  });

  it("fails clearly on unsupported or ambiguous MusicXML instead of guessing", () => {
    const variants = [
      [example.replace('<sound tempo="96"/>', '<sound tempo="96"/><sound tempo="100"/>'), /Tempo changes/],
      [example.replace('<measure number="2">', '<measure number="2"><barline><repeat direction="backward"/></barline>'), /Expand repeats/],
      [example.replace('<staff-lines>6</staff-lines>', '<staff-lines>7</staff-lines>'), /six-string/],
      [example.replace('<staff-lines>6</staff-lines>', '<staff-lines>6</staff-lines><capo>2</capo>'), /Capo/],
      [example.replace('<string>6</string>', '<string>2</string>'), /Pitch disagrees/],
      [example.replace('<fret>0</fret>', ''), /one authored string and fret/],
      [example.replace('<note>', '<note><grace/>'), /Grace-note/],
      [example.replace('<technical>', '<technical><bend><bend-alter>1</bend-alter></bend>'), /Bends/],
      [example.replaceAll('<technical>', '<technical><fret>0</fret>'), /one authored/],
      ['<!DOCTYPE score-partwise [<!ENTITY x "payload">]>' + example, /entities/],
      ['<score-timewise/>', /score-partwise/],
    ] as const;
    for (const [xml, error] of variants) assert.throws(() => read(xml), error);
    assert.throws(() => read(example.slice(0, -100)));
    assert.throws(() => read('x'.repeat(4 * 1024 * 1024 + 1)), /4 MB/);
    assert.throws(() => read(example.replace(/<technical>[\s\S]*?<\/technical>/g, '')), /No authored/);
    const withDoctype = read(example.replace('<score-partwise', '<!DOCTYPE score-partwise SYSTEM "https://example.invalid/score.dtd"><score-partwise')).chart;
    assert.deepEqual(withDoctype.parts, read().chart.parts);
  });
});
