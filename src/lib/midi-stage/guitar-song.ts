import type { Difficulty, GuitarPosition, Harmony, Instrument, Note, Part, Song } from "./types";

type Fret = 0 | 1 | 2 | 3 | 4;
type RiffHit = readonly [beat: number, fret: Fret, pitch: number];

const BPM = 100;
const BEAT = 60 / BPM;
const BARS = 16;
const GUITAR_TUNING = [40, 45, 50, 55, 59, 64] as const;

// The riff stays in open position. String 1 is high E; string 6 is low E.
const RIFF_POSITIONS: Record<number, GuitarPosition> = {
  40: { string: 6, fret: 0 },
  43: { string: 6, fret: 3 },
  45: { string: 5, fret: 0 },
  47: { string: 5, fret: 2 },
  50: { string: 4, fret: 0 },
  52: { string: 4, fret: 2 },
};

const CHORDS = {
  E: { root: 40, guitarRoot: 40, fret: 0, pair: [0, 2], triple: [0, 2, 3], name: "E5", roman: "i",
    positions: [{ string: 6, fret: 0 }, { string: 5, fret: 2 }, { string: 4, fret: 2 }] },
  G: { root: 43, guitarRoot: 43, fret: 1, pair: [1, 3], triple: [1, 3, 4], name: "G5", roman: "III",
    positions: [{ string: 6, fret: 3 }, { string: 5, fret: 5 }, { string: 4, fret: 5 }] },
  // Standard tuning has no D2. Voice the guitar an octave above the bass root.
  D: { root: 38, guitarRoot: 50, fret: 4, pair: [1, 4], triple: [0, 1, 4], name: "D5", roman: "VII",
    positions: [{ string: 4, fret: 0 }, { string: 3, fret: 2 }, { string: 2, fret: 3 }] },
  A: { root: 45, guitarRoot: 45, fret: 2, pair: [2, 4], triple: [1, 2, 4], name: "A5", roman: "iv",
    positions: [{ string: 5, fret: 0 }, { string: 4, fret: 2 }, { string: 3, fret: 2 }] },
} as const;

const PROGRESSION: (keyof typeof CHORDS)[] = [
  "E", "E", "E", "D", "E", "E", "G", "A",
  "E", "G", "D", "A", "E", "E", "D", "E",
];

// The optional arcade arrangement has an independent five-button mapping.
// Physical string/fret positions always come from the authored voicing above.
const RIFF: readonly RiffHit[][] = [
  [[0, 0, 40], [1, 0, 40], [1.5, 1, 43], [2, 0, 40], [3, 2, 45], [3.5, 1, 43]],
  [[0, 0, 40], [1, 1, 43], [2, 3, 47], [3, 1, 43]],
  [[0, 1, 43], [1, 1, 43], [2, 4, 50], [3, 3, 47]],
  [[0, 2, 45], [1, 3, 47], [2, 0, 52], [3, 4, 50], [3.5, 1, 43]],
];

const RIFF_EXTRAS: readonly RiffHit[][] = [
  [[0.5, 0, 40], [2.5, 3, 47]],
  [[0.5, 0, 40], [1.5, 2, 45], [2.5, 2, 45], [3.5, 4, 50]],
  [[0.5, 2, 45], [1.5, 3, 47], [2.5, 2, 45], [3.5, 4, 50]],
  [[0.5, 2, 45], [1.5, 4, 50], [2.5, 4, 50]],
];

