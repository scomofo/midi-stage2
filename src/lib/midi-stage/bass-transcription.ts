import type { AudioAnalysis, AudioImportProgress, SongAudioSamples } from "./audio-import.ts";
import { keyboardMono } from "./keyboard-transcription.ts";
import { makeBassDraft } from "./bass-draft.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";

function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Song import was cancelled.", "AbortError");
}

export async function transcribeBassAudio(
  buffer: SongAudioSamples,
  filename: string,
  fingerprint: string,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (progress: AudioImportProgress) => void } = {},
): Promise<AudioAnalysis> {
  onProgress?.({ phase: "analyzing", progress: 0 });
  const samples = await keyboardMono(buffer, signal);
  cancelled(signal);

  const events = await new Promise<KeyboardEvent[]>((resolve, reject) => {
    const worker = new Worker(new URL("./keyboard-transcription.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (error?: Error, result?: KeyboardEvent[]) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(new DOMException("Song import was cancelled.", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });

    worker.onerror = () => finish(new Error("The bass transcriber could not start. Retry in a browser with worker support."));
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.({ phase: data.phase, progress: data.progress });
      else if (data.type === "complete") finish(undefined, data.events);
      else if (data.type === "error") finish(new Error(data.phase === "model"
        ? "The bass pitch model could not load. Retry the import."
        : "Bass transcription failed. Try a shorter, cleaner isolated bass stem."));
    };

    try {
      worker.postMessage(
        { samples, modelUrl: new URL("/models/basic-pitch/model.json", location.href).href },
        [samples.buffer],
      );
    } catch {
      finish(new Error("The bass source could not be sent to the transcriber. Retry the import."));
    }
    if (signal?.aborted) abort();
  });

  cancelled(signal);
  const result = makeBassDraft(events, buffer.duration, filename, fingerprint);
  onProgress?.({ phase: "analyzing", progress: 1 });
  cancelled(signal);
  return result;
}
