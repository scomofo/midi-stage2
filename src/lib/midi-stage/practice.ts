import type { Song } from "./types";

export type PracticeSection = {
  id: string;
  name: string;
  start: number;
  end: number;
};

/** Prefer real chart sections; a single import label is not a musical section map. */
export function practiceSections(song: Song): PracticeSection[] {
  if (!Number.isFinite(song.duration) || song.duration <= 0) return [];
  const markers = song.sections
    .filter((section) => Number.isFinite(section.time) && section.time >= 0 && section.time < song.duration && section.name.trim())
    .map((section) => ({ time: section.time, name: section.name.trim() }))
    .sort((a, b) => a.time - b.time)
    .filter((section, index, all) => index === 0 || section.time !== all[index - 1]!.time);
  if (markers.length > 1) {
    if (markers[0]!.time > 0) markers.unshift({ time: 0, name: "Intro" });
    return markers.map((marker, index) => ({
      id: `section:${marker.time}`,
      name: marker.name,
      start: marker.time,
      end: markers[index + 1]?.time ?? song.duration,
    }));
  }

  // Keep the lead-in with the first passage. Authored grids preserve their
  // first-beat offset and tempo spacing instead of rounding to wall-clock time.
  const beats = song.beats
    .filter((beat) => Number.isFinite(beat.time) && beat.time >= 0 && beat.time < song.duration)
    .map((beat) => beat.time)
    .sort((a, b) => a - b)
    .filter((time, index, all) => index === 0 || time !== all[index - 1]);
  const starts = [0];
  if (beats.length > 1) {
    for (let index = 32; index < beats.length; index += 32) starts.push(beats[index]!);
  } else {
    const passage = 32 * 60 / (Number.isFinite(song.bpm) && song.bpm > 0 ? song.bpm : 120);
    for (let time = passage; time < song.duration; time += passage) starts.push(time);
  }
  return starts.map((start, index) => ({
    id: `passage:${start}`,
    name: `Passage ${index + 1}`,
    start,
    end: starts[index + 1] ?? song.duration,
  }));
}

/** An isolated chart on a zero-based clock, still referring to the full backing
 * recording. Only note onsets inside [start, end) are playable; an earlier hold
 * never becomes a new note. Context beats/harmony may have a negative time.
 */
export function practiceSong(song: Song, section: PracticeSection): Song {
  if (!Number.isFinite(song.duration) || song.duration <= 0 || !Number.isFinite(section.start) || !Number.isFinite(section.end)) {
    throw new RangeError("Choose a section with finite start and end times.");
  }
  const start = Math.max(0, section.start);
  const end = Math.min(song.duration, section.end);
  if (end <= start) throw new RangeError("Choose a section that overlaps the song.");

  // Include adjacent beats only as timing context. The audio scheduler filters
  // them to the play range, while the strum guide can retain the original phase.
  const beats = song.beats.filter((beat) => Number.isFinite(beat.time)).slice().sort((a, b) => a.time - b.time);
  let preceding = -1;
  for (let index = 0; index < beats.length && beats[index]!.time < start; index++) preceding = index;
  const following = beats.findIndex((beat) => beat.time >= end);
  const windowBeats = beats.slice(Math.max(0, preceding), following < 0 ? undefined : following + 1);
  const tempoMap = song.tempoMap?.filter((point) => point.time < end).map((point) => ({ ...point, time: point.time - start }));

  return {
    ...song,
    duration: end - start,
    audioOffset: (song.audioOffset ?? 0) - start,
    parts: song.parts.map((part) => ({
      ...part,
      notes: part.notes
        .filter((note) => note.time >= start && note.time < end)
        .map((note) => ({ ...note, time: note.time - start, duration: Math.max(0, Math.min(note.duration, end - note.time)) })),
    })),
    beats: windowBeats.map((beat) => ({ ...beat, time: beat.time - start })),
    sections: [{ time: 0, name: section.name }],
    harmony: song.harmony
      ?.filter((harmony) => harmony.time < end && harmony.time + harmony.duration > start)
      .map((harmony) => ({ ...harmony, time: harmony.time - start, duration: Math.min(harmony.duration, end - harmony.time) })),
    ...(tempoMap ? { tempoMap } : {}),
  };
}
