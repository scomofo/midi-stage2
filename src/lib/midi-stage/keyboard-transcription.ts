import type { AudioAnalysis, AudioImportProgress, SongAudioSamples } from "./audio-import.ts";
import { makeKeyboardDraft, type KeyboardEvent } from "./keyboard-draft.ts";

function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Song import was cancelled.", "AbortError");
}
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Analysis copy only: source samples and elapsed song time remain unchanged. */
export async function keyboardMono(buffer: SongAudioSamples, signal?: AbortSignal): Promise<Float32Array<ArrayBuffer>> {
  cancelled(signal);
  if (!Number.isFinite(buffer.duration) || buffer.duration < 1 || buffer.duration > 360 || !Number.isInteger(buffer.length) || buffer.length <= 0
    || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate < 8000 || buffer.sampleRate > 192000
    || !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1) throw new Error("The decoded keyboard audio is not valid.");
  const left = buffer.getChannelData(0), right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  if (left.length !== buffer.length || right.length !== buffer.length) throw new Error("The decoded keyboard audio is incomplete.");
  let powerL = 0, powerR = 0, dot = 0;
  for (let i = 0; i < left.length; i++) {
    const l = Number.isFinite(left[i]) ? left[i]! : 0, r = Number.isFinite(right[i]) ? right[i]! : 0;
    powerL += l * l; powerR += r * r; dot += l * r;
    if (i % 131072 === 0) { await yieldTask(); cancelled(signal); }
  }
  if (Math.max(powerL, powerR) / buffer.length < 1e-8) throw new Error("This keyboard source is silent or too quiet to transcribe.");
  const polarity = dot / (Math.sqrt(powerL * powerR) || 1) < -0.95 ? -1 : 1;
  const mono = new Float32Array(buffer.length);
  for (let i = 0; i < mono.length; i++) {
    mono[i] = ((Number.isFinite(left[i]) ? left[i]! : 0) + polarity * (Number.isFinite(right[i]) ? right[i]! : 0)) / 2;
    if (i % 131072 === 0) { await yieldTask(); cancelled(signal); }
  }
  if (buffer.sampleRate === 22050) return mono;
  const context = new OfflineAudioContext(1, Math.round(buffer.duration * 22050), 22050);
  const source = context.createBufferSource(), input = context.createBuffer(1, mono.length, buffer.sampleRate);
  input.copyToChannel(mono, 0); source.buffer = input; source.connect(context.destination); source.start(0);
  const rendered = await context.startRendering(); cancelled(signal);
  return rendered.getChannelData(0).slice();
}

/** One worker per import: abort terminates inference and frees all model memory. */
export async function transcribeKeyboardAudio(buffer: SongAudioSamples, filename: string, fingerprint: string,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (progress: AudioImportProgress) => void } = {}): Promise<AudioAnalysis> {
  onProgress?.({ phase: "analyzing", progress: 0 });
  const samples = await keyboardMono(buffer, signal); cancelled(signal);
  const events = await new Promise<KeyboardEvent[]>((resolve, reject) => {
    const worker = new Worker(new URL("./keyboard-transcription.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (error?: Error, events?: KeyboardEvent[]) => {
      if (settled) return;
      settled = true; signal?.removeEventListener("abort", abort); worker.terminate();
      if (error) reject(error); else resolve(events!);
    };
    const abort = () => finish(new DOMException("Song import was cancelled.", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => finish(new Error("The keyboard transcriber could not start. Retry the import in a browser with worker support."));
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.({ phase: data.phase, progress: data.progress });
      else if (data.type === "complete") finish(undefined, data.events);
      else if (data.type === "error") finish(new Error(data.phase === "model"
        ? "Keyboard model could not load. Check your connection and retry the import."
        : "Keyboard transcription failed. Try a shorter, clean piano or keyboard recording."));
    };
    try { worker.postMessage({ samples, modelUrl: new URL("/models/basic-pitch/model.json", location.href).href }, [samples.buffer]); }
    catch { finish(new Error("The keyboard source could not be sent to the transcriber. Retry the import.")); }
    if (signal?.aborted) abort();
  });
  cancelled(signal);
  const result = makeKeyboardDraft(events, buffer.duration, filename, fingerprint);
  onProgress?.({ phase: "analyzing", progress: 1 }); cancelled(signal);
  return result;
}