function createBacklineDrive(difficulty: Difficulty, arcade: boolean): Song {
  const parts: Part[] = [
    { id: "drums", name: "Drums", type: "drums", channel: 10, notes: [] },
    { id: "keys", name: "Keys", type: "keys", channel: 1, notes: [] },
    { id: "guitar", name: "Guitar", type: "guitar", channel: 2, notes: [] },
    { id: "bass", name: "Bass", type: "bass", channel: 3, notes: [] },
  ];
  const byType = Object.fromEntries(parts.map((part) => [part.type, part])) as Record<Instrument, Part>;
  const harmony: Harmony[] = [];
  const add = (type: Instrument, beat: number, pitch: number, duration: number, velocity: number, arcadeFret?: Fret, guitarPosition?: GuitarPosition) => {
    const note: Note = { time: beat * BEAT, duration: duration * BEAT, pitch, velocity };
    if (arcade && arcadeFret !== undefined) note.arcadeFret = arcadeFret;
    if (guitarPosition) note.guitarPosition = { ...guitarPosition };
    byType[type].notes.push(note);
  };
  const single = (beat: number, fret: Fret, pitch: number, duration = 0.35, velocity = 96, position?: GuitarPosition) => {
    const guitarPosition = position ?? RIFF_POSITIONS[pitch];
    if (!guitarPosition) throw new Error(`Backline Drive needs an authored position for MIDI note ${pitch}.`);
    add("guitar", beat, pitch, duration, velocity, fret, guitarPosition);
  };
  const powerChord = (beat: number, chord: (typeof CHORDS)[keyof typeof CHORDS], duration: number) => {
    if (difficulty === "chill") {
      single(beat, chord.fret, chord.guitarRoot, duration, 102, chord.positions[0]);
      return;
    }
    const frets = difficulty === "expert" ? chord.triple : chord.pair;
    frets.forEach((fret, index) => single(beat, fret, chord.guitarRoot + [0, 7, 12][index]!, duration, 104 - index * 5, chord.positions[index]));
  };

  for (let bar = 0; bar < BARS; bar++) {
    const start = bar * 4;
    const chord = CHORDS[PROGRESSION[bar]!];
    harmony.push({ time: start * BEAT, duration: 4 * BEAT, name: chord.name, roman: chord.roman });

    // The band stays constant across levels: simplifying the chart never removes
    // the groove, changes the song length, or shifts a bookmarked passage.
    if (bar === BARS - 1) {
      add("drums", start, 36, 0.12, 112);
      add("drums", start, 49, 1.4, 101);
      add("bass", start, 28, 3.5, 105);
      powerChord(start, CHORDS.E, 3.5);
      continue;
    }

    const lift = bar >= 8 && bar < 12;
    add("drums", start, 36, 0.12, 105);
    add("drums", start + 2, 36, 0.12, 99);
    if (bar >= 4) add("drums", start + 2.5, 36, 0.12, 86);
    for (const offset of [1, 3]) add("drums", start + offset, 38, 0.13, lift ? 106 : 96);
    const hats = bar < 4 ? 4 : 8;
    for (let index = 0; index < hats; index++) {
      add("drums", start + index * (hats === 4 ? 1 : 0.5), lift ? 51 : 42, 0.1, index % 2 ? 56 : 72);
    }
    if (bar % 4 === 0) add("drums", start, 49, 0.7, 90);
    if ([3, 7, 11, 14].includes(bar)) {
      [48, 45, 43].forEach((pitch, index) => add("drums", start + 3.25 + index * 0.25, pitch, 0.12, 81 + index * 7));
    }
    add("bass", start, chord.root - 12, bar < 4 ? 1.7 : 1.15, 100);
    add("bass", start + 2, chord.root - 12, bar < 4 ? 1.7 : 0.7, 95);
    if (bar >= 4) {
      add("bass", start + 1.5, chord.root - 12, 0.35, 85);
      add("bass", start + 3, chord.root - 5, 0.7, 89);
    }

    if (bar < 4) {
      const intro: readonly Fret[][] = [[0, 0, 1, 0], [0, 1, 2, 1], [0, 0, 3, 2], [1, 2, 4, 3]];
      const phrase = intro[bar]!;
      const offsets = difficulty === "chill" ? [0, 2] : bar === 2 ? [0, 2, 3] : [0, 1, 2, 3];
      for (const offset of offsets) {
        const fret = phrase[offset]!;
        single(start + offset, fret, [40, 43, 45, 47, 50][fret]!, bar === 2 && offset === 0 ? 1.5 : 0.55);
      }
    } else if (lift) {
      const offsets = difficulty === "expert" ? [0, 1.5, 2.5, 3.5] : [0, 2];
      offsets.forEach((offset, index) => {
        const next = offsets[index + 1] ?? 4;
        powerChord(start + offset, chord, Math.min(1.35, next - offset - 0.2));
      });
    } else {
      // Bring back the opening riff in the final section, then descend through
      // D–B–A–G before the last E power chord rings out.
      const riffIndex = bar < 8 ? bar - 4 : bar - 12;
      const ending: RiffHit[] = [[0, 4, 50], [1, 3, 47], [2, 2, 45], [3, 1, 43]];
      let phrase = bar === 14 ? ending : [...RIFF[riffIndex]!];
      if (difficulty === "chill") phrase = phrase.filter(([offset]) => offset === 0 || offset === 2);
      if (difficulty === "expert") {
        const extras: readonly RiffHit[] = bar === 14 ? [[0.5, 4, 50], [1.5, 3, 47], [2.5, 2, 45], [3.5, 0, 40]] : RIFF_EXTRAS[riffIndex]!;
        phrase = [...phrase, ...extras];
      }
      for (const [offset, fret, pitch] of phrase) single(start + offset, fret, pitch, difficulty === "chill" ? 0.8 : 0.35, offset % 1 === 0 ? 98 : 85);
    }
  }

  for (const part of parts) part.notes.sort((a, b) => a.time - b.time || a.pitch - b.pitch);
  const duration = BARS * 4 * BEAT;
  return {
    id: arcade ? "backline-drive-arcade" : "backline-drive",
    name: arcade ? "Backline Drive · Arcade" : "Backline Drive",
    subtitle: arcade ? "Five buttons, one rock riff. Hold the shape and strum." : "Six strings. Real frets. Make the last chord ring.",
    tag: arcade ? "ARCADE GUITAR" : "SIX-STRING GUITAR",
    bpm: BPM,
    duration,
    original: true,
    guitarMode: arcade ? "fret-strum" : "strings",
    guitarTuning: GUITAR_TUNING,
    parts,
    beats: Array.from({ length: BARS * 4 + 1 }, (_, index) => ({ time: index * BEAT, bar: index % 4 === 0 })),
    sections: ["FIND THE STRUM", "MAIN RIFF", "POWER CHORD LIFT", "BRING IT HOME"].map((name, index) => ({ time: index * 16 * BEAT, name })),
    harmony,
    arrangement: difficulty,
    arrangementDescription: (arcade ? {
      chill: "Single-button riffs and spacious strums, with a full rhythm section.",
      standard: "An E-minor riff, two-button power chords, and a ringing finish.",
      expert: "Offbeat strums, three-button power chords, and a descending final run.",
    } : {
      chill: "Open-position single notes and spacious strums in standard tuning.",
      standard: "An E-minor riff, two-string power chords, and a ringing finish.",
      expert: "Offbeat picking, three-string power chords, and a descending final run.",
    })[difficulty],
    key: "E minor",
    art: "voltage",
  };
}

/** Original guitar arrangement with explicit, playable standard-tuning positions. */
export function makeBacklineDrive(difficulty: Difficulty = "standard"): Song {
  return createBacklineDrive(difficulty, false);
}

/** Optional five-button controls over the same authored music and fingering. */
export function makeBacklineDriveArcade(difficulty: Difficulty = "standard"): Song {
  return createBacklineDrive(difficulty, true);
}
