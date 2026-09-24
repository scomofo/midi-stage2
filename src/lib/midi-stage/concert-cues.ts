import type { Song } from "./types";

export type MusicEnergy = { level: number; bass: number };
export type ConcertCue = {
  clock: number;
  beatPosition: number;
  pulse: number;
  drive: number;
  primary: string;
  secondary: string;
};

const LOOKS = [
  ["#8fd4c4", "#c4a882"],
  ["#8aa4c4", "#d4b08a"],
  ["#d4b08a", "#8fd4c4"],
] as const;

function preceding<T extends { time: number }>(items: readonly T[], time: number) {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid]!.time <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

function blend(from: string, to: string, amount: number) {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
}

/** Pure song-time choreography: seeking/resuming reproduces the same light cue.
 * Quiet modes have no beat, section or audio animation. Section looks follow
 * existing chart markers; this does not infer a chorus from an audio recording.
 */
export function concertCue(song: Pick<Song, "bpm" | "beats" | "sections">, time: number, quiet: boolean, music?: MusicEnergy): ConcertCue {
  const rest: ConcertCue = { clock: 0, beatPosition: 0, pulse: 0, drive: 0, primary: LOOKS[0][0], secondary: LOOKS[0][1] };
  if (quiet || time < 0) return rest;
  const index = preceding(song.beats, time);
  const beat = song.beats[index];
  const next = song.beats[index + 1];
  const duration = beat && next && next.time > beat.time ? next.time - beat.time : 60 / song.bpm;
  const phase = beat ? Math.max(0, (time - beat.time) / duration) : 0;
  const pulse = beat && phase < 1 ? Math.exp(-phase * 7) * (beat.bar ? 1 : 0.62) : 0;
  const section = Math.max(0, preceding(song.sections, time));
  const look = LOOKS[section % LOOKS.length]!;
  const previous = LOOKS[Math.max(0, section - 1) % LOOKS.length]!;
  const progress = Math.min(1, Math.max(0, (time - (song.sections[section]?.time ?? 0)) / Math.max(duration * 2, 0.5)));
  const fade = progress * progress * (3 - 2 * progress);
  const safe = (n: number) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  return {
    clock: time,
    beatPosition: index < 0 ? 0 : index + phase,
    pulse,
    drive: Math.min(1, pulse * 0.25 + safe(music?.bass ?? 0) * 0.45 + safe(music?.level ?? 0) * 0.3),
    primary: blend(previous[0], look[0], fade),
    secondary: blend(previous[1], look[1], fade),
  };
}
