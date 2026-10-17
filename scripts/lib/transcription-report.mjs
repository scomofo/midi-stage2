import assert from 'node:assert/strict';

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const ms = (value) => value === null ? '—' : value.toFixed(1);
const measured = (entry) => entry.metrics.reference || entry.metrics.detected;

export function renderTranscriptionReport(report) {
  const revision = report.revision;
  const provenance = revision?.testedTree
    ? `Base commit: ${revision.baseCommit}. Tested Git tree: ${revision.testedTree}. Uncommitted changes: ${revision.dirty ? 'yes' : 'no'}.`
    : revision?.pipelineCommit
      ? `Verified pipeline revision: ${revision.pipelineCommit}; HEAD at run time: ${revision.baseCommit}. Historical run: pipeline files/model were verified against recorded hashes afterward; the full working tree was not captured.`
      : `Base commit: ${report.baseCommit ?? report.commit ?? 'unknown'}. This historical report did not capture a tested working tree.`;
  return ['# Audio import transcription benchmark', '',
    'Actual local audio-file imports, browser decoding, Basic Pitch workers and chart post-processing. Exact MIDI pitch and 60 ms onset tolerance. Hold errors use pitch/onset matches, without a duration pre-filter.', '',
    `${provenance} Source, model and audio hashes are in report.json.`, '',
    'Source kinds stay separate: recorded-performance is an annotated GuitarSet excerpt; recorded-sample-render is digitally scheduled/transposed recorded timbre; analytical-render is a generated signal. The GuitarSet training/held-out relationship has not been established. This small corpus is not an estimate for arbitrary songs.', '',
    '| Case | Instrument | Source kind | Ref / detected | Precision | Recall | F1 | Missed / extra | Octave substitutions | Import / regression |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---|',
    ...report.cases.map((entry) => `| ${entry.id} | ${entry.instrument} | ${entry.kind} | ${entry.metrics.reference} / ${entry.metrics.detected} | ${measured(entry) ? pct(entry.metrics.precision) : '—'} | ${entry.metrics.reference ? pct(entry.metrics.recall) : '—'} | ${measured(entry) ? pct(entry.metrics.f1) : '—'} | ${entry.metrics.falseNegatives} / ${entry.metrics.falsePositives} | ${entry.metrics.octaveErrors} | ${entry.status} / ${entry.regressionStatus ?? 'recorded'} |`), '',
    '| Case | Matched notes | Onset MAE (ms) | Onset p95 (ms) | Length MAE (ms) | Note-off MAE (ms) |',
    '|---|---:|---:|---:|---:|---:|',
    ...report.cases.map((entry) => `| ${entry.id} | ${entry.metrics.matched} | ${ms(entry.metrics.meanOnsetErrorMs)} | ${ms(entry.metrics.p95OnsetErrorMs)} | ${ms(entry.metrics.meanDurationErrorMs)} | ${ms(entry.metrics.meanOffsetErrorMs)} |`), '',
    'Missed/extra include wrong-octave and wrong-pitch attacks. Octave substitutions pair otherwise unmatched reference and detected notes; added harmonic notes still count as extras even when substitutions are zero. Timing/length means cover matched notes only; missed counts remain visible. Percussion has no note-off labels. Synthetic gates and cropped final holds do not establish pedal, release or string/fret accuracy.', '',
    'Regression floors protect this corpus from worsening. They are not a promise of transcription quality on other recordings. Diagnostic cases expose known failures and have no quality pass.', '',
    ...report.cases.filter((entry) => entry.regressionFloor?.diagnosticOnly).map((entry) => `- ${entry.id}: ${entry.regressionFloor.reason}`), ''].join('\n');
}

/** Refuse comparisons that silently change the audio, labels, model or scoring policy. */
export function compareTranscriptionReports(before, after) {
  assert.equal(before.schema, 'midi-stage-transcription-benchmark');
  assert.equal(after.schema, before.schema);
  for (const key of ['version', 'sourceManifestHash', 'modelHashes', 'policy']) assert.deepEqual(after[key], before[key], `Comparison changed ${key}`);
  assert.deepEqual(after.cases.map((entry) => entry.id).sort(), before.cases.map((entry) => entry.id).sort(), 'Compare the same cases');
  const rows = after.cases.map((entry) => {
    const prior = before.cases.find((candidate) => candidate.id === entry.id);
    for (const key of ['audioSha256', 'reference', 'instrument', 'kind']) assert.deepEqual(entry[key], prior[key], `Comparison changed ${entry.id} ${key}`);
    return { id: entry.id, kind: entry.kind, before: prior.metrics, after: entry.metrics };
  });
  return ['# Measured transcription changes', '',
    'Same audio bytes, independent reference labels, model weights and pitch/onset matching policy. Each row is a separate case; there is no pooled accuracy percentage. Full imports and matched-note timing are retained in the accompanying JSON reports.', '',
    '| Case | Source kind | F1 before → after | Missed before → after | Extra before → after | Length MAE before → after (ms) |',
    '|---|---|---:|---:|---:|---:|',
    ...rows.map(({ id, kind, before: b, after: a }) => `| ${id} | ${kind} | ${a.reference || a.detected || b.detected ? `${pct(b.f1)} → ${pct(a.f1)}` : '—'} | ${b.falseNegatives} → ${a.falseNegatives} | ${b.falsePositives} → ${a.falsePositives} | ${ms(b.meanDurationErrorMs)} → ${ms(a.meanDurationErrorMs)} |`), '',
    'F1 matches exact MIDI pitches within 60 ms. Length errors are measured only on pitch/onset matches; percussion note-offs are unannotated. Silence controls are shown without accuracy percentages.', ''].join('\n');
}
