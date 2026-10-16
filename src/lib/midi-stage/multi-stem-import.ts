import { importAudioFile, type AudioAnalysis, type AudioImportProgress } from "./audio-import.ts";
import { validateSharedChart, type SharedChart } from "./chart-format.ts";
import type { Instrument } from "./types.ts";

export type FullBandStemFiles = Partial<Record<"drums" | "keys" | "guitar" | "bass", File>>;
export type FullBandImportResult = AudioAnalysis & { buffer: AudioBuffer };

function combineCharts(charts: Partial<Record<Instrument, SharedChart>>, filename: string): SharedChart {
  const entries = Object.entries(charts) as Array<[Instrument, SharedChart]>;
  if (!entries.length) throw new Error("Choose at least one instrument stem.");
  const durations = entries.map(([, chart]) => chart.duration);
  const duration = durations[0]!;
  if (!durations.every((value) => Math.abs(value - duration) < 0.02)) {
    throw new Error("Instrument analyses do not share the same backing-song duration.");
  }
  const guitar = charts.guitar;
  const base = guitar ?? entries[0]![1];
  const parts = base.parts.map((part) => {
    const source = charts[part.type]?.parts.find((candidate) => candidate.type === part.type);
    return { type: part.type, notes: source?.notes ?? [] };
  });
  return validateSharedChart({
    ...base,
    id: `chart-full-band-${entries.map(([, chart]) => chart.id.replace(/^chart-/, "")).join("-").slice(0, 110)}`,
    title: filename.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim().slice(0, 160) || "Full band draft",
    origin: "audio-full-band-draft",
    matching: undefined,
    duration,
    parts,
    chordHighways: {
      keys: charts.keys?.chordHighways.keys ?? [],
      guitar: charts.guitar?.chordHighways.guitar ?? [],
    },
  });
}

export async function importFullBandStemSet(
  original: File,
  stems: FullBandStemFiles,
  options: { signal?: AbortSignal; onProgress?: (instrument: keyof FullBandStemFiles, progress: AudioImportProgress) => void } = {},
): Promise<FullBandImportResult> {
  const order = (["drums", "keys", "guitar", "bass"] as const).filter((instrument) => stems[instrument]);
  if (!order.length) throw new Error("Choose at least one drum, keyboard, guitar or bass stem.");
  const charts: Partial<Record<Instrument, SharedChart>> = {};
  const warnings: string[] = [];
  let backing: AudioBuffer | null = null;
  for (const instrument of order) {
    if (options.signal?.aborted) throw new DOMException("Song import was cancelled.", "AbortError");
    const result = await importAudioFile(original, {
      mode: instrument,
      analysisFile: stems[instrument],
      signal: options.signal,
      onProgress: (progress) => options.onProgress?.(instrument, progress),
    });
    charts[instrument] = result.chart;
    warnings.push(...result.warnings.map((warning) => `${instrument}: ${warning}`));
    backing ??= result.buffer;
  }
  return {
    chart: combineCharts(charts, original.name),
    warnings: [`Full-band draft combined ${order.join(", ")} on the original recording timeline.`, ...warnings],
    buffer: backing!,
  };
}

export { combineCharts as combineStemCharts };
