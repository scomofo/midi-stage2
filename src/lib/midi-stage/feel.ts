export type FeelPreset = "calm" | "house" | "arena";

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

export function matchFeelPreset(feel: Omit<Feel, "preset">): FeelPreset | "custom" {
  for (const name of Object.keys(FEEL_PRESETS) as FeelPreset[]) {
    const p = FEEL_PRESETS[name];
    if (
      SLIDERS.every((k) => near(p[k], feel[k])) &&
      p.hitsShake === feel.hitsShake &&
      p.floaters === feel.floaters &&
      p.callouts === feel.callouts
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
      shake: clamp01(Number(parsed.shake)),
      juice: clamp01(Number(parsed.juice)),
      bloom: clamp01(Number(parsed.bloom)),
      punch: clamp01(Number(parsed.punch ?? house.punch)),
      lights: clamp01(Number(parsed.lights ?? house.lights)),
      crowd: clamp01(Number(parsed.crowd ?? house.crowd)),
      trails: clamp01(Number(parsed.trails ?? house.trails)),
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
