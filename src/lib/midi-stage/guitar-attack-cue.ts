export type GuitarAttackCue = {
  kind: "prepare" | "approach" | "window" | "complete";
  beats: number;
  progress: number;
};

/** A presentation cue on the authored song clock, never a scoring decision.
 * Musical beats keep their meaning at every playback speed. The caller passes
 * the active Judge's already scaled late window in song-time seconds. */
export function getGuitarAttackCue(
  targetTime: number | null,
  time: number,
  bpm: number,
  lateWindow: number,
): GuitarAttackCue | null {
  if (!Number.isFinite(time) || !Number.isFinite(bpm) || bpm <= 0
    || !Number.isFinite(lateWindow) || lateWindow < 0
    || (targetTime !== null && !Number.isFinite(targetTime))) return null;
  if (targetTime === null) return { kind: "complete", beats: 0, progress: 1 };

  const distance = targetTime - time;
  // Match the inclusive Judge timing edge, including float tolerance. A stale
  // target must not keep asking the player to hit after it becomes unplayable.
  if (distance < -lateWindow - 1e-8) return null;
  const beat = 60 / bpm;
  const beats = Math.max(0, distance / beat);
  const progress = Math.max(0, Math.min(1, 1 - distance / (4 * beat)));
  // The active scoring window takes precedence even at a very high BPM,
  // where four musical beats can be shorter than the acceptance window.
  const kind = distance <= lateWindow + 1e-8 ? "window"
    : distance > 4 * beat ? "prepare" : "approach";
  return { kind, beats, progress };
}
