import type { Harmony, Instrument, Part, Song } from "./types";
import { INSTRUMENTS } from "./types";

const LABELS: Record<Instrument, string> = {
  drums: "Drums",
  keys: "Keys",
  guitar: "Guitar",
  bass: "Bass",
};

function emptyParts(): Part[] {
  return INSTRUMENTS.map((type, i) => ({
    id: type,
    name: LABELS[type],
    type,
    channel: type === "drums" ? 10 : i,
    notes: [],
  }));
}

function beats(duration: number, beat: number) {
  const out: Song["beats"] = [];
  for (let t = 0, i = 0; t <= duration + 1e-6; t += beat, i++) {
    out.push({ time: t, bar: i % 4 === 0 });
  }
  return out;
}

export function makeOpenStage(difficulty: "chill" | "standard" | "expert" = "standard"): Song {
  const bpm = 96;
  const beat = 60 / bpm;
  const parts = emptyParts();
  const byType = Object.fromEntries(parts.map((p) => [p.type, p])) as Record<Instrument, Part>;
  const add = (type: Instrument, b: number, pitch: number, duration: number, velocity = 90) => {
    byType[type].notes.push({ time: b * beat, duration: duration * beat, pitch, velocity });
  };
  const addChord = (b: number, pitches: number[], duration: number) => {
    for (const pitch of pitches) add("keys", b, pitch, duration, difficulty === "expert" ? 88 : 82);
  };

  const form: { name: string; style: string; chords: string[] }[] = [
    { name: "INTRO", style: "intro", chords: ["C", "G", "Am", "F"] },
    { name: "VERSE", style: "verse", chords: ["C", "G", "Am", "F", "C", "G", "Am", "F"] },
    { name: "CHORUS", style: "chorus", chords: ["F", "C", "G", "Am", "F", "C", "G", "G"] },
    { name: "BRIDGE", style: "bridge", chords: ["Dm", "Am", "F", "G"] },
    { name: "FINAL CHORUS", style: "chorus", chords: ["F", "C", "G", "Am", "F", "C", "G", "G"] },
    { name: "OUTRO", style: "outro", chords: ["F", "G", "C", "C"] },
  ];
  const harmonyMap: Record<string, { root: number; triad: number[]; inversion: number[]; rich: number[]; roman: string }> = {
    C: { root: 48, triad: [60, 64, 67], inversion: [60, 64, 67], rich: [48, 60, 64, 67, 71], roman: "I" },
    G: { root: 43, triad: [55, 59, 62], inversion: [59, 62, 67], rich: [43, 59, 62, 65, 67], roman: "V" },
    Am: { root: 45, triad: [57, 60, 64], inversion: [60, 64, 69], rich: [45, 60, 64, 67, 69], roman: "vi" },
    F: { root: 41, triad: [53, 57, 60], inversion: [57, 60, 65], rich: [41, 57, 60, 64, 65], roman: "IV" },
    Dm: { root: 50, triad: [62, 65, 69], inversion: [57, 62, 65], rich: [50, 57, 60, 62, 65], roman: "ii" },
  };

  const sections: Song["sections"] = [];
  const harmony: Harmony[] = [];
  let bar = 0;
  for (const section of form) {
    sections.push({ time: bar * 4 * beat, name: section.name });
    for (let index = 0; index < section.chords.length; index++, bar++) {
      const b = bar * 4;
      const name = section.chords[index]!;
      const h = harmonyMap[name]!;
      const finalBar = section.style === "outro" && index === 3;
      const chorus = section.style === "chorus";
      harmony.push({ time: b * beat, duration: 4 * beat, name, roman: h.roman });

      if (finalBar) {
        add("drums", b, 36, 0.15, 104);
        add("drums", b, 49, 1.6, 92);
        add("bass", b, h.root - 12, 3.3, 96);
        add("guitar", b, h.root + 12, 3.3, 78);
        addChord(b, difficulty === "expert" ? [48, 60, 64, 67] : [60, 64, 67], 3.3);
        continue;
      }

      const light = section.style === "intro" || section.style === "bridge";
      add("drums", b, 36, 0.12, 98);
      add("drums", b + 2, 36, 0.12, 94);
      add("drums", b + 1, 38, 0.12, light ? 68 : 96);
      add("drums", b + 3, 38, 0.12, light ? 72 : 99);
      for (let i = 0; i < (light ? 4 : 8); i++) {
        add("drums", b + i * (light ? 1 : 0.5), chorus ? 51 : 42, 0.1, i % 2 ? 57 : 73);
      }
      if (index === 0) add("drums", b, 49, 0.5, 85);
      if (!light && index === section.chords.length - 1) {
        for (let i = 0; i < 3; i++) add("drums", b + 3.25 + i * 0.25, [48, 45, 43][i]!, 0.1, 82 + i * 5);
      }
      add("bass", b, h.root - 12, 1.7, 95);
      add("bass", b + 2, h.root - 12, 1.15, 90);
      if (chorus) add("bass", b + 3.5, h.root - 5, 0.35, 82);

      const third = name.endsWith("m") ? 3 : 4;
      const guitarPitches = [h.root + 12, h.root + 19, h.root + 12 + third];
      const offsets = light ? [0.5, 2.5] : [0.5, 2, 3];
      offsets.forEach((offset, i) => add("guitar", b + offset, guitarPitches[i]!, light ? 0.7 : 0.6, 74 + i * 4));

      if (difficulty === "chill") {
        const pitches = chorus ? h.triad : [h.root + 12, h.root + 19];
        for (const offset of chorus ? [0, 2] : [0]) addChord(b + offset, pitches, chorus ? 1.5 : 3.15);
      } else if (difficulty === "standard") {
        const pitches = chorus ? h.inversion : h.triad;
        const turn = index % 4 === 3 && section.style !== "intro";
        addChord(b, pitches, 1.5);
        addChord(b + 2, pitches, turn ? 0.7 : 1.5);
        if (turn) {
          add("keys", b + 3, h.root + 19, 0.32, 76);
          add("keys", b + 3.5, h.root + 21, 0.32, 72);
        }
      } else {
        const off = section.style === "intro" ? [0, 2.5] : chorus ? [0, 0.75, 2, 2.75] : [0, 1.5, 3];
        const turn = index % 2 === 1;
        for (let i = 0; i < off.length; i++) {
          const offset = off[i]!;
          const next = off[i + 1] ?? (turn ? 3.5 : 4);
          addChord(b + offset, h.rich, Math.min(1.2, next - offset - 0.2));
        }
        if (turn) {
          add("keys", b + 3.5, h.root + 19, 0.16, 80);
          add("keys", b + 3.75, h.root + 21, 0.16, 76);
        }
      }
    }
  }

  for (const part of parts) part.notes.sort((a, b) => a.time - b.time || a.pitch - b.pitch);
  const duration = bar * 4 * beat;
  const description = {
    chill: "Open fifths and easy triads. One chord per bar, two in the chorus.",
    standard: "Triads, smooth inversions, and short single-note turnarounds.",
    expert: "Seventh chords, left-hand roots, syncopation, and melodic pickups.",
  }[difficulty];

  return {
    id: "open-stage",
    name: "Open Stage",
    subtitle: "Your first chord set. Find the pocket, then lift the chorus.",
    tag: "CHORD ROCK",
    bpm,
    duration,
    original: true,
    parts,
    beats: beats(duration, beat),
    sections,
    harmony,
    arrangement: difficulty,
    arrangementDescription: description,
    key: "C major",
    art: "open",
  };
}

