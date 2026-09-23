import type {
  Chart,
  ChartNote,
  Difficulty,
  Grade,
  Instrument,
  JudgeResult,
  JudgeStats,
  Lane,
  Player,
  Song,
} from "./types";
import { INSTRUMENTS } from "./types";
import { LABELS } from "./songs";

export const PC = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export const LANE_COLORS = [
  "#e07a7a",
  "#e0b27a",
  "#7ecfc0",
  "#8aa4c4",
  "#d4c4a8",
  "#9bb0a8",
  "#c48a7a",
  "#a8c4b8",
];

export const DRUMS: Lane[] = [
  { name: "KICK", short: "KICK", notes: [35, 36], pitch: 36, pc: 0, color: LANE_COLORS[1]! },
  { name: "SNARE", short: "SNR", notes: [37, 38, 39, 40], pitch: 38, pc: 2, color: LANE_COLORS[0]! },
  { name: "HI-HAT", short: "HAT", notes: [42, 44, 46], pitch: 42, pc: 6, color: LANE_COLORS[2]! },
  { name: "TOMS", short: "TOM", notes: [41, 43, 45, 47, 48, 50], pitch: 45, pc: 9, color: LANE_COLORS[3]! },
  { name: "CRASH", short: "CRSH", notes: [49, 52, 55, 57], pitch: 49, pc: 1, color: LANE_COLORS[4]! },
  { name: "RIDE", short: "RIDE", notes: [51, 53, 59], pitch: 51, pc: 3, color: LANE_COLORS[5]! },
];

export const WINDOWS: Record<Difficulty, [number, number, number]> = {
  chill: [0.07, 0.12, 0.19],
  standard: [0.045, 0.09, 0.14],
  expert: [0.025, 0.055, 0.09],
};

