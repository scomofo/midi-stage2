import type { SharedChart, SharedNote } from "./chart-format.ts";
import { transcriptionConfidenceSummary } from "./transcription-confidence.ts";

export type ChartQualityIssue = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
};

export type ChartQualityReport = {
  score: number;
  grade: "excellent" | "good" | "review" | "poor";
  issues: ChartQualityIssue[];
  noteCount: number;
  needsReview: number;
};

function melodicNotes(chart: SharedChart): SharedNote[] {
  return chart.parts.filter((p) => p.type !== "drums").flatMap((p) => p.notes);
}

export function scoreChartQuality(chart: SharedChart): ChartQualityReport {
  const all = chart.parts.flatMap((p) => p.notes);
  const melodic = melodicNotes(chart);
  const confidence = transcriptionConfidenceSummary(all);
  const issues: ChartQualityIssue[] = [];
  let penalty = 0;

  if (!all.length) {
    return { score: 0, grade: "poor", issues: [{ severity: "error", code: "empty", message: "Chart has no playable notes." }], noteCount: 0, needsReview: 0 };
  }

  if (confidence.scored) {
    const reviewRatio = confidence.needsReview / confidence.scored;
    if (reviewRatio > 0.35) {
      penalty += 25;
      issues.push({ severity: "warning", code: "confidence", message: `${Math.round(reviewRatio * 100)}% of detected notes are low/medium confidence.` });
    } else if (reviewRatio > 0.15) {
      penalty += 12;
      issues.push({ severity: "info", code: "confidence", message: `${Math.round(reviewRatio * 100)}% of detected notes deserve review.` });
    }
  }

  const sorted = [...all].sort((a,b)=>a.time-b.time);
  let dense = 0;
  for (let i=1;i<sorted.length;i++) if (sorted[i]!.time - sorted[i-1]!.time < 0.035) dense++;
  const denseRatio = sorted.length > 1 ? dense / (sorted.length - 1) : 0;
  if (denseRatio > 0.45) {
    penalty += 15;
    issues.push({ severity: "warning", code: "density", message: "Very dense note clusters may contain duplicated attacks or stem bleed." });
  }

  const activeSpan = sorted.at(-1)!.time - sorted[0]!.time;
  if (chart.duration > 20 && activeSpan < chart.duration * 0.35) {
    penalty += 18;
    issues.push({ severity: "warning", code: "coverage", message: "Detected notes cover only a small portion of the song; check for missing sections." });
  }

  const tiny = all.filter((n)=>n.duration < 0.055).length;
  if (tiny / all.length > 0.25) {
    penalty += 12;
    issues.push({ severity: "info", code: "short-notes", message: "Many very short notes may be harmonic or transient false positives." });
  }

  if (chart.guitarMode === "strings") {
    const guitar = chart.parts.find((p)=>p.type==="guitar")!.notes;
    let awkward=0;
    for (let i=1;i<guitar.length;i++) {
      const a=guitar[i-1]!, b=guitar[i]!;
      if (b.time-a.time < 0.25 && Math.abs((b.guitarPosition?.fret ?? 0)-(a.guitarPosition?.fret ?? 0))>9) awkward++;
    }
    if (awkward) {
      penalty += Math.min(20, awkward * 3);
      issues.push({ severity: "warning", code: "guitar-jumps", message: `${awkward} rapid guitar position jump${awkward===1?"":"s"} should be reviewed.` });
    }
  }

  if (melodic.length && confidence.scored === 0 && chart.origin.startsWith("audio-")) {
    penalty += 8;
    issues.push({ severity: "info", code: "no-confidence", message: "This generated chart has no retained confidence metadata." });
  }

  const score=Math.max(0,Math.min(100,100-penalty));
  const grade=score>=90?"excellent":score>=75?"good":score>=50?"review":"poor";
  if (!issues.length) issues.push({ severity:"info", code:"clean", message:"No automatic quality warnings were found." });
  return { score, grade, issues, noteCount: all.length, needsReview: confidence.needsReview };
}
