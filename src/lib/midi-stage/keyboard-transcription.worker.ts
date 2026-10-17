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
      const [input] = await pitch.prepareData(data.samples);
      // Keep the final window: the integer 86-fps cap can end before the audio.
      // Convert using the model's own timestamps, then clip events to source time.
      for (let i = 0; i < input.shape[0]; i++) {
        scope.postMessage({ type: "progress", phase: "analyzing", progress: i / input.shape[0] * 0.95 });
        tf.engine().startScope();
        try {
          const [f, o] = await pitch.evaluateSingleFrame(input, i);
          const frame = pitch.unwrapOutput(f), onset = pitch.unwrapOutput(o);
          frames.push(...await frame.array());
          onsets.push(...await onset.array());
        } finally { tf.engine().endScope(); }
      }
      scope.postMessage({ type: "progress", phase: "analyzing", progress: 0.95 });
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
      scope.postMessage({ type: "complete", events });
    } finally { tf.engine().endScope(); }
  } catch (error) {
    scope.postMessage({ type: "error", phase, message: error instanceof Error ? error.message : "Keyboard transcription failed." });
  } finally { graph?.dispose(); }
};
