export type FeelPreset = "calm" | "house" | "arena";
export type GoboPattern = "open" | "breakup" | "window" | "blinds" | "dots";
export type GoboMotion = "still" | "drift" | "spin" | "pulse" | "sweep";
export type HeadCue = "park" | "fan" | "circle" | "cross" | "chase";

export const GOBO_PATTERNS: GoboPattern[] = ["open", "breakup", "window", "blinds", "dots"];
export const GOBO_MOTIONS: GoboMotion[] = ["still", "drift", "spin", "pulse", "sweep"];
export const HEAD_CUES: HeadCue[] = ["park", "fan", "circle", "cross", "chase"];

export const GOBO_COPY: Record<GoboPattern, { label: string; line: string }> = {
  open: { label: "Open", line: "Clean pool." },
  breakup: { label: "Breakup", line: "Leaf and air." },
  window: { label: "Window", line: "Panes on the apron." },
  blinds: { label: "Blinds", line: "Venetian cut." },
  dots: { label: "Dots", line: "Pinholes in the wash." },
};

export const GOBO_MOTION_COPY: Record<GoboMotion, { label: string; line: string }> = {
  still: { label: "Still", line: "The wheel holds." },
  drift: { label: "Drift", line: "Slow air through the cut." },
  spin: { label: "Spin", line: "Rotator on." },
  pulse: { label: "Pulse", line: "Iris on the beat." },
  sweep: { label: "Sweep", line: "Shuttle across the pool." },
};

export const HEAD_COPY: Record<HeadCue, { label: string; line: string }> = {
  park: { label: "Park", line: "Fixed focus on the apron." },
  fan: { label: "Fan", line: "Open and close the wash." },
  circle: { label: "Circle", line: "Pan around the floor." },
  cross: { label: "Cross", line: "Beams trade sides." },
  chase: { label: "Chase", line: "One look, then the next." },
};

export type Feel = {
  preset: FeelPreset | "custom";
  shake: number;
  hitsShake: boolean;
  juice: number;
  bloom: number;
  punch: number;
  lights: number;
  crowd: number;
  trails: number;
  gobo: GoboPattern;
  goboMotion: GoboMotion;
  heads: HeadCue;
  floaters: boolean;
  callouts: boolean;
};

export const FEEL_PRESETS: Record<FeelPreset, Omit<Feel, "preset">> = {
  calm: {
    shake: 0,
    hitsShake: false,
    juice: 0.18,
    bloom: 0.22,
    punch: 0,
    lights: 0.28,
    crowd: 0.12,
    trails: 0.25,
    gobo: "open",
    goboMotion: "still",
    heads: "park",
    floaters: false,
    callouts: true,
  },
  house: {
    shake: 0.4,
    hitsShake: false,
    juice: 0.85,
    bloom: 0.7,
    punch: 0.55,
    lights: 0.78,
    crowd: 0.7,
    trails: 0.8,
    gobo: "breakup",
    goboMotion: "drift",
    heads: "fan",
    floaters: true,
    callouts: true,
  },
  arena: {
    shake: 0.75,
    hitsShake: true,
    juice: 1,
    bloom: 1,
    punch: 1,
    lights: 1,
    crowd: 1,
    trails: 1,
    gobo: "window",
    goboMotion: "pulse",
    heads: "chase",
    floaters: true,
    callouts: true,
  },
};

export const FEEL_COPY: Record<FeelPreset, { label: string; line: string }> = {
  calm: { label: "Calm", line: "Still house. Notes only." },
  house: { label: "House", line: "Bloom, no jolt on perfects." },
  arena: { label: "Arena", line: "Sparks, punch, the room moves." },
};

const KEY = "midi-stage-feel";
const SLIDERS = ["shake", "juice", "bloom", "punch", "lights", "crowd", "trails"] as const;

function near(a: number, b: number) {
  return Math.abs(a - b) < 0.03;
}

export function parseGobo(value: unknown, fallback: GoboPattern = "breakup"): GoboPattern {
  return GOBO_PATTERNS.includes(value as GoboPattern) ? (value as GoboPattern) : fallback;
}

export function parseGoboMotion(value: unknown, fallback: GoboMotion = "drift"): GoboMotion {
  return GOBO_MOTIONS.includes(value as GoboMotion) ? (value as GoboMotion) : fallback;
}

export function parseHeadCue(value: unknown, fallback: HeadCue = "fan"): HeadCue {
  return HEAD_CUES.includes(value as HeadCue) ? (value as HeadCue) : fallback;
}

export function matchFeelPreset(feel: Omit<Feel, "preset">): FeelPreset | "custom" {
  for (const name of Object.keys(FEEL_PRESETS) as FeelPreset[]) {
    const p = FEEL_PRESETS[name];
    if (
      SLIDERS.every((k) => near(p[k], feel[k])) &&
      p.hitsShake === feel.hitsShake &&
      p.floaters === feel.floaters &&
      p.callouts === feel.callouts &&
      p.gobo === feel.gobo &&
      p.goboMotion === feel.goboMotion &&
      p.heads === feel.heads
    ) {
      return name;
    }
  }
  return "custom";
}

export function withPreset(name: FeelPreset): Feel {
  return { preset: name, ...FEEL_PRESETS[name] };
}

export function loadFeel(): Feel {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return withPreset("house");
    const parsed = JSON.parse(raw) as Partial<Feel>;
    const house = FEEL_PRESETS.house;
    const next: Feel = {
      ...withPreset("house"),
      ...parsed,
      shake: clamp01(Number(parsed.shake ?? house.shake)),
      juice: clamp01(Number(parsed.juice ?? house.juice)),
      bloom: clamp01(Number(parsed.bloom ?? house.bloom)),
      punch: clamp01(Number(parsed.punch ?? house.punch)),
      lights: clamp01(Number(parsed.lights ?? house.lights)),
      crowd: clamp01(Number(parsed.crowd ?? house.crowd)),
      trails: clamp01(Number(parsed.trails ?? house.trails)),
      gobo: parseGobo(parsed.gobo, house.gobo),
      goboMotion: parseGoboMotion(parsed.goboMotion, house.goboMotion),
      heads: parseHeadCue(parsed.heads, house.heads),
      hitsShake: Boolean(parsed.hitsShake),
      floaters: parsed.floaters !== false,
      callouts: parsed.callouts !== false,
    };
    next.preset = matchFeelPreset(next);
    return next;
  } catch {
    return withPreset("house");
  }
}

export function saveFeel(feel: Feel) {
  try {
    localStorage.setItem(KEY, JSON.stringify(feel));
  } catch {
    /* ignore */
  }
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}