export const KEYS: Record<Instrument, string[]> = {
  drums: ["Space", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ"],
  keys: ["KeyA", "KeyS", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft"],
  guitar: ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash", "Semicolon", "Quote"],
  bass: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"],
};

export function keyLabel(code: string) {
  if (code === "Space") return "SPACE";
  return code
    .replace(/^Key|^Digit/, "")
    .replace("BracketLeft", "[")
    .replace("Comma", ",")
    .replace("Period", ".")
    .replace("Slash", "/")
    .replace("Semicolon", ";")
    .replace("Quote", "'")
    .replace("Minus", "−")
    .replace("Equal", "=");
}

export function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}

export function pc(n: number) {
  return ((n % 12) + 12) % 12;
}

export function noteName(n: number) {
  return PC[pc(n)] + (Math.floor(n / 12) - 1);
}

export function defaultPlayers(): Player[] {
  return INSTRUMENTS.map((type) => ({
    id: type,
    type,
    label: LABELS[type],
    enabled: type === "keys",
    source: type,
  }));
}

export function lowerBound<T>(a: T[], t: number, field: keyof T = "time" as keyof T) {
  let l = 0;
  let r = a.length;
  while (l < r) {
    const m = (l + r) >>> 1;
    if ((a[m]![field] as number) < t) l = m + 1;
    else r = m;
  }
  return l;
}

function sourceFor(song: Song, player: Player) {
  return song.parts.find((p) => p.id === player.source) || song.parts.find((p) => p.type === player.type) || song.parts[0]!;
}

export function lanesFor(song: Song, player: Player): Lane[] {
  if (player.type === "drums") return DRUMS.map((d) => ({ ...d, notes: [...(d.notes || [])] }));
  const part = sourceFor(song, player);
  const pitches = [...new Set(part.notes.map((n) => pc(n.pitch)))].sort((a, b) => a - b);
  return pitches.map((p, i) => {
    const all = part.notes.filter((n) => pc(n.pitch) === p).map((n) => n.pitch).sort((a, b) => a - b);
    const pitch = all[Math.floor(all.length / 2)] || 60 + p;
    return { name: PC[p]!, short: PC[p]!, pitch, pc: p, color: LANE_COLORS[i % LANE_COLORS.length]! };
  });
}

export function laneForPitch(pitch: number, player: Player, lanes: Lane[]) {
  if (player.type === "drums") return lanes.findIndex((l) => l.notes?.includes(pitch));
  return lanes.findIndex((l) => l.pc === pc(pitch));
}

const CHORD_TEMPLATES = [
  { suffix: "maj7", ints: [0, 4, 7, 11] },
  { suffix: "7", ints: [0, 4, 7, 10] },
  { suffix: "m7", ints: [0, 3, 7, 10] },
  { suffix: "", ints: [0, 4, 7] },
  { suffix: "m", ints: [0, 3, 7] },
  { suffix: "dim", ints: [0, 3, 6] },
  { suffix: "aug", ints: [0, 4, 8] },
  { suffix: "sus2", ints: [0, 2, 7] },
  { suffix: "sus4", ints: [0, 5, 7] },
  { suffix: "5", ints: [0, 7] },
];

function chordName(pitches: number[]) {
  const set = [...new Set(pitches.map(pc))].sort((a, b) => a - b);
  if (set.length < 2 || set.length > 4) return null;
  for (let root = 0; root < 12; root++) {
    for (const t of CHORD_TEMPLATES) {
      const want = [...new Set(t.ints.map((i) => (root + i) % 12))].sort((a, b) => a - b);
      if (want.length === set.length && want.every((p, i) => p === set[i])) return `${PC[root]}${t.suffix}`;
    }
  }
  return null;
}

export function makeChart(song: Song, player: Player, start = 0, end = song.duration): Chart {
  const lanes = lanesFor(song, player);
  const part = sourceFor(song, player);
  const notes: ChartNote[] = part.notes
    .filter((n) => n.time >= start - 1e-6 && n.time < end - 1e-6)
    .map((n, id): ChartNote => ({
      ...n,
      id,
      lane: laneForPitch(n.pitch, player, lanes),
      duration: Math.min(n.duration, end - n.time),
      state: 0,
      hold: null,
    }))
    .filter((n) => n.lane >= 0);

  if (player.type === "keys" || player.type === "guitar") {
    const grouped = new Map<number, ChartNote[]>();
    for (const n of notes) {
      const key = Math.round(n.time * 1000);
      const list = grouped.get(key) || [];
      list.push(n);
      grouped.set(key, list);
    }
    for (const group of grouped.values()) {
      if (group.length < 2) continue;
      const pitches = group.map((n) => n.pitch);
      const name = chordName(pitches);
      if (!name) continue;
      const laneIds = [...new Set(group.map((n) => n.lane))];
      const roman = song.harmony?.find((h) => Math.abs(h.time - group[0]!.time) < 0.08)?.roman;
      for (const n of group) {
        n.chord = true;
        n.name = name;
        n.roman = roman;
        n.lanes = laneIds;
        n.pitches = pitches;
      }
    }
  }

  return { lanes, notes };
}

export class Judge {
  notes: ChartNote[];
  lanes: Lane[];
  windows: number[];
  speed: number;
  drums: boolean;
  onJudge: (r: JudgeResult) => void;
  cursor = 0;
  held = new Map<string, Set<ChartNote>>();
  activeHolds = new Set<ChartNote>();
  stats: JudgeStats = {
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    extra: 0,
    holdBreaks: 0,
    holds: 0,
    weight: 0,
    offsets: [],
  };
  demoCursor = 0;
  demoReleases: { token: string; at: number }[] = [];

  constructor(chart: Chart, opts: { difficulty: Difficulty; speed: number; drums: boolean; onJudge: (r: JudgeResult) => void }) {
    this.notes = chart.notes.map((n) => ({ ...n, state: 0, hold: null }));
    this.lanes = chart.lanes;
    this.windows = WINDOWS[opts.difficulty].map((x) => x * opts.speed);
    this.speed = opts.speed;
    this.drums = opts.drums;
    this.onJudge = opts.onJudge;
  }

  get multiplier() {
    return Math.min(4, 1 + Math.floor(this.stats.combo / 10));
  }

  get accuracy() {
    const s = this.stats;
    const n = s.perfect + s.great + s.good + s.miss + s.extra;
    return n ? (100 * s.weight) / n : 100;
  }

  tick(t: number) {
    while (this.cursor < this.notes.length && this.notes[this.cursor]!.time < t - this.windows[2]! - 1e-8) {
      const n = this.notes[this.cursor++]!;
      if (!n.state) {
        n.state = 2;
        this.stats.miss++;
        this.stats.combo = 0;
        this.onJudge({ grade: "miss", note: n, delta: 0 });
      }
    }
    for (const n of [...this.activeHolds]) {
      if (t >= n.time + n.duration - 0.065 * this.speed) this.finishHold(n, true);
    }
  }

  hit(t: number, lane: number, token = "keyboard") {
    this.tick(t);
    let closest: ChartNote | null = null;
    let best = Infinity;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.time > t + this.windows[2]! + 1e-8) break;
      if (n.state || n.lane !== lane) continue;
      const d = Math.abs(n.time - t);
      if (d <= this.windows[2]! + 1e-8 && d < best) {
        closest = n;
        best = d;
      }
    }
    if (!closest) {
      this.stats.extra++;
      this.stats.combo = 0;
      this.onJudge({ grade: "extra", lane, delta: 0 });
      return null;
    }
    const grade: Grade = best <= this.windows[0]! + 1e-8 ? "perfect" : best <= this.windows[1]! + 1e-8 ? "great" : "good";
    const weight = { perfect: 1, great: 0.75, good: 0.4 }[grade];
    closest.state = 1;
    closest.hitAt = t;
    closest.grade = grade;
    this.stats[grade]++;
    this.stats.weight += weight;
    this.stats.combo++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
    const gained = Math.round(100 * weight * this.multiplier);
    this.stats.score += gained;
    this.stats.offsets.push(((t - closest.time) / this.speed) * 1000);
    // Unconsumed per-hit timing data: keep only the most recent entries.
    if (this.stats.offsets.length > 200) this.stats.offsets.splice(0, this.stats.offsets.length - 200);
    if (!this.drums && closest.duration / this.speed >= 0.35) {
      closest.hold = "held";
      closest.token = token;
      closest.holdMultiplier = this.multiplier;
      this.activeHolds.add(closest);
      if (!this.held.has(token)) this.held.set(token, new Set());
      this.held.get(token)!.add(closest);
    }
    this.onJudge({ grade, note: closest, delta: ((t - closest.time) / this.speed) * 1000, score: gained });
    return closest;
  }

  finishHold(n: ChartNote, success: boolean) {
    if (n.hold !== "held") return;
    n.hold = success ? "complete" : "broken";
    this.activeHolds.delete(n);
    const set = this.held.get(n.token || "");
    if (set) {
      set.delete(n);
      if (!set.size) this.held.delete(n.token || "");
    }
    if (success) {
      this.stats.holds++;
      this.stats.score += 50 * (n.holdMultiplier || 1);
    } else {
      this.stats.holdBreaks++;
      this.stats.combo = 0;
      this.onJudge({ grade: "release", note: n, delta: 0 });
    }
  }

  release(token: string, t: number) {
    for (const n of [...(this.held.get(token) || [])]) {
      this.finishHold(n, t >= n.time + n.duration - 0.09 * this.speed);
    }
  }

  finish(t: number) {
    this.tick(t + this.windows[2]! + 0.001);
    return { ...this.stats, accuracy: this.accuracy, total: this.notes.length };
  }

  advanceDemo(t: number, playerId: Instrument) {
    const releaseThrough = (at: number) => {
      for (let k = this.demoReleases.length - 1; k >= 0; k--) {
        if (this.demoReleases[k]!.at <= at) {
          const r = this.demoReleases.splice(k, 1)[0]!;
          this.release(r.token, r.at);
        }
      }
    };
    while (this.demoCursor < this.notes.length && this.notes[this.demoCursor]!.time <= t) {
      const n = this.notes[this.demoCursor++]!;
      releaseThrough(n.time);
      const token = `demo:${playerId}:${n.id}`;
      this.hit(n.time, n.lane, token);
      this.demoReleases.push({ token, at: n.time + n.duration });
    }
    releaseThrough(t);
  }
}

export function formatTime(t: number) {
  t = Math.max(0, Math.floor(t));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function expectedPitches(song: Song, t: number, player: Player): number[] {
  const part = sourceFor(song, player);
  const window = 0.12;
  return part.notes.filter((n) => t >= n.time - 0.04 && t <= n.time + Math.max(n.duration, window)).map((n) => n.pitch);
}

export function approachingPitches(song: Song, t: number, player: Player, look = 0.55): number[] {
  const part = sourceFor(song, player);
  return part.notes.filter((n) => n.time > t + 0.04 && n.time <= t + look).map((n) => n.pitch);
}

export function currentHarmony(song: Song, t: number) {
  if (!song.harmony?.length) return null;
  let found: Harmony | null = null;
  for (const h of song.harmony) {
    if (h.time <= t) found = h;
    else break;
  }
  return found;
}

type Harmony = NonNullable<Song["harmony"]>[number];

export function stars(accuracy: number) {
  if (accuracy >= 97) return 5;
  if (accuracy >= 90) return 4;
  if (accuracy >= 75) return 3;
  if (accuracy >= 55) return 2;
  if (accuracy >= 30) return 1;
  return 0;
}

export { LABELS };
