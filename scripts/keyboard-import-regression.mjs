#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { keyboardPairFixture } from './fixtures/keyboard-draft.mjs';
import { drumWav } from './fixtures/drum-draft.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const uiOnly = process.argv.includes('--ui-only');
const output = resolve(process.env.SESSION_SCREENSHOT_DIR || '/workspace/screenshots/keyboard-import');
assert.ok(output.startsWith('/workspace/screenshots/')); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let phase = 'loading';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(60000);
  const errors = [], models = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().includes('/models/basic-pitch/')) models.push(request.url()); });
  await page.addInitScript(() => {
    window.modelWorkers = [];
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args); this.active = true; this.phase = '';
        window.modelWorkers.push(this);
        this.addEventListener('message', ({ data }) => { if (data.type === 'progress') this.phase = data.phase; });
      }
      terminate() { this.active = false; super.terminate(); }
    };
    const input = Object.assign(new EventTarget(), { id: 'keyboard-draft-midi', name: 'Keyboard draft QA', state: 'connected' });
    const access = Object.assign(new EventTarget(), { inputs: new Map([[input.id, input]]) });
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
    window.keysMidi = (pitch, on = true) => {
      const event = new Event('midimessage'); Object.defineProperty(event, 'data', { value: new Uint8Array([on ? 0x90 : 0x80, pitch, on ? 100 : 0]) }); input.dispatchEvent(event);
    };
  });
  const probe = () => page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const { StageRenderer } = await import('/src/lib/midi-stage/renderer.ts');
    const data = window.keyboardProbe = { time: -1, live: null, audio: null };
    const begin = AudioEngine.prototype.begin;
    AudioEngine.prototype.begin = function (options) { data.audio = this; return begin.call(this, options); };
    AudioEngine.prototype.songAt = function () { return data.time; };
    const draw = StageRenderer.prototype.draw;
    StageRenderer.prototype.draw = function (state) { data.live = state; return draw.call(this, state); };
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.locator('.pad').first().waitFor();
  if (!uiOnly) await probe();
  assert.equal(models.length, 0, 'the model stays unloaded until keyboard audio import');
  const library = page.getByRole('dialog', { name: 'Your songs', exact: true });
  const open = async () => {
    const importButton = page.getByRole('button', { name: 'Import songs', exact: true });
    if (await importButton.isVisible()) await importButton.click();
    else { await page.keyboard.press('Control+k'); await page.getByRole('dialog', { name: 'Stage finder', exact: true }).locator('[data-command-id="import"]').click(); }
    await library.waitFor();
  };
  const ready = async () => {
    await Promise.race([
      library.getByRole('heading', { name: 'Review the keyboard draft', exact: true }).waitFor(),
      library.getByRole('alert').waitFor().then(async () => { throw new Error(await library.getByRole('alert').innerText()); }),
    ]);
    const box = await library.getByRole('button', { name: 'Close song library', exact: true }).boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= 1000);
  };
  const add = library.getByRole('button', { name: 'Add to setlist', exact: true });
  const apply = library.getByRole('button', { name: 'Apply corrections', exact: true });
  const pair = keyboardPairFixture();
  const files = { backing: drumWav(pair.backing), stem: drumWav(pair.stem) };
  const choosePair = async () => {
    await library.getByRole('button', { name: 'Keys (draft)', exact: true }).click();
    const form = library.locator('details').filter({ hasText: 'Use a separated keyboard stem' });
    if (!(await form.evaluate((el) => el.open))) await form.locator('summary').click();
    await form.getByLabel('Original song for keyboard stem', { exact: true }).setInputFiles({ name: 'Keyboard Study.wav', mimeType: 'audio/wav', buffer: files.backing });
    await form.getByLabel('Keyboard stem for highway', { exact: true }).setInputFiles({ name: 'piano.wav', mimeType: 'audio/wav', buffer: files.stem });
    return form.getByRole('button', { name: 'Build from keyboard stem', exact: true });
  };
  phase = 'real Basic Pitch worker and paired stem';
  await open(); let build = await choosePair();
  await page.screenshot({ path: `${output}/keyboard-stem-files-desktop.png` });
  await build.click(); await ready();
  assert.ok(models.some((u) => u.endsWith('model.json')) && models.some((u) => u.endsWith('.bin')));
  assert.ok(models.every((u) => new URL(u).origin === new URL(url).origin));
  assert.equal(await page.evaluate(() => window.modelWorkers.every((w) => !w.active)), true);
  await library.getByText('Analysis stem: piano.wav. The original song supplies backing audio.', { exact: true }).waitFor();
  assert.equal(await library.locator('tbody tr').count(), 5, 'controlled five-note chord/melody fixture');
  const detected = await library.locator('tbody tr').evaluateAll((rows) => rows.map((row) => ({
    time: Number(row.querySelector('input[aria-label$="time"]').value),
    duration: Number(row.querySelector('input[aria-label$="length"]').value),
    pitch: Number(row.querySelector('select').value),
  })));
  for (const expected of pair.stem.events) assert.ok(detected.some((note) => note.pitch === expected.pitch
    && Math.abs(note.time - expected.time) < 0.04 && Math.abs(note.duration - expected.duration) < 0.12),
  `missing/incorrect fixture note ${expected.pitch} at ${expected.time}s`);
  assert.equal(await library.getByLabel('Note 1 pitch', { exact: true }).inputValue(), '60');
  assert.ok(Math.abs(Number(await library.getByLabel('Note 1 time', { exact: true }).inputValue()) - 0.6) < 0.04);
  phase = 'keyboard pitch, hold and count-in corrections';
  await library.getByLabel('Note 1 length', { exact: true }).fill('7'); await apply.click();
  await library.getByRole('alert').filter({ hasText: /fit inside the recording/ }).waitFor();
  assert.equal(await add.isDisabled(), true);
  await library.getByLabel('Note 1 pitch', { exact: true }).selectOption('61');
  await library.getByLabel('Note 1 time', { exact: true }).fill('0.62');
  await library.getByLabel('Note 1 length', { exact: true }).fill('1.1');
  await library.getByLabel('Keyboard count-in tempo', { exact: true }).fill('90'); await apply.click();
  await library.getByRole('heading', { name: 'Review the keyboard draft', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/keyboard-draft-review-desktop.png` });
  const downloading = page.waitForEvent('download'); await library.getByRole('button', { name: 'Download chart', exact: true }).click();
  const chartPath = `${output}/keyboard-draft.midistage.json`; await (await downloading).saveAs(chartPath);
  const chart = JSON.parse(await readFile(chartPath, 'utf8'));
  assert.equal(chart.origin, 'audio-keys-draft'); assert.equal(chart.matching, undefined);
  assert.equal(chart.duration, 6); assert.equal(chart.bpm, 90); assert.equal(chart.audioName, 'Keyboard Study.wav');
  assert.ok(chart.parts[1].notes.some((n) => n.pitch === 61 && n.time === 0.62 && n.duration === 1.1));
  assert.ok(chart.parts[1].notes.some((n) => n.pitch === 72 && Math.abs(n.time - 3) < 0.04));
  assert.ok(chart.parts[1].notes.every((n) => n.time >= 0.55 && n.time + n.duration <= 4));
  await add.click(); await library.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { level: 2, name: 'Keyboard Study', exact: true }).waitFor();
  let savedId;
  if (!uiOnly) {
    phase = 'pitched keyboard MIDI, holds and original backing reload';
    await page.waitForFunction(() => window.keyboardProbe.live?.song.audioAssetId);
    savedId = await page.evaluate(() => window.keyboardProbe.live.song.id);
    assert.deepEqual(await page.evaluate(() => window.keyboardProbe.live.players.filter((p) => p.enabled).map((p) => p.id)), ['keys']);
    await page.getByRole('button', { name: 'Connect MIDI', exact: true }).first().click();
    const transport = page.getByRole('group', { name: 'Playback controls', exact: true });
    await transport.getByRole('button', { name: 'Start set', exact: true }).click();
    await page.waitForFunction(() => window.keyboardProbe.audio?.backingSource);
    assert.equal(await page.evaluate(() => window.keyboardProbe.audio.backingSource.buffer.duration), 6);
    await page.evaluate(() => { window.keyboardProbe.time = 0.62; window.keysMidi(60); });
    assert.equal(await page.evaluate(() => window.keyboardProbe.live.judges.get('keys').stats.perfect), 0);
    await page.evaluate(() => { for (const pitch of [61, 64, 67]) window.keysMidi(pitch); });
    await page.waitForFunction(() => window.keyboardProbe.live.judges.get('keys').stats.perfect === 3);
    assert.equal(await page.evaluate(() => window.keyboardProbe.live.judges.get('keys').activeHolds.size), 3);
    await page.evaluate(() => { window.keyboardProbe.time = 1.8; });
    await page.waitForFunction(() => window.keyboardProbe.live.judges.get('keys').notes.filter((n) => n.hold === 'complete').length === 3);
    await transport.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.screenshot({ path: `${output}/keyboard-draft-highway-desktop.png` });
    await page.getByRole('button', { name: 'Reset set', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.pad').first().waitFor(); await probe();
    await page.waitForFunction(() => window.keyboardProbe.live?.song.audioAssetId);
    assert.equal(await page.evaluate(() => window.keyboardProbe.live.song.id), savedId);
    assert.equal(await page.evaluate(() => window.keyboardProbe.live.status), 'ready');
    await transport.getByRole('button', { name: 'Start set', exact: true }).click();
    await page.waitForFunction(() => window.keyboardProbe.audio?.backingSource);
    assert.equal(await page.evaluate(() => window.keyboardProbe.audio.backingSource.buffer.duration), 6);
    await page.getByRole('button', { name: 'Reset set', exact: true }).click();
  }
  phase = 'JSON review replacement and original restore';
  await open();
  await library.getByLabel('Choose song file', { exact: true }).setInputFiles({ name: 'Reviewed keys.midistage.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(chart)) });
  await ready();
  while (await library.getByRole('button', { name: 'Remove note 1', exact: true }).count()) await library.getByRole('button', { name: 'Remove note 1', exact: true }).click();
  await library.getByRole('button', { name: 'Add note', exact: true }).click(); await apply.click();
  assert.equal(await add.isEnabled(), true);
  await library.getByRole('button', { name: 'Restore original', exact: true }).click();
  assert.equal(await library.locator('tbody tr').count(), 5);
  phase = 'cancel running inference and release model worker';
  build = await choosePair(); await build.click();
  await page.waitForFunction(() => window.modelWorkers.some((w) => w.active && w.phase === 'analyzing'));
  await library.getByRole('button', { name: 'Cancel import', exact: true }).click();
  assert.equal(await page.evaluate(() => window.modelWorkers.every((w) => !w.active)), true);
  await page.waitForTimeout(200);
  assert.equal(await library.getByRole('heading', { name: 'Review the keyboard draft', exact: true }).count(), 0);
  assert.equal(await add.count(), 0);
  phase = 'model loading failure';
  await page.route('**/models/basic-pitch/model.json', (route) => route.abort());
  await build.click();
  await library.getByRole('alert').filter({ hasText: /Keyboard model could not load/ }).waitFor();
  assert.equal(await page.evaluate(() => window.modelWorkers.every((w) => !w.active)), true);
  await library.getByRole('button', { name: 'Close song library', exact: true }).click();
  if (!uiOnly) assert.equal(await page.evaluate(() => window.keyboardProbe.live.song.id), savedId);
  assert.deepEqual(errors, []);
  console.log(`PASS: real local Basic Pitch model, five-note chord/melody fixture, stem timing/backing separation, pitch/length/count-in review, canonical export, replace/restore, worker cancellation and load failure${uiOnly ? '' : ', keyboard MIDI/holds and saved backing reload'}. Desktop only.`);
} catch (error) {
  console.error(`Keyboard import phase: ${phase}`);
  const page = browser.contexts()[0]?.pages()[0];
  if (page) { await page.screenshot({ path: `${output}/keyboard-draft-failure.png` }).catch(() => {}); console.error(await page.locator('body').innerText().catch(() => 'Page unavailable')); }
  throw error;
} finally { await browser.close(); }
