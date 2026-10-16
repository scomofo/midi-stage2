import { CHART_SCHEMA, validateSharedChart, type SharedChart, type SharedNote } from "./chart-format.ts";
import { INSTRUMENTS } from "./types.ts";

const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];
const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const name = (node: Element) => node.localName || node.tagName.split(":").at(-1)!;
const children = (node: Element, tag?: string): Element[] => Array.from(node.childNodes)
  .filter((child): child is Element => child.nodeType === 1 && (!tag || name(child as Element) === tag));
const child = (node: Element, tag: string) => children(node, tag)[0];
const descendants = (node: Element, tag: string) => Array.from(node.getElementsByTagName("*"))
  .filter((element) => name(element) === tag);
const text = (node: Element, tag: string) => child(node, tag)?.textContent?.trim() ?? "";
function fail(message: string): never { throw new Error(`MusicXML: ${message}`); }
function number(value: string | null, label: string, min = 0, max = 1000000): number {
  const n = value?.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) fail(`${label} is missing or outside the supported range.`);
  return n;
}
function integer(value: string | null, label: string, min: number, max: number) {
  const n = number(value, label, min, max);
  if (!Number.isInteger(n)) fail(`${label} must be a whole number.`);
  return n;
}
function pitch(node: Element, prefix = "") {
  const step = text(node, `${prefix}step`);
  if (STEPS[step] === undefined) fail("A pitch needs a step A–G.");
  const octave = integer(text(node, `${prefix}octave`), "Pitch octave", -1, 9);
  const alterText = text(node, `${prefix}alter`);
  const alter = alterText ? integer(alterText, "Pitch alteration", -2, 2) : 0;
  return (octave + 1) * 12 + STEPS[step]! + alter;
}

