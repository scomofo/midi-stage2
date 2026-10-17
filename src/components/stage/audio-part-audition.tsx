import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioEngine } from "@/lib/midi-stage/audio";
import type { SharedChart } from "@/lib/midi-stage/chart-format";
import type { AudioReviewInstrument } from "@/lib/midi-stage/audio-part-review";
import { LABELS } from "@/lib/midi-stage/songs";

/** A short, sample-aligned comparison of the applied part and original recording. */
export function AudioPartAudition({ chart, instrument, buffer, disabled, originalAudioRef }: {
  chart: SharedChart;
  instrument: AudioReviewInstrument;
  buffer?: AudioBuffer;
  disabled: boolean;
  originalAudioRef?: RefObject<HTMLAudioElement | null>;
}) {
  const notes = chart.parts.find((part) => part.type === instrument)!.notes;
  const [chosenStart, setStart] = useState<string | null>(null);
  const start = chosenStart ?? String(Math.max(0, Math.round(((notes[0]?.time ?? 0) - 0.25) * 1000) / 1000));
  const [withRecording, setWithRecording] = useState(Boolean(buffer));
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const engineRef = useRef<AudioEngine | null>(null);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    engineRef.current = null;
    engine?.stop();
    if (engine?.ctx && engine.ctx.state !== "closed") void engine.ctx.close().catch(() => {});
    setPlaying(false);
  }, []);

  useEffect(() => {
    const audio = originalAudioRef?.current;
    audio?.addEventListener("play", stop);
    return () => audio?.removeEventListener("play", stop);
  }, [originalAudioRef, stop]);
  useEffect(() => {
    // Edits, tab switches, importing, saving and closing all invalidate a preview.
    return stop;
  }, [chart, disabled, stop]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [stop]);

  async function play() {
    stop();
    const from = Number(start);
    if (!start.trim() || !Number.isFinite(from) || from < 0 || from >= chart.duration) {
      setError("Choose a start time inside the recording.");
      return;
    }
    setError("");
    originalAudioRef?.current?.pause();
    const engine = new AudioEngine();
    engineRef.current = engine;
    setPlaying(true);
    try {
      await engine.init();
      if (engineRef.current !== engine) return;
      const ctx = engine.ctx!;
      const at = ctx.currentTime + 0.06;
      const end = Math.min(chart.duration, from + 8);
      if (withRecording && buffer) {
        const chartStart = Math.max(from, chart.audioOffset, 0);
        const offset = chartStart - chart.audioOffset;
        const duration = Math.min(buffer.duration - offset, end - chartStart);
        if (duration > 0) {
          const source = ctx.createBufferSource(), gain = ctx.createGain();
          source.buffer = buffer;
          gain.gain.value = 0.45;
          source.connect(gain); gain.connect(engine.buses.backing!);
          engine.track(source, gain);
          source.start(at + chartStart - from, offset, duration);
        }
      }
      for (const note of notes) {
        const time = Math.max(from, note.time);
        const duration = Math.min(end, note.time + note.duration) - time;
        if (time >= end || duration <= 0 || (instrument === "drums" && note.time < from)) continue;
        engine.tone(instrument, note.pitch, note.velocity, at + time - from, duration, 0.8, engine.buses.guide);
      }
      // An audio-clock completion signal also works when the browser suspends audio.
      const finished = ctx.createBufferSource();
      finished.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      finished.connect(engine.master!);
      finished.onended = () => { if (engineRef.current === engine) stop(); };
      finished.start(at + end - from);
    } catch (error) {
      if (engineRef.current !== engine) return;
      stop();
      setError(error instanceof Error ? error.message : "The corrected part could not play.");
    }
  }

  return <section className="space-y-2 border-t border-border pt-4" aria-label="Corrected part audition">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="text-sm font-medium">Listen to corrected {LABELS[instrument].toLowerCase()}</h4>
      <Button type="button" variant="secondary" disabled={disabled} onClick={playing ? stop : () => void play()}>
        {playing ? <Square size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        {playing ? "Stop preview" : "Play corrected part"}
      </Button>
    </div>
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
      <label className="flex items-center gap-2">From
        <input className="w-24 rounded-sm border border-border bg-bg p-2 font-mono text-fg" aria-label="Preview start time" type="number" min={0} max={chart.duration} step="any" value={start} disabled={disabled || playing} onChange={(event) => setStart(event.target.value)} />
        seconds
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={withRecording} disabled={!buffer || disabled || playing} onChange={(event) => setWithRecording(event.target.checked)} /> With original recording</label>
    </div>
    <p role="status" className="text-xs leading-relaxed text-muted">{disabled ? "Apply or restore corrections before listening." : playing ? "Playing the applied part on the recording timeline." : "Up to 8 seconds using stage instrument sounds. Apply corrections to hear your edits."}</p>
    {error ? <p role="alert" className="text-xs text-tungsten">{error}</p> : null}
  </section>;
}
