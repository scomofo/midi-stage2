import type { Player, Song } from "./types";

export function sourceForSafe(song: Song, player: Player) {
  return song.parts.find((p) => p.id === player.source) || song.parts.find((p) => p.type === player.type) || song.parts[0]!;
}
