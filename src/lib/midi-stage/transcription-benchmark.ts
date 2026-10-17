/** Reference lengths may be omitted for percussion or recordings without note-off labels. */
export type BenchmarkNote = { time: number; duration?: number; pitch: number };
export type BenchmarkMatch = {
  referenceIndex: number; detectedIndex: number;
  onsetErrorMs: number; durationErrorMs: number | null; offsetErrorMs: number | null;
};
export type BenchmarkResult = {
  reference: number; detected: number; matched: number;
  falsePositives: number; falseNegatives: number; octaveErrors: number; otherPitchErrors: number;
  precision: number; recall: number; f1: number;
  meanOnsetErrorMs: number | null; meanSignedOnsetErrorMs: number | null; p95OnsetErrorMs: number | null;
  meanDurationErrorMs: number | null; meanOffsetErrorMs: number | null;
  matches: BenchmarkMatch[]; missed: number[]; extra: number[];
};
type Options = { onsetToleranceMs?: number; durationToleranceMs?: number; pitchTolerance?: number };

function nonnegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and nonnegative.`);
  return value;
}

function validate(notes: BenchmarkNote[], label: string) {
  for (const [index, note] of notes.entries()) {
    nonnegative(note.time, `${label} ${index} time`);
    if (note.duration !== undefined) nonnegative(note.duration, `${label} ${index} duration`);
    if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) throw new Error(`${label} ${index} needs a MIDI pitch from 0 to 127.`);
  }
}

/** Maximum-cardinality one-to-one matching. An early nearest choice cannot steal a later note's only match. */
function matchNotes(reference: BenchmarkNote[], detected: BenchmarkNote[], onset: number,
  compatible: (reference: BenchmarkNote, detected: BenchmarkNote) => boolean,
  referenceIndices = reference.map((_, index) => index), detectedIndices = detected.map((_, index) => index)) {
  const ordered = [...detectedIndices].sort((a, b) => detected[a]!.time - detected[b]!.time || a - b);
  const edges = new Map<number, number[]>();
  for (const index of referenceIndices) {
    const note = reference[index]!;
    let low = 0, high = ordered.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (detected[ordered[mid]!]!.time < note.time - onset - 1e-9) low = mid + 1;
      else high = mid;
    }
    const candidates: number[] = [];
    for (let i = low; i < ordered.length; i++) {
      const candidate = detected[ordered[i]!]!;
      if (candidate.time > note.time + onset + 1e-9) break;
      if (compatible(note, candidate)) candidates.push(ordered[i]!);
    }
    candidates.sort((a, b) => Math.abs(detected[a]!.time - note.time) - Math.abs(detected[b]!.time - note.time) || a - b);
    edges.set(index, candidates);
  }
  const byReference = new Map<number, number>(), byDetected = new Map<number, number>();
  for (const root of [...referenceIndices].sort((a, b) => reference[a]!.time - reference[b]!.time || reference[a]!.pitch - reference[b]!.pitch || a - b)) {
    const queue = [root], visited = new Set([root]), previous = new Map<number, number>();
    let free: number | undefined;
    for (let cursor = 0; cursor < queue.length && free === undefined; cursor++) {
      const index = queue[cursor]!;
      for (const candidate of edges.get(index)!) {
        if (previous.has(candidate)) continue;
        previous.set(candidate, index);
        const owner = byDetected.get(candidate);
        if (owner === undefined) { free = candidate; break; }
        if (!visited.has(owner)) { visited.add(owner); queue.push(owner); }
      }
    }
    while (free !== undefined) {
      const index = previous.get(free)!;
      const replaced = byReference.get(index);
      byReference.set(index, free); byDetected.set(free, index);
      free = replaced;
    }
  }
  return byReference;
}

/** Pitch/onset F1 by default; hold errors are measured on those matches, never pre-filtered away. */
export function scoreTranscription(reference: BenchmarkNote[], detected: BenchmarkNote[], options: Options = {}): BenchmarkResult {
  validate(reference, "Reference"); validate(detected, "Detection");
  const onset = nonnegative(options.onsetToleranceMs ?? 60, "Onset tolerance") / 1000;
  const duration = options.durationToleranceMs === undefined ? Infinity : nonnegative(options.durationToleranceMs, "Duration tolerance") / 1000;
  const pitch = nonnegative(options.pitchTolerance ?? 0, "Pitch tolerance");
  const paired = matchNotes(reference, detected, onset, (ref, note) => Math.abs(ref.pitch - note.pitch) <= pitch
    && (ref.duration === undefined || note.duration === undefined || Math.abs(ref.duration - note.duration) <= duration + 1e-9));
  const used = new Set(paired.values());
  const missed = reference.flatMap((_, index) => paired.has(index) ? [] : [index]);
  const extra = detected.flatMap((_, index) => used.has(index) ? [] : [index]);
  const octaves = matchNotes(reference, detected, onset, (ref, note) => ref.pitch !== note.pitch && Math.abs(ref.pitch - note.pitch) % 12 === 0, missed, extra);
  const octaveUsed = new Set(octaves.values());
  const otherPitches = matchNotes(reference, detected, onset, (ref, note) => ref.pitch !== note.pitch,
    missed.filter((index) => !octaves.has(index)), extra.filter((index) => !octaveUsed.has(index)));
  const matches = [...paired].sort(([a], [b]) => a - b).map(([referenceIndex, detectedIndex]) => {
    const ref = reference[referenceIndex]!, note = detected[detectedIndex]!;
    const lengths = ref.duration !== undefined && note.duration !== undefined;
    return { referenceIndex, detectedIndex, onsetErrorMs: (note.time - ref.time) * 1000,
      durationErrorMs: lengths ? (note.duration! - ref.duration!) * 1000 : null,
      offsetErrorMs: lengths ? (note.time + note.duration! - ref.time - ref.duration!) * 1000 : null };
  });
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const onsets = matches.map((match) => Math.abs(match.onsetErrorMs)).sort((a, b) => a - b);
  const precision = detected.length ? matches.length / detected.length : reference.length ? 0 : 1;
  const recall = reference.length ? matches.length / reference.length : detected.length ? 0 : 1;
  return {
    reference: reference.length, detected: detected.length, matched: matches.length,
    falsePositives: extra.length, falseNegatives: missed.length, octaveErrors: octaves.size, otherPitchErrors: otherPitches.size,
    precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    meanOnsetErrorMs: mean(onsets), meanSignedOnsetErrorMs: mean(matches.map((match) => match.onsetErrorMs)),
    p95OnsetErrorMs: onsets.length ? onsets[Math.ceil(onsets.length * 0.95) - 1]! : null,
    meanDurationErrorMs: mean(matches.flatMap((match) => match.durationErrorMs === null ? [] : [Math.abs(match.durationErrorMs)])),
    meanOffsetErrorMs: mean(matches.flatMap((match) => match.offsetErrorMs === null ? [] : [Math.abs(match.offsetErrorMs)])),
    matches, missed, extra,
  };
}

export function benchmarkPass(result: BenchmarkResult, {
  minF1 = 0.8, minPrecision = 0, minRecall = 0, maxOnsetMs = 80, maxDurationMs = 200,
  maxFalsePositives = Number.MAX_SAFE_INTEGER, maxFalseNegatives = Number.MAX_SAFE_INTEGER,
} = {}) {
  for (const [name, value] of Object.entries({ minF1, minPrecision, minRecall })) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1.`);
  }
  nonnegative(maxOnsetMs, "Maximum onset error"); nonnegative(maxDurationMs, "Maximum duration error");
  for (const value of [maxFalsePositives, maxFalseNegatives]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Error-count limits must be nonnegative safe integers.");
  }
  return result.f1 >= minF1 && result.precision >= minPrecision && result.recall >= minRecall
    && result.falsePositives <= maxFalsePositives && result.falseNegatives <= maxFalseNegatives
    && (result.meanOnsetErrorMs ?? 0) <= maxOnsetMs && (result.meanDurationErrorMs ?? 0) <= maxDurationMs;
}
