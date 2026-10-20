import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { Play, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioEngine } from "@/lib/midi-stage/audio";
import type { SharedChart } from "@/lib/midi-stage/chart-format";
import type { AudioReviewInstrument } from "@/lib/midi-stage/audio-part-review";
import type { ShortChordCandidate } from "@/lib/midi-stage/guitar-short-chord-audit";
import { noteName } from "@/lib/midi-stage/engine";

export type AudioAuditionOptions = {
  startRequest?: { time: number; key: number };
  selectedTime?: number;
  selectedPitch?: number;
  suggestion?: ShortChordCandidate;
  onPosition?: (time: number | null) => void;
};

/** All voices and recording clips share one Web Audio clock, including loop boundaries. */
export function AudioPartAudition({ chart, instrument, buffer, disabled, originalAudioRef, startRequest, selectedTime, selectedPitch, suggestion, onPosition }: {
  chart: SharedChart; instrument: AudioReviewInstrument; buffer?: AudioBuffer; disabled: boolean;
  originalAudioRef?: RefObject<HTMLAudioElement | null>;
} & AudioAuditionOptions) {
  const notes = chart.parts.find((part) => part.type === instrument)!.notes;
  const [chosenStart, setStart] = useState<string | null>(null);
  const start = chosenStart ?? String(Math.max(0, Math.round(((notes[0]?.time ?? 0) - 0.25) * 1000) / 1000));
  const [mix, setMix] = useState<"together" | "corrected" | "recording">(buffer ? "together" : "corrected");
  const [length, setLength] = useState("8");
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playingSuggestion, setPlayingSuggestion] = useState(false);
  const [error, setError] = useState("");
  const engineRef = useRef<AudioEngine | null>(null);
  const animationRef = useRef(0);
  const positionRef = useRef(onPosition); positionRef.current = onPosition;
  const radioName = useId();
  const stop = useCallback(() => {
    const engine = engineRef.current; engineRef.current = null;
    cancelAnimationFrame(animationRef.current);
    engine?.stop();
    if (engine?.ctx && engine.ctx.state !== "closed") void engine.ctx.close().catch(() => {});
    setPlaying(false); positionRef.current?.(null);
  }, []);
  useEffect(() => {
    const audio = originalAudioRef?.current;
    audio?.addEventListener("play", stop);
    return () => audio?.removeEventListener("play", stop);
  }, [originalAudioRef, stop]);
  useEffect(() => () => stop(), [chart, disabled, suggestion, stop]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [stop]);
  useEffect(() => {
    stop();
    setStart(startRequest ? String(Math.round(startRequest.time * 1000) / 1000) : null);
  }, [startRequest, stop]);

  async function play(selected = false, suggestionMix?: "together" | "corrected" | "recording") {
    stop();
    const auditionSuggestion = suggestionMix !== undefined && suggestion !== undefined;
    if (suggestionMix !== undefined && !suggestion) return;
    const selectedNote = auditionSuggestion ? { time: suggestion!.time, duration: suggestion!.estimatedDuration, pitch: suggestion!.pitchMidi, velocity: 90 }
      : selected ? notes.find((note) => Math.abs(note.time - selectedTime!) < 1e-6 && note.pitch === selectedPitch) : undefined;
    selected ||= auditionSuggestion;
    if (selected && !selectedNote) { setError("Select an applied note to hear it."); return; }
    const from = selected && selectedNote ? Math.max(0, selectedNote.time - 0.15) : Number(start);
    const seconds = selected ? Math.max(0.7, Math.min(2, selectedNote!.duration + 0.3)) : Number(length);
    if ((!selected && !start.trim()) || !Number.isFinite(from) || from < 0 || from >= chart.duration || !Number.isFinite(seconds) || seconds < 0.25 || seconds > 16) {
      setError("Choose a start inside the recording and a preview length from 0.25 to 16 seconds."); return;
    }
    if (chart.duration - from < 0.02 - 1e-8) {
      setError("Start the preview at least 0.02 seconds before the recording ends."); return;
    }
    if (selected) setStart(String(Math.round(from * 1000) / 1000));
    setError(""); originalAudioRef?.current?.pause();
    const engine = new AudioEngine(); engineRef.current = engine; setPlaying(true); setPlayingSuggestion(auditionSuggestion);
    const previewMix = suggestionMix ?? mix;
    const previewNotes = auditionSuggestion ? [selectedNote!] : notes;
    try {
      await engine.init();
      if (engineRef.current !== engine) return;
      const ctx = engine.ctx!, at = ctx.currentTime + 0.06, end = Math.min(chart.duration, from + seconds), span = end - from;
      const looping = loop && !selected;
      const schedule = (cycle: number) => {
        if (engineRef.current !== engine) return;
        const cycleAt = at + cycle * span;
        if (previewMix !== "corrected" && buffer) {
          const chartStart = Math.max(from, chart.audioOffset, 0), offset = chartStart - chart.audioOffset;
          const duration = Math.min(buffer.duration - offset, end - chartStart);
          if (duration > 0) {
            const source = ctx.createBufferSource(), gain = ctx.createGain(); source.buffer = buffer;
            gain.gain.value = previewMix === "recording" ? 0.8 : 0.45;
            source.connect(gain); gain.connect(engine.buses.backing!); engine.track(source, gain);
            source.start(cycleAt + chartStart - from, offset, duration);
          }
        }
        if (previewMix !== "recording") for (const note of previewNotes) {
          if (selected && note !== selectedNote) continue;
          const time = Math.max(from, note.time), duration = Math.min(end, note.time + note.duration) - time;
          if (time >= end || duration <= 0 || (instrument === "drums" && note.time < from)) continue;
          engine.tone(instrument, note.pitch, note.velocity, cycleAt + time - from, duration, 0.8, engine.buses.guide);
        }
        const finished = ctx.createBufferSource(); finished.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); finished.connect(engine.master!);
        finished.onended = () => {
          finished.disconnect();
          if (engineRef.current !== engine) return;
          if (looping) schedule(cycle + 2); else stop();
        };
        finished.start(cycleAt + span);
      };
      schedule(0);
      // Keep one whole cycle scheduled ahead, independent of rendering cadence.
      if (looping) schedule(1);
      let last = -Infinity;
      const animate = () => {
        if (engineRef.current !== engine) return;
        if (ctx.currentTime - last >= 1 / 30) {
          last = ctx.currentTime;
          const elapsed = Math.max(0, ctx.currentTime - at);
          positionRef.current?.(from + (looping ? elapsed % span : Math.min(span, elapsed)));
        }
        animationRef.current = requestAnimationFrame(animate);
      };
      animate();
    } catch (reason) {
      if (engineRef.current !== engine) return;
      stop(); setError(reason instanceof Error ? reason.message : "The corrected part could not play.");
    }
  }
  return <section className="space-y-3" aria-label="Corrected part audition">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={disabled} onClick={playing ? stop : () => void play()}>
          {playing ? <Square size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}{playing ? "Stop preview" : "Play preview"}
        </Button>
        {selectedTime !== undefined ? <Button type="button" variant="ghost" size="sm" disabled={disabled || playing || !Number.isFinite(selectedTime)} onClick={() => void play(true)}><Volume2 size={15} aria-hidden="true" /> Hear selected note</Button> : null}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={loop} disabled={disabled || playing} onChange={(event) => setLoop(event.target.checked)} />Loop preview</label>
    </div>
    <fieldset className="flex flex-wrap gap-3 text-[11px] text-muted" disabled={disabled || playing}>
      <legend className="sr-only">Preview mix</legend>
      {([['together', 'Corrected + recording'], ['corrected', 'Corrected only'], ['recording', 'Recording only']] as const).map(([value, label]) => <label key={value} className="flex items-center gap-1.5"><input type="radio" name={radioName} value={value} checked={mix === value} disabled={value !== "corrected" && !buffer} onChange={() => setMix(value)} />{label}</label>)}
    </fieldset>
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
      <label className="flex items-center gap-2">From<input className="w-20 rounded-sm border border-border bg-bg p-2 font-mono text-fg" aria-label="Preview start time" type="number" min={0} max={chart.duration} step="any" value={start} disabled={disabled || playing} onChange={(event) => setStart(event.target.value)} />s</label>
      <label className="flex items-center gap-2">Length<input className="w-16 rounded-sm border border-border bg-bg p-2 font-mono text-fg" aria-label="Preview length" type="number" min={0.25} max={16} step="any" value={length} disabled={disabled || playing} onChange={(event) => setLength(event.target.value)} />s</label>
    </div>
    {suggestion ? <div className="studio-suggestion-listen" role="group" aria-label="Suggestion listening controls">
      <p>Possible {noteName(suggestion.pitchMidi)} at {suggestion.time.toFixed(3)}s · unverified tone</p>
      <div><Button size="sm" variant="secondary" disabled={disabled || playing || !buffer} onClick={() => void play(false, "recording")}>Recording phrase</Button>
        <Button size="sm" variant="secondary" disabled={disabled || playing || !buffer} onClick={() => void play(false, "together")}>Suggestion + recording</Button>
        <Button size="sm" variant="ghost" disabled={disabled || playing} onClick={() => void play(false, "corrected")}>Suggestion only</Button></div>
      <p>The suggested tone is synthesized for comparison. Accepting it is a separate edit.</p>
    </div> : null}
    <p role="status" className="text-[10px] leading-relaxed text-muted">{disabled ? "Apply or undo corrections before listening." : playing ? playingSuggestion ? "Playing the selected suggestion phrase. The chart is unchanged by listening." : "Playing the applied part on the recording timeline." : "Stage sounds play the applied notes. Compare with the recording to check pitches and holds."}</p>
    {error ? <p role="alert" className="text-xs text-tungsten">{error}</p> : null}
  </section>;
}
