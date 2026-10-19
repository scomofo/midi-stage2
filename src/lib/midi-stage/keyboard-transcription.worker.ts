/// <reference lib="webworker" />
import * as tf from "@tensorflow/tfjs";
import { BasicPitch, noteFramesToTime, outputToNotesPoly } from "@spotify/basic-pitch";
import { preparePitchBackend } from "./pitch-inference-backend.ts";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async ({ data }: MessageEvent<{ samples: Float32Array; modelUrl: string }>) => {
  let graph: tf.GraphModel | undefined;
  let phase: "model" | "analyzing" = "model";
  const timings = { backendMs: 0, modelMs: 0, framingMs: 0, inferenceMs: 0, notesMs: 0 };
  let mark = performance.now();
  try {
    scope.postMessage({ type: "progress", phase: "model" });
    // TFJS 3's converter reads atob from its environment global. Its default
    // global detection misses dedicated workers, which already provide atob.
    tf.env().global = scope;
    await preparePitchBackend(scope.location.href);
    timings.backendMs = performance.now() - mark;
    mark = performance.now();
    graph = await tf.loadGraphModel(data.modelUrl);
    timings.modelMs = performance.now() - mark;
    phase = "analyzing";
    const pitch = new BasicPitch(Promise.resolve(graph));
    const frames: number[][] = [], onsets: number[][] = [];
    // Basic Pitch's public preparation/window methods retain exact upstream
    // framing. Scopes release intermediates after each window instead of
    // retaining every tensor for a whole song. This worker owns its TF engine.
    tf.engine().startScope();
    try {
      // TFJS 3.21's signal.frame omits Fill's dtype, which WASM rejects. Keep
      // Basic Pitch's exact public framing on CPU, then accelerate inference.
      const backend = tf.getBackend();
      mark = performance.now();
      if (backend !== "cpu") await tf.setBackend("cpu");
      const [input] = await pitch.prepareData(data.samples);
      if (backend !== "cpu") await tf.setBackend(backend);
      timings.framingMs = performance.now() - mark;
      // Keep the final window: the integer 86-fps cap can end before the audio.
      // Convert using the model's own timestamps, then clip events to source time.
      for (let i = 0; i < input.shape[0]; i++) {
        scope.postMessage({ type: "progress", phase: "analyzing", progress: i / input.shape[0] * 0.95 });
        tf.engine().startScope();
        try {
          mark = performance.now();
          const [f, o] = await pitch.evaluateSingleFrame(input, i);
          const frame = pitch.unwrapOutput(f), onset = pitch.unwrapOutput(o);
          frames.push(...await frame.array());
          onsets.push(...await onset.array());
          timings.inferenceMs += performance.now() - mark;
        } finally { tf.engine().endScope(); }
      }
      scope.postMessage({ type: "progress", phase: "analyzing", progress: 0.95 });
      mark = performance.now();
      // The public no-Melodia pass identifies onset-backed notes. The full pass
      // also recovers sustained energy; those fragments may need guitar deglitching.
      const attacks = new Set(outputToNotesPoly(frames, onsets, 0.5, 0.3, 5, true, null, null, false)
        .map((note) => `${note.startFrame}:${note.pitchMidi}`));
      const notes = outputToNotesPoly(frames, onsets, 0.5, 0.3, 5);
      const duration = data.samples.length / 22050;
      const events = noteFramesToTime(notes).map((event, index) => ({
        ...event, hasOnset: attacks.has(`${notes[index]!.startFrame}:${notes[index]!.pitchMidi}`),
        durationSeconds: Math.min(event.durationSeconds, duration - event.startTimeSeconds),
      })).filter((event) => event.startTimeSeconds < duration && event.durationSeconds > 0);
      timings.notesMs = performance.now() - mark;
      scope.postMessage({ type: "complete", events, backend: tf.getBackend(), timings });
    } finally { tf.engine().endScope(); }
  } catch (error) {
    scope.postMessage({ type: "error", phase, backend: tf.getBackend(), message: error instanceof Error ? error.message : "Keyboard transcription failed.", stack: error instanceof Error ? error.stack : undefined });
  } finally { graph?.dispose(); }
};
