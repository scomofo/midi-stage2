/// <reference lib="webworker" />
import * as tf from "@tensorflow/tfjs";
import { BasicPitch, noteFramesToTime, outputToNotesPoly } from "@spotify/basic-pitch";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async ({ data }: MessageEvent<{ samples: Float32Array; modelUrl: string }>) => {
  let graph: tf.GraphModel | undefined;
  let phase: "model" | "analyzing" = "model";
  try {
    scope.postMessage({ type: "progress", phase: "model" });
    // TFJS 3's converter reads atob from its environment global. Its default
    // global detection misses dedicated workers, which already provide atob.
    tf.env().global = scope;
    await tf.setBackend("cpu"); await tf.ready();
    graph = await tf.loadGraphModel(data.modelUrl);
    phase = "analyzing";
    const pitch = new BasicPitch(Promise.resolve(graph));
    const frames: number[][] = [], onsets: number[][] = [];
    // Basic Pitch's public preparation/window methods retain exact upstream
    // framing. Scopes release intermediates after each window instead of
    // retaining every tensor for a whole song. This worker owns its TF engine.
    tf.engine().startScope();
    try {
      const [input, length] = await pitch.prepareData(data.samples);
      const total = Math.floor(length * 86 / 22050);
      let calculated = 0;
      for (let i = 0; i < input.shape[0] && calculated < total; i++) {
        scope.postMessage({ type: "progress", phase: "analyzing", progress: i / input.shape[0] * 0.95 });
        tf.engine().startScope();
        try {
          const [f, o] = await pitch.evaluateSingleFrame(input, i);
          const frame = pitch.unwrapOutput(f), onset = pitch.unwrapOutput(o);
          const count = Math.min(frame.shape[0], total - calculated);
          frames.push(...await frame.slice([0, 0], [count, -1]).array());
          onsets.push(...await onset.slice([0, 0], [count, -1]).array());
          calculated += count;
        } finally { tf.engine().endScope(); }
      }
      scope.postMessage({ type: "progress", phase: "analyzing", progress: 0.95 });
      const events = noteFramesToTime(outputToNotesPoly(frames, onsets, 0.5, 0.3, 5));
      scope.postMessage({ type: "complete", events });
    } finally { tf.engine().endScope(); }
  } catch (error) {
    scope.postMessage({ type: "error", phase, message: error instanceof Error ? error.message : "Keyboard transcription failed." });
  } finally { graph?.dispose(); }
};
