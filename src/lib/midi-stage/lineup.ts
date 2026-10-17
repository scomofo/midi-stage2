import type { Player, Song } from "./types.ts";

export function isGuitarOnlySong(song: Song): boolean {
  // Arcade and built-in guitar arrangements retain their dedicated controls.
  // Imported six-string mixed parts are selectable independently.
  return Boolean(song.guitarMode && (song.guitarMode === "fret-strum" || song.original || song.parts.every((part) => part.type === "guitar" || !part.notes.length)));
}

export function hasScoredGuitar(song: Song, players: readonly Player[]): boolean {
  return song.guitarMode === "strings" && players.some((player) => player.id === "guitar" && player.enabled);
}

/** Guitar positions describe that part; they do not turn the whole band into a guitar solo. */
export function lineupForSong(song: Song, current: Player[]): Player[] {
  if (isGuitarOnlySong(song)) return current.map((player) => ({ ...player, enabled: player.id === "guitar" }));
  if (song.original) return current;
  const available = new Set(song.parts.filter((part) => part.notes.length > 0).map((part) => part.type));
  const next = current.map((player) => ({ ...player, enabled: player.enabled && available.has(player.type) }));
  if (!next.some((player) => player.enabled)) {
    const preferred = next.find((player) => player.id === "keys" && available.has(player.type))
      ?? next.find((player) => available.has(player.type));
    if (preferred) preferred.enabled = true;
  }
  return next;
}
