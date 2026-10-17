import { validateSharedChart, type SharedChart, type SharedNote } from "./chart-format.ts";

export type AudioReviewInstrument = "drums" | "keys" | "guitar" | "bass";

/** Replace one part on the recording clock. Other parts and timeline markers stay intact. */
export function withReviewedAudioPart(source: SharedChart, instrument: AudioReviewInstrument, notes: SharedNote[], bpm: number): SharedChart {
  const previous = source.parts.find((part) => part.type === instrument)!.notes;
  const unchanged = previous.length === notes.length && notes.every((note, index) => {
    const original = previous[index]!;
    return note.time === original.time && note.duration === original.duration && note.pitch === original.pitch;
  });
  const parts = source.parts.map((part) => part.type === instrument ? { ...part, notes } : part);
  return validateSharedChart({
    ...source,
    bpm,
    firstBeat: Math.min(...parts.flatMap((part) => part.notes.map((note) => note.time))),
    tempoMap: bpm === source.bpm ? source.tempoMap : [{ time: 0, bpm }],
    parts,
    chordHighways: !unchanged && (instrument === "keys" || instrument === "guitar")
      ? { ...source.chordHighways, [instrument]: [] } : source.chordHighways,
  });
}

/** Full-band restore is local to a part and retains the current shared count-in. */
export function restoreAudioPart(source: SharedChart, original: SharedChart, instrument: AudioReviewInstrument): SharedChart {
  const notes = original.parts.find((part) => part.type === instrument)!.notes;
  const restored = withReviewedAudioPart(source, instrument, notes, source.bpm);
  return validateSharedChart({
    ...restored,
    chordHighways: instrument === "keys" || instrument === "guitar"
      ? { ...restored.chordHighways, [instrument]: original.chordHighways[instrument] } : restored.chordHighways,
  });
}
