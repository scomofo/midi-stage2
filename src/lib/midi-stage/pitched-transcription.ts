import type { AudioImportProgress } from "./audio-import.ts";
import type { KeyboardEvent } from "./keyboard-draft.ts";

export async function transcribePitchedEvents(
  samples: Float32Array,
  {
    signal,
    onProgress,
    failureLabel = "Pitch transcription",
  }: {
    signal?: AbortSignal;
    onProgress?: (progress: AudioImportProgress) => void;
    failureLabel?: string;
  } = {},
): Promise<KeyboardEvent[]> {
  return new Promise<KeyboardEvent[]>((resolve, reject) => {
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
    worker.onerror = () => finish(new Error(`${failureLabel} could not start. Retry in a browser with worker support.`));
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.({ phase: data.phase, progress: data.progress });
      else if (data.type === "complete") finish(undefined, data.events);
      else if (data.type === "error") finish(new Error(data.phase === "model"
        ? "The local pitch model could not load. Retry the import."
        : `${failureLabel} failed. Try a shorter, cleaner isolated stem.`));
    };
    try {
      worker.postMessage(
        { samples, modelUrl: new URL("/models/basic-pitch/model.json", location.href).href },
        [samples.buffer],
      );
    } catch {
      finish(new Error(`${failureLabel} could not receive the audio samples. Retry the import.`));
    }
    if (signal?.aborted) abort();
  });
}