export function makePocketSong(id: 0 | 1 | 2): Song {
  const info = [
    {
      id: "neon-circuit",
      name: "Neon Circuit",
      subtitle: "A driving pocket. A little electricity.",
      bpm: 112,
      bars: 32,
      tag: "SYNTH ROCK",
      art: "circuit" as const,
    },
    {
      id: "after-hours",
      name: "After Hours",
      subtitle: "Room to breathe. Space to find your groove.",
      bpm: 88,
      bars: 24,
      tag: "DOWNTEMPO",
      art: "hours" as const,
    },
    {
      id: "voltage-run",
      name: "Voltage Run",
      subtitle: "Fast hands, tight fills, no holding back.",
      bpm: 144,
      bars: 32,
      tag: "HIGH ENERGY",
      art: "voltage" as const,
    },
  ][id];
  const beat = 60 / info.bpm;
  const parts = emptyParts();
  const add = (type: Instrument, b: number, p: number, d = 0.18, v = 100) => {
    parts.find((x) => x.type === type)!.notes.push({ time: b * beat, duration: d * beat, pitch: p, velocity: v });
  };
  const roots = [0, 4, 3, 1];
  const scale = [60, 62, 64, 67, 69];
  for (let bar = 0; bar < info.bars; bar++) {
    const b = bar * 4;
    const r = roots[Math.floor(bar / 4) % 4]!;
    const root = scale[r]!;
    add("drums", b, 36);
    add("drums", b + 2, 36);
    if (bar % 2 && id !== 1) add("drums", b + 2.5, 36, 0.15, 87);
    add("drums", b + 1, 38);
    add("drums", b + 3, 38);
    for (let h = 0; h < 8; h++) if (id !== 1 || h % 2 === 0) add("drums", b + h / 2, bar >= 16 && bar < 24 ? 51 : 42, 0.12, h % 2 ? 64 : 83);
    if (bar % 8 === 0) add("drums", b, 49, 0.7, 95);
    if (bar % 8 === 7) for (let f = 0; f < 4; f++) add("drums", b + 3 + f * 0.25, [48, 47, 45, 43][f]!, 0.14, 82 + f * 5);
    for (let k = 0; k < 4; k++) add("keys", b + k, scale[(r + [0, 2, 4, 2][k]!) % 5]!, k === 3 ? 0.75 : 0.65, 78);
    if (bar % 4 === 2) {
      add("keys", b, scale[(r + 2) % 5]! + 12, 1.65, 61);
      add("keys", b + 2, scale[(r + 4) % 5]! + 12, 1.6, 63);
    }
    for (let g = 0; g < 4; g++) add("guitar", b + g, scale[(r + (g === 3 ? 2 : 0)) % 5]! - 12, g === 3 ? 0.7 : 0.5, 84);
    if (bar % 4 === 3) add("guitar", b + 3.5, scale[(r + 1) % 5]! - 12, 0.35, 78);
    for (let k = 0; k < (id === 2 ? 4 : 2); k++) add("bass", b + k * (id === 2 ? 1 : 2), root - 24, id === 2 ? 0.8 : 1.7, 95);
  }
  parts.forEach((p) => p.notes.sort((a, b) => a.time - b.time || a.pitch - b.pitch));
  const duration = info.bars * 4 * beat;
  return {
    ...info,
    duration,
    original: true,
    parts,
    beats: beats(duration, beat),
    sections: [
      { time: 0, name: "INTRO" },
      { time: 8 * 4 * beat, name: "IN THE POCKET" },
      { time: 16 * 4 * beat, name: "TURN IT UP" },
      { time: 24 * 4 * beat, name: "BRING IT HOME" },
    ].filter((x) => x.time < duration),
    arrangementDescription: "Difficulty changes timing windows. The arrangement stays the same.",
  };
}

