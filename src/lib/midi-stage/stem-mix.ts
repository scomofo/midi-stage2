import { INSTRUMENTS, type Instrument } from "./types.ts";

export type StemChannel = { level: number; muted: boolean; solo: boolean };
export type StemMix = { mode: "original" | "stems"; channels: Record<Instrument, StemChannel> };
export type SongMixes = Record<string, StemMix>;
export const STEM_MIX_KEY = "midi-stage/stem-mixes";

export function defaultStemMix(): StemMix {
  return { mode: "original", channels: Object.fromEntries(INSTRUMENTS.map(kind => [kind, { level: 100, muted: false, solo: false }])) as StemMix["channels"] };
}

export function parseStemMix(value: unknown): StemMix {
  const mix = defaultStemMix();
  if (!value || typeof value !== "object") return mix;
  const input = value as Partial<StemMix>;
  if (input.mode === "stems") mix.mode = "stems";
  for (const kind of INSTRUMENTS) {
    const channel = input.channels?.[kind];
    if (!channel || typeof channel !== "object") continue;
    mix.channels[kind] = {
      level: typeof channel.level === "number" && Number.isFinite(channel.level) ? Math.max(0, Math.min(100, channel.level)) : 100,
      muted: channel.muted === true,
      solo: channel.solo === true,
    };
  }
  return mix;
}

/** Solo only considers tracks that really exist; mute takes precedence. */
export function stemGain(mix: StemMix, kind: Instrument, available: readonly Instrument[]): number {
  const channel = mix.channels[kind];
  const soloing = available.some(track => mix.channels[track].solo);
  return channel.muted || (soloing && !channel.solo) ? 0 : (channel.level / 100) ** 2;
}

export function loadStemMixes(ids: readonly string[], storage?: Pick<Storage, "getItem">): SongMixes {
  try {
    const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    const raw = source?.getItem(STEM_MIX_KEY);
    if (!raw || raw.length > 32000) return {};
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !data.songs || typeof data.songs !== "object") return {};
    return Object.fromEntries(ids.filter(id => Object.hasOwn(data.songs, id)).map(id => [id, parseStemMix(data.songs[id])]));
  } catch { return {}; }
}

export function saveStemMixes(mixes: SongMixes, storage?: Pick<Storage, "setItem">): boolean {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!target) return false;
    const songs = Object.fromEntries(Object.entries(mixes).slice(0, 12).map(([id, mix]) => [id, parseStemMix(mix)]));
    target.setItem(STEM_MIX_KEY, JSON.stringify({ version: 1, songs }));
    return true;
  } catch { return false; }
}
