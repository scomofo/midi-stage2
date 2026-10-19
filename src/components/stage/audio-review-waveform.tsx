import { useEffect, useRef, useState } from "react";

/** Cache the actual recording envelope once; zooming only redraws the small cache. */
export function AudioReviewWaveform({ buffer, from, span, audioOffset }: {
  buffer?: AudioBuffer; from: number; span: number; audioOffset: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    if (!buffer) return;
    void (async () => {
      // Preserve attack detail when zooming into a long recording: at least 200 bins/second.
      const bins = Math.min(72000, Math.max(1600, Math.ceil(buffer.duration * 200))), result = new Float32Array(bins);
      for (let channel = 0; channel < Math.min(2, buffer.numberOfChannels); channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < bins; i++) {
          const end = Math.floor((i + 1) * samples.length / bins);
          for (let j = Math.floor(i * samples.length / bins); j < end; j++) result[i] = Math.max(result[i]!, Math.abs(samples[j]!));
          if (i % 80 === 79) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            if (cancelled) return;
          }
        }
      }
      if (!cancelled) setPeaks(result);
    })();
    return () => { cancelled = true; };
  }, [buffer]);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const draw = () => {
      const width = node.clientWidth, height = 62, ratio = Math.min(devicePixelRatio || 1, 2);
      node.width = Math.round(width * ratio); node.height = height * ratio;
      const ctx = node.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.fillStyle = getComputedStyle(node).color;
      if (!peaks || !buffer) return;
      const max = peaks.reduce((maximum, peak) => Math.max(maximum, peak), 0.01);
      for (let x = 0; x < width; x += 2) {
        const first = Math.floor((from + span * x / width - audioOffset) / buffer.duration * peaks.length);
        const last = Math.ceil((from + span * (x + 2) / width - audioOffset) / buffer.duration * peaks.length);
        let peak = 0;
        for (let bin = Math.max(0, first); bin < Math.min(peaks.length, last); bin++) peak = Math.max(peak, peaks[bin]!);
        const h = Math.max(1, peak / max * 52);
        if (first < peaks.length && last >= 0) ctx.fillRect(x, (height - h) / 2, 1, h);
      }
    };
    const observer = new ResizeObserver(draw); observer.observe(node); draw();
    return () => observer.disconnect();
  }, [buffer, peaks, from, span, audioOffset]);
  return <div className="studio-waveform">
    <canvas ref={canvas} aria-label={buffer ? "Original recording waveform" : "No recording attached"} role="img" />
    {!buffer ? <span>No recording attached · notes remain editable</span> : !peaks ? <span>Reading waveform…</span> : null}
  </div>;
}