export function makeFirstRehearsal(): Song {
  const bpm = 96;
  const beat = 60 / bpm;
  const bars = 8;
  const parts = emptyParts();
  const add = (type: Instrument, b: number, pitch: number, d = 0.12, velocity = 95) => {
    parts.find((p) => p.type === type)!.notes.push({ time: b * beat, pitch, duration: d * beat, velocity });
  };
  for (let bar = 0; bar < bars; bar++) {
    const b = bar * 4;
    for (let i = 0; i < 4; i++) {
      add("drums", b + i, i % 2 ? 38 : 36);
      add("drums", b + i, 42, 0.1, 64);
    }
    add("keys", b, 64, 1.5);
    add("keys", b + 2, 67, 1.5);
    const riff = bar % 4 === 3 ? [40, 40, 43, 40] : [40, 43, 45, 47];
    if (bar % 4 === 2) {
      add("guitar", b, 40, 1.65);
      add("guitar", b + 2, 43, 1.65);
      add("bass", b, 28, 1.65);
      add("bass", b + 2, 31, 1.65);
    } else {
      for (let i = 0; i < 4; i++) {
        add("guitar", b + i, riff[i]!, 0.68);
        add("bass", b + i, riff[i]! - 12, 0.68);
      }
    }
  }
  parts.forEach((p) => p.notes.sort((a, b) => a.time - b.time || a.pitch - b.pitch));
  const duration = bars * 4 * beat;
  return {
    id: "first-rehearsal",
    name: "First Rehearsal",
    subtitle: "Four instruments. One clean take.",
    tag: "BAND CHECK",
    bpm,
    duration,
    original: true,
    parts,
    beats: beats(duration, beat),
    sections: [
      { time: 0, name: "SINGLE NOTES" },
      { time: 8 * beat, name: "HOLD THE NOTE" },
      { time: 12 * beat, name: "REPEATED PLUCKS" },
      { time: 16 * beat, name: "BRING IT TOGETHER" },
    ],
    arrangementDescription: "A short band check. Difficulty only changes timing windows.",
    art: "rehearsal",
  };
}

export function catalog(difficulty: "chill" | "standard" | "expert"): Song[] {
  return [makeOpenStage(difficulty), makeFirstRehearsal(), makePocketSong(0), makePocketSong(1), makePocketSong(2)];
}

export { LABELS };
