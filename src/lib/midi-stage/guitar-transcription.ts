import type { AudioAnalysis, AudioImportProgress, SongAudioSamples } from "./audio-import.ts";
import { keyboardMono } from "./keyboard-transcription.ts";
import { makeGuitarDraft } from "./guitar-draft.ts";
import { cleanGuitarEvents } from "./guitar-event-cleanup.ts";
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
  const result = makeGuitarDraft(cleanGuitarEvents(events), buffer.duration, filename, fingerprint);
  onProgress?.({ phase: "analyzing", progress: 1 });
  cancelled(signal);
  return result;
}
