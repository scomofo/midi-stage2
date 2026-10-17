import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTranscriptionReports, renderTranscriptionReport } from './lib/transcription-report.mjs';

const metrics = { reference: 0, detected: 0, falseNegatives: 0, falsePositives: 0, octaveErrors: 0, matched: 0,
  precision: 1, recall: 1, f1: 1, meanOnsetErrorMs: null, p95OnsetErrorMs: null, meanDurationErrorMs: null, meanOffsetErrorMs: null };
const report = { schema: 'midi-stage-transcription-benchmark', version: 1, commit: 'base', sourceManifestHash: 'manifest',
  modelHashes: { model: 'weights' }, policy: { onsetToleranceMs: 60 }, cases: [{ id: 'silence', instrument: 'keys', kind: 'analytical-render',
    audioSha256: 'audio', reference: [], metrics, status: 'no-detections', regressionStatus: 'diagnostic',
    regressionFloor: { diagnosticOnly: true, reason: 'Known limitation retained visibly.' } }] };

test('comparisons reject changed audio, labels, model, corpus or scoring policy', () => {
  assert.match(compareTranscriptionReports(report, structuredClone(report)), /silence/);
  for (const mutate of [
    (r) => { r.cases[0].audioSha256 = 'different'; },
    (r) => { r.cases[0].reference = [{ time: 1, pitch: 60 }]; },
    (r) => { r.modelHashes.model = 'other'; },
    (r) => { r.cases = []; },
    (r) => { r.policy.onsetToleranceMs = 100; },
  ]) {
    const changed = structuredClone(report); mutate(changed);
    assert.throws(() => compareTranscriptionReports(report, changed));
  }
});

test('reports expose diagnostics and omit undefined silence accuracy', () => {
  const markdown = renderTranscriptionReport(report);
  assert.doesNotMatch(markdown, /100\.0%/);
  assert.match(markdown, /no-detections \/ diagnostic/);
  assert.match(markdown, /Known limitation retained visibly/);
  assert.match(markdown, /added harmonic notes still count as extras/);
  assert.doesNotMatch(compareTranscriptionReports(report, report), /100\.0%/);
});