/** A bounded, literal score reader. It never infers guitar positions from pitch. */
export function importGuitarMusicXml(
  source: string,
  filename: string,
  parseXml: (source: string) => Document = (source) => new DOMParser().parseFromString(source, "application/xml"),
): { chart: SharedChart; warnings: string[] } {
  if (new TextEncoder().encode(source).byteLength > 4 * 1024 * 1024) fail("Choose a file smaller than 4 MB.");
  // Standard external MusicXML DOCTYPE declarations are common. Drop the
  // declaration before parsing; internal subsets and entities are unsupported.
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source)) fail("XML entities and internal DTDs are not supported.");
  let document: Document;
  try { document = parseXml(source.replace(/<!DOCTYPE[^>]*>/gi, "")); }
  catch { return fail("The XML is malformed. Export an uncompressed MusicXML file again."); }
  const root = document.documentElement;
  if (!root || name(root) !== "score-partwise" || descendants(root, "parsererror").length || document.getElementsByTagName("parsererror").length) {
    fail("Choose an uncompressed score-partwise MusicXML (.musicxml or .xml) file.");
  }
  if (root.getElementsByTagName("*").length > 150000) fail("This score has too many elements.");
  const parts = children(root, "part");
  if (parts.length > 256) fail("This score has too many parts.");
  const candidates: { part: Element; staff: string }[] = [];
  for (const part of parts) {
    const staves = new Set<string>();
    for (const note of descendants(part, "note")) {
      if (child(note, "cue")) continue;
      if (descendants(note, "string").length || descendants(note, "fret").length) staves.add(text(note, "staff") || "1");
    }
    for (const staff of staves) candidates.push({ part, staff });
  }
  if (candidates.length !== 1) fail(candidates.length
    ? "Export one tablature staff at a time so the guitar arrangement is unambiguous."
    : "No authored string/fret data was found. Export a guitar tablature staff with string and fret information.");
  const { part, staff } = candidates[0]!;
  if (["repeat", "ending", "measure-repeat", "beat-repeat"].some((tag) => descendants(part, tag).length)
    || descendants(part, "sound").some((s) => ["dacapo", "dalsegno", "tocoda", "fine", "forward-repeat"].some((attr) => s.hasAttribute(attr)))) {
    fail("Expand repeats, endings and score jumps before exporting this arrangement.");
  }
  if (descendants(part, "octave-shift").length || descendants(part, "scordatura").length) {
    fail("Export octave shifts and scordatura as explicit sounding pitches and staff tuning.");
  }
  const measures = children(part, "measure");
  if (!measures.length || measures.length > 10000) fail("The guitar part must contain 1–10,000 measures.");
  const warnings: string[] = [];
  let tuning = [...STANDARD_TUNING];
  let explicitTuning = false;
  let divisions = 0;
  let barLength = 4;
  let measureStart = 0;
  let transpose = 0;
  let nonStandardMeter = false;
  let techniques = false;
  let cueNotes = false;
  const notes: SharedNote[] = []; // Times and durations are quarter-note units until tempo is resolved.
  const ties = new Map<string, SharedNote>();
  const tempos: { time: number; bpm: number }[] = [];
  const sections: { time: number; name: string }[] = [];
  const beats: { time: number; bar: boolean }[] = [];
  for (const [measureIndex, measure] of measures.entries()) {
    let cursor = 0;
    let furthest = 0;
    let previousStart: number | null = null;
    let previousDuration = 0;
    const location = `measure ${measure.getAttribute("number") || measureIndex + 1}`;
    const durationOf = (node: Element) => {
      if (!divisions) fail(`Set divisions before the notes in ${location}.`);
      return number(text(node, "duration"), `Duration in ${location}`, Number.EPSILON) / divisions;
    };
    for (const element of children(measure)) {
      const tag = name(element);
      if (tag === "attributes") {
        const nextDivisions = text(element, "divisions");
        if (nextDivisions) {
          if (cursor > 0 && Number(nextDivisions) !== divisions) fail("Changes to divisions inside a measure are unsupported.");
          divisions = number(nextDivisions, "Divisions", Number.EPSILON);
        }
        const time = child(element, "time");
        if (time) {
          const top = integer(text(time, "beats"), "Time-signature beats", 1, 32);
          const bottom = integer(text(time, "beat-type"), "Time-signature beat type", 1, 64);
          if (children(time, "beats").length !== 1) fail("Composite time signatures are unsupported.");
          if (cursor > 0) fail("Time-signature changes inside a measure are unsupported.");
          barLength = top * 4 / bottom;
          nonStandardMeter ||= top !== 4 || bottom !== 4;
        }
        for (const transposition of children(element, "transpose")) {
          if ((transposition.getAttribute("number") || staff) !== staff) continue;
          if (child(transposition, "double")) fail("Octave-doubled transposing parts are unsupported.");
          transpose = integer(text(transposition, "chromatic"), "Chromatic transposition", -48, 48)
            + 12 * integer(text(transposition, "octave-change") || "0", "Octave transposition", -4, 4);
        }
        for (const details of children(element, "staff-details")) {
          if ((details.getAttribute("number") || "1") !== staff) continue;
          if (text(details, "staff-lines") && Number(text(details, "staff-lines")) !== 6) fail("Only six-string tablature is supported.");
          if (text(details, "capo") && Number(text(details, "capo")) !== 0) fail("Capo arrangements are unsupported; export a non-capo arrangement with explicit tuning.");
          const openStrings = children(details, "staff-tuning");
          if (openStrings.length) {
            if (openStrings.length !== 6) fail("Supply all six staff-tuning entries.");
            const next = Array<number>(6);
            for (const string of openStrings) {
              const line = integer(string.getAttribute("line"), "Tuning line", 1, 6);
              if (next[line - 1] !== undefined) fail("Tuning lines must be unique.");
              next[line - 1] = pitch(string, "tuning-");
            }
            if (notes.length && next.some((p, i) => p !== tuning[i])) fail("Tuning changes during a song are unsupported.");
            tuning = next;
            explicitTuning = true;
          }
        }
      } else if (tag === "backup" || tag === "forward") {
        cursor += durationOf(element) * (tag === "backup" ? -1 : 1);
        if (cursor < -1e-6) fail(`A backup moves before the start of ${location}.`);
        cursor = Math.max(0, cursor);
        furthest = Math.max(furthest, cursor);
        previousStart = null;
      } else if (tag === "direction" || tag === "sound") {
        const offset = tag === "direction" && text(element, "offset")
          ? number(text(element, "offset"), "Direction offset", -1000000) / divisions : 0;
        const at = measureStart + cursor + offset;
        if (!Number.isFinite(at) || at < 0) fail("A direction has invalid timing.");
        const sounds = tag === "sound" ? [element] : descendants(element, "sound");
        for (const sound of sounds) {
          if (sound.hasAttribute("tempo")) tempos.push({ time: at, bpm: number(sound.getAttribute("tempo"), "Tempo", 20, 400) });
          if (descendants(sound, "swing").length && !descendants(sound, "straight").length) fail("Export swing as explicit note durations before importing.");
        }
        for (const mark of descendants(element, "metronome")) {
          const unit = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25 }[text(mark, "beat-unit")];
          if (!unit || children(mark, "beat-unit").length !== 1) fail("Use a numeric metronome mark for the initial tempo.");
          const dots = children(mark, "beat-unit-dot").length;
          const bpm = number(text(mark, "per-minute"), "Metronome tempo", 1, 1000) * unit * (2 - 1 / 2 ** dots);
          tempos.push({ time: at, bpm });
        }
        for (const mark of descendants(element, "rehearsal")) {
          const label = mark.textContent?.trim().slice(0, 160);
          if (label) sections.push({ time: at, name: label });
        }
      } else if (tag === "note") {
        const selected = (text(element, "staff") || "1") === staff;
        const cue = !!child(element, "cue");
        cueNotes ||= selected && cue;
        if (child(element, "grace")) {
          if (selected && !cue) fail(`Grace-note timing in ${location} is unsupported. Export explicit note durations.`);
          continue;
        }
        const duration = durationOf(element);
        const chord = !!child(element, "chord");
        if (chord && (previousStart === null || duration > previousDuration + 1e-6)) fail(`Invalid chord duration in ${location}.`);
        const at: number = chord ? previousStart! : cursor;
        if (!chord) { previousStart = at; previousDuration = duration; cursor += duration; }
        furthest = Math.max(furthest, at + duration);
        // Silent cues still occupy score time; omit them only after updating
        // the cursor, chord start and measure length.
        if (!selected || child(element, "rest") || cue) continue;
        if (element.hasAttribute("attack") || element.hasAttribute("release")) fail("Export performance attack/release offsets into explicit note timing first.");
        if (["bend", "harmonic", "ornaments", "tremolo", "trill-mark", "glissando"].some((technique) => descendants(element, technique).length)) {
          fail(`Bends, harmonics and ornamental pitch changes in ${location} are unsupported.`);
        }
        techniques ||= ["slide", "hammer-on", "pull-off"].some((technique) => descendants(element, technique).length > 0);
        const technical = descendants(element, "technical");
        const strings = technical.flatMap((t) => children(t, "string"));
        const frets = technical.flatMap((t) => children(t, "fret"));
        if (strings.length !== 1 || frets.length !== 1) fail(`Each guitar note in ${location} needs one authored string and fret.`);
        const string = integer(strings[0]!.textContent, "Guitar string", 1, 6) as 1 | 2 | 3 | 4 | 5 | 6;
        const fret = integer(frets[0]!.textContent, "Guitar fret", 0, 24);
        const written = child(element, "pitch");
        if (!written) fail(`A guitar note in ${location} has no written pitch.`);
        const midi = pitch(written) + transpose;
        if (midi !== tuning[6 - string]! + fret) fail(`Pitch disagrees with string ${string}, fret ${fret} and tuning in ${location}. Check the score's transposition and tuning.`);
        const note: SharedNote = { time: measureStart + at, duration, pitch: midi, velocity: 100, guitarPosition: { string, fret } };
        const key = `${text(element, "voice") || "1"}:${string}:${midi}`;
        const tieTypes = children(element, "tie").map((tie) => tie.getAttribute("type"));
        if (tieTypes.some((type) => type !== "start" && type !== "stop")) fail("An invalid tie was found.");
        if (tieTypes.includes("stop")) {
          const held = ties.get(key);
          if (!held || Math.abs(held.time + held.duration - note.time) > 1e-6 || held.guitarPosition!.fret !== fret) fail(`A tie is incomplete or changes fingering in ${location}.`);
          held.duration += duration;
          if (!tieTypes.includes("start")) ties.delete(key);
        } else {
          if (ties.has(key)) fail(`A tie has no matching stop in ${location}.`);
          notes.push(note);
          if (tieTypes.includes("start")) ties.set(key, note);
        }
        if (notes.length > 60000) fail("The guitar arrangement exceeds 60,000 notes.");
      }
    }
    const length = measure.getAttribute("implicit") === "yes" ? furthest : Math.max(barLength, furthest);
    if (!(length > 0) || length > 128) fail(`Invalid length in ${location}.`);
    for (let beat = 0; beat < length - 1e-6; beat++) beats.push({ time: measureStart + beat, bar: beat === 0 });
    measureStart += length;
  }
  if (ties.size) fail("The guitar arrangement ends with an unfinished tie.");
  if (!notes.length) fail("The tablature staff contains no playable notes.");
  tempos.sort((a, b) => a.time - b.time);
  const bpm = tempos[0]?.bpm ?? 120;
  if (tempos[0] && tempos[0].time > 1e-6) fail("Put an initial tempo at the start of the score.");
  if (tempos.some((tempo) => Math.abs(tempo.bpm - bpm) > 1e-6)) fail("Tempo changes are unsupported; export one constant tempo.");
  if (!tempos.length) warnings.push("No numeric tempo was found; imported at 120 BPM. Check the tempo before playing.");
  if (!explicitTuning) warnings.push("No staff tuning was supplied; standard E2 A2 D3 G3 B3 E4 tuning is used. Review it before adding.");
  if (nonStandardMeter) warnings.push("Note timing follows the score; the stage count-in and visual bar grid use 4/4.");
  if (techniques) warnings.push("Slides, hammer-ons and pull-offs retain their written note attacks; technique is not displayed or scored.");
  if (cueNotes) warnings.push("Silent cue notes are omitted; their written timing is preserved.");
  if (parts.length > 1 || descendants(part, "staves").some((e) => Number(e.textContent) > 1)
    || descendants(part, "note").some((note) => (text(note, "staff") || "1") !== staff)) {
    warnings.push("Only the authored tablature staff is imported. Other parts/staves are omitted.");
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 0x01000193);
  const scale = 60 / bpm;
  const title = text(root, "movement-title") || (child(root, "work") ? text(child(root, "work")!, "work-title") : "")
    || filename.replace(/\.(musicxml|xml)$/i, "") || "Imported guitar";
  const chart = validateSharedChart({
    schema: CHART_SCHEMA, version: 4, id: `musicxml-${(hash >>> 0).toString(16)}`, title,
    bpm, duration: Math.max(0.25, measureStart * scale), origin: "musicxml",
    guitarMode: "strings", guitarTuning: tuning,
    parts: INSTRUMENTS.map((type) => ({ type, notes: type === "guitar" ? notes.map((n) => ({ ...n, time: n.time * scale, duration: n.duration * scale })) : [] })),
    beats: beats.map((b) => ({ ...b, time: b.time * scale })),
    sections: sections.sort((a, b) => a.time - b.time).map((s) => ({ ...s, time: s.time * scale })),
  });
  return { chart, warnings };
}
