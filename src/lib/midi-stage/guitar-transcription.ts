import type { AudioAnalysis, AudioImportProgress, SongAudioSamples } from "./audio-import.ts";
import { keyboardMono } from "./keyboard-transcription.ts";
import { makeGuitarDraft } from "./guitar-draft.ts";
import { cleanGuitarEvents } from "./guitar-event-cleanup.ts";
import { verifyGuitarAttacks } from "./guitar-attack-verification.ts";
import { recoverGuitarShortNotes } from "./guitar-short-note-recovery.ts";
import { transcribePitchedEvents } from "./pitched-transcription.ts";

function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Song import was cancelled.", "AbortError");
}

export async function transcribeGuitarAudio(
  buffer: SongAudioSamples,
  filename: string,
  fingerprint: string,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (progress: AudioImportProgress) => void } = {},
): Promise<AudioAnalysis> {
  onProgress?.({ phase: "analyzing", progress: 0 });
  const samples = await keyboardMono(buffer, signal);
  cancelled(signal);

  const events = await transcribePitchedEvents(samples, { signal, onProgress, failureLabel: "Guitar transcription" });

  cancelled(signal);
  const verified = await verifyGuitarAttacks(cleanGuitarEvents(events), buffer, signal);
  const recovered = await recoverGuitarShortNotes(verified, buffer, signal);
  const result = makeGuitarDraft(recovered, buffer.duration, filename, fingerprint);
  const noteKeys = new Set(result.chart.parts.find((part) => part.type === "guitar")!.notes.map((note) => `${note.pitch}:${Math.round(note.time * 1e6)}`));
  const brief = recovered.filter((event) => event.shortAttackVerified && noteKeys.has(`${event.pitchMidi}:${Math.round(event.startTimeSeconds * 1e6)}`)).length;
  if (brief) result.warnings.push(`${brief} brief guitar ${brief === 1 ? "note was" : "notes were"} recovered from audio attacks. Check their estimated pitches and lengths in the review studio.`);
  onProgress?.({ phase: "analyzing", progress: 1 });
  cancelled(signal);
  return result;
}
