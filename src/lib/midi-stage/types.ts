export const INSTRUMENTS = ["drums", "keys", "guitar", "bass"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export type Grade = "perfect" | "great" | "good" | "miss" | "extra" | "release";

export type Note = {
  time: number;
  duration: number;
  pitch: number;
  velocity: number;
};

export type Part = {
  id: string;
  name: string;
  type: Instrument;
  channel: number;
  notes: Note[];
};

export type Harmony = {
  time: number;
  duration: number;
  name: string;
  roman: string;
};

export type Song = {
  id: string;
  name: string;
  subtitle: string;
  tag: string;
  bpm: number;
  duration: number;
  original: boolean;
  parts: Part[];
  beats: { time: number; bar: boolean }[];
  sections: { time: number; name: string }[];
  harmony?: Harmony[];
  arrangement?: string;
  arrangementDescription?: string;
  key?: string;
  art: "open" | "circuit" | "hours" | "voltage" | "rehearsal";
};

export type Lane = {
  name: string;
  short: string;
  pitch: number;
  pc: number;
  color: string;
  notes?: number[];
  any?: boolean;
};

export type ChartNote = Note & {
  id: number;
  lane: number;
  chord?: boolean;
  name?: string;
  roman?: string;
  lanes?: number[];
  pitches?: number[];
  state: 0 | 1 | 2;
  hold: "held" | "complete" | "broken" | "paused" | null;
  grade?: Grade;
  hitAt?: number;
  token?: string;
  holdMultiplier?: number;
};

export type Chart = {
  lanes: Lane[];
  notes: ChartNote[];
};

export type Player = {
  id: Instrument;
  type: Instrument;
  label: string;
  enabled: boolean;
  source: Instrument;
};

export type JudgeStats = {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  extra: number;
  holdBreaks: number;
  holds: number;
  weight: number;
  offsets: number[];
};

export type JudgeResult = {
  grade: Grade;
  note?: ChartNote;
  lane?: number;
  delta: number;
  score?: number;
};

export type Status = "ready" | "starting" | "playing" | "paused";

export type Difficulty = "chill" | "standard" | "expert";

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: "spark" | "ring" | "burst" | "float" | "shock" | "ember";
  player?: Instrument;
  lane?: number;
  text?: string;
};

export type Flash = {
  player: Instrument;
  lane: number;
  until: number;
  kind?: "hit" | "press" | "miss";
};

export type Callout = {
  player: Instrument;
  grade: Grade;
  delta: number;
  until: number;
  text: string;
};
