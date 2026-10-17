#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { scoreTranscription, benchmarkPass } from '../src/lib/midi-stage/transcription-benchmark.ts';
import { transcriptionAudioCases, sha256, fixtureRoot } from './fixtures/transcription-audio.mjs';
import { renderTranscriptionReport } from './lib/transcription-report.mjs';

const args = process.argv.slice(2);
const url = args.find((arg) => /^https?:\/\//.test(arg)) ?? 'http://127.0.0.1:8082';
const recordOnly = args.includes('--record-only');
const only = args.find((arg) => arg.startsWith('--only='))?.slice(7).split(',');
const output = resolve(process.env.SESSION_SCREENSHOT_DIR || '/workspace/screenshots/transcription-benchmark');
assert.ok(output.startsWith('/workspace/screenshots/'), 'Benchmark reports belong under /workspace/screenshots/');
await mkdir(output, { recursive: true });
const { cases: allCases, sourceManifestHash } = await transcriptionAudioCases();
if (only?.some((id) => !allCases.some((entry) => entry.id === id))) throw Error('Unknown benchmark case');
const cases = allCases.filter((entry) => !only || only.includes(entry.id));
const policy = JSON.parse(await readFile(new URL('regression-floors.json', fixtureRoot), 'utf8'));
const sourceFiles = ['audio-import.ts', 'audio-drum-analysis.ts', 'keyboard-transcription.worker.ts', 'keyboard-transcription.ts', 'pitched-transcription.ts', 'guitar-transcription.ts', 'guitar-draft.ts', 'guitar-event-cleanup.ts', 'guitar-fingering-solver.ts', 'bass-transcription.ts', 'bass-draft.ts', 'keyboard-draft.ts'];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (path) => [path, sha256(await readFile(new URL(`../src/lib/midi-stage/${path}`, import.meta.url)))])));
const model = JSON.parse(await readFile(new URL('../public/models/basic-pitch/model.json', import.meta.url), 'utf8'));
const modelHashes = Object.fromEntries(await Promise.all(['model.json', ...model.weightsManifest.flatMap((group) => group.paths)].map(async (path) => [path, sha256(await readFile(new URL(`../public/models/basic-pitch/${path}`, import.meta.url)))])));
const report = { schema: 'midi-stage-transcription-benchmark', version: 1, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  generatedAt: new Date().toISOString(), runtime: process.version, sourceManifestHash, sourceHashes, modelHashes, policy: { onsetToleranceMs: 60, pitchTolerance: 0, holdLengths: 'measured on pitch/onset matches; omitted when unannotated' }, cases: [] };
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
report.browser = browser.version();
const errors = [];
const modelRequests = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().includes('/models/basic-pitch/')) modelRequests.push(request.url()); });
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    window.benchmarkWorkers = [];
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args); this.active = true; window.benchmarkWorkers.push(this);
        this.addEventListener('message', ({ data }) => { if (data.type === 'complete') this.events = data.events; });
      }
      terminate() { this.active = false; super.terminate(); }
    };
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.pad').first().waitFor();
  for (const entry of cases) {
    console.log(`RUN ${entry.id} · ${entry.kind} · ${entry.reference.length} reference notes`);
    const started = performance.now();
    const result = await page.evaluate(async ({ id, mode, base64, mime, fileName }) => {
      const { importAudioFile } = await import('/src/lib/midi-stage/audio-import.ts');
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 240000);
      const firstWorker = window.benchmarkWorkers.length;
      window.benchmarkProgress = { id, phase: 'checking' };
      try {
        const result = await importAudioFile(new File([bytes], fileName, { type: mime }), { mode, signal: controller.signal,
          onProgress: (progress) => { window.benchmarkProgress = { id, ...progress }; } });
        return { status: 'imported', notes: result.chart.parts.find((part) => part.type === mode).notes,
          rawEvents: window.benchmarkWorkers.slice(firstWorker).flatMap((worker) => worker.events ?? []),
          chartDuration: result.chart.duration, audioOffset: result.chart.audioOffset, warnings: result.warnings };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const empty = /^(No clear keyboard notes|No clear bass notes|No playable guitar notes|Not enough distinct drum-like attacks|This (keyboard source|song) is silent or too quiet)/.test(message);
        return { status: empty ? 'no-detections' : 'error', notes: [],
          rawEvents: window.benchmarkWorkers.slice(firstWorker).flatMap((worker) => worker.events ?? []), error: message };
      } finally { clearTimeout(timer); }
    }, { id: entry.id, mode: entry.instrument, base64: entry.audio.toString('base64'), mime: entry.mime, fileName: entry.fileName });
    assert.equal(await page.evaluate(() => window.benchmarkWorkers.every((worker) => !worker.active)), true, 'Import must release its real worker');
    const metrics = scoreTranscription(entry.reference, result.notes, report.policy);
    const rawMetrics = result.rawEvents.length ? scoreTranscription(entry.reference, result.rawEvents.map((event) => ({
      time: event.startTimeSeconds, duration: event.durationSeconds, pitch: event.pitchMidi,
    })), report.policy) : null;
    if (result.status === 'imported') assert.ok(Math.abs(result.chartDuration - entry.duration) < 1e-6 && result.audioOffset === 0, 'Import preserves the source timeline');
    const floor = policy.cases[entry.id];
    assert.ok(floor || recordOnly, `Missing regression policy for ${entry.id}`);
    if (floor?.diagnosticOnly) assert.ok(typeof floor.reason === 'string' && floor.reason.trim(), 'Diagnostic cases need an explanation');
    const passed = result.status !== 'error' && (floor?.diagnosticOnly ? null : floor ? benchmarkPass(metrics, floor) : null);
    const regressionStatus = result.status === 'error' ? 'import error' : floor?.diagnosticOnly ? 'diagnostic' : passed === null ? 'recorded' : passed ? 'pass' : 'FAIL';
    report.cases.push({ id: entry.id, instrument: entry.instrument, kind: entry.kind, sourceId: entry.sourceId, audioSha256: sha256(entry.audio),
      elapsedMs: Math.round(performance.now() - started), ...result, reference: entry.reference, metrics, rawMetrics, regressionFloor: floor ?? null, regressionStatus, passed });
    console.log(`${result.status} ${entry.id}: F1=${metrics.f1.toFixed(3)}, missed=${metrics.falseNegatives}, extra=${metrics.falsePositives}, octave=${metrics.octaveErrors}, hold MAE=${metrics.meanDurationErrorMs?.toFixed(1) ?? 'unannotated'} ms`);
    await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  }
  await page.screenshot({ path: `${output}/benchmark-desktop.png` });
} finally { await browser.close(); }

assert.ok(modelRequests.every((request) => new URL(request).origin === new URL(url).origin), 'The model must load locally');
report.modelRequests = modelRequests.map((request) => new URL(request).pathname);
report.browserErrors = errors;
report.passed = !errors.length && report.cases.every((entry) => entry.status !== 'error' && (recordOnly || entry.regressionFloor?.diagnosticOnly || entry.passed));
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
await writeFile(`${output}/report.md`, renderTranscriptionReport(report));
if (!report.passed) { console.error('FAIL: import errors, browser errors or a regression floor failed. See report.json.'); process.exitCode = 1; }
else console.log(`PASS: ${report.cases.length} real import runs; reports: ${output}/report.md and report.json${recordOnly ? ' (quality floors recorded without gating)' : ''}`);
