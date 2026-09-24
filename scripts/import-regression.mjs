#!/usr/bin/env node
// Run against npm run dev. Exercise local file selection, preview, persistence
// and scoring through the real React UI; control only the performance clock.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const screenshotDir = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
if (screenshotDir) {
  assert.ok(screenshotDir === '/workspace/screenshots' || screenshotDir.startsWith('/workspace/screenshots/'),
    'Import screenshots must be stored under /workspace/screenshots');
  await mkdir(screenshotDir, { recursive: true });
}

const chartFile = (title, type = 'keys') => ({
  name: `${title.toLowerCase().replaceAll(' ', '-')}.midistage.json`,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({
    schema: 'midi-stage-chart', version: 1, id: `fixture-${type}`, title, bpm: 120, duration: 4,
    parts: ['drums', 'keys', 'guitar', 'bass'].map((part) => ({
      type: part,
      notes: part === type
        ? [1, 2, 3].map((time, index) => ({ time, duration: 0.5, pitch: type === 'drums' ? [36, 38, 42][index] : 60 + index * 2, velocity: 105 }))
        : [],
    })),
  })),
});

function midiFile(name, keys = true) {
  const vlq = (number) => {
    const bytes = [number & 127];
    while ((number >>= 7)) bytes.unshift((number & 127) | 128);
    return bytes;
  };
  const events = [
    0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, // Constant 120 BPM.
    0, 0xc0, 0, // Acoustic piano, channel 1.
    0, 0xc1, 32, // Acoustic bass, channel 2.
    ...vlq(960), 0x91, 36, 100, // First note at one second.
    ...(keys ? [0, 0x90, 60, 110, 0, 0x90, 64, 110] : []),
    ...vlq(480), 0x81, 36, 0,
    ...(keys ? [0, 0x80, 60, 0, 0, 0x80, 64, 0] : []),
    ...vlq(480), 0xff, 0x2f, 0,
  ];
  const trackLength = Buffer.alloc(4);
  trackLength.writeUInt32BE(events.length);
  return {
    name, mimeType: 'audio/midi',
    buffer: Buffer.concat([
      Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0]),
      Buffer.from('MTrk'), trackLength, Buffer.from(events),
    ]),
  };
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
const navigations = [];
let phase = 'initializing browser';
page.on('pageerror', (error) => errors.push(error.message));
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) navigations.push({ url: frame.url(), at: Date.now() });
});
page.setDefaultTimeout(10000);
try {
  await page.addInitScript(() => {
    window.midiPermissionRequests = 0;
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: async () => { window.midiPermissionRequests++; throw new Error('File import must not request MIDI hardware access'); },
    });
  });
  const frames = () => page.evaluate(() => new Promise((done) => {
    let count = 0;
    const next = () => ++count === 8 ? done() : requestAnimationFrame(next);
    requestAnimationFrame(next);
  }));
  const hydrated = async () => {
    await page.locator('.pad').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')]
      .some((button) => button.textContent.trim() === 'Start set' && !button.disabled));
    await frames();
  };
  const installProbe = () => page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const { Judge, KEYS } = await import('/src/lib/midi-stage/engine.ts');
    const probe = window.importProbe = { time: -1, audio: null, judge: null, beginCalls: 0, hitCalls: 0, keys: KEYS };
    const begin = AudioEngine.prototype.begin;
    AudioEngine.prototype.begin = function (options) {
      probe.audio = this;
      probe.lastOptions = options;
      probe.beginCalls++;
      return begin.call(this, options);
    };
    AudioEngine.prototype.songAt = function () { return probe.time; };
    const tick = Judge.prototype.tick;
    Judge.prototype.tick = function (time) { probe.judge = this; return tick.call(this, time); };
    const hit = Judge.prototype.hit;
    Judge.prototype.hit = function (...args) { probe.hitCalls++; return hit.apply(this, args); };
  });
  const dialog = page.getByRole('dialog', { name: 'Your songs', exact: true });
  const start = page.getByRole('button', { name: 'Start set', exact: true });
  const openLibrary = async (keyboard = false) => {
    phase = 'opening song library';
    const button = page.getByRole('button', { name: 'Import songs', exact: true });
    if (!await button.isVisible()) await page.getByRole('button', { name: 'Open setlist', exact: true }).click();
    if (keyboard) {
      await button.focus();
      await page.keyboard.press('Enter');
    } else await button.click();
    await dialog.waitFor();
  };
  const upload = async (file) => {
    phase = `reading ${file.name}`;
    await dialog.getByLabel('Choose song file', { exact: true }).setInputFiles(file);
    await frames();
  };
  const assertPreviewFocused = async (title) => {
    await page.waitForFunction((name) => document.activeElement?.id === 'song-preview-title'
      && document.activeElement.textContent === name, title);
    assert.match(await dialog.getByRole('status').filter({ hasText: `${title} is ready.` }).innerText(), /add it to your setlist/,
      'completed imports must announce the next action');
  };
  const add = async (title) => {
    phase = `adding ${title}: clicking Add to setlist`;
    await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).click();
    phase = `adding ${title}: waiting for library to close`;
    await dialog.waitFor({ state: 'hidden' });
    phase = `adding ${title}: waiting for selected heading`;
    await page.getByRole('heading', { level: 2, name: title, exact: true }).waitFor();
    phase = `adding ${title}: checking ready state`;
    await frames();
    assert.equal(await start.isEnabled(), true, 'import selection must be ready, without autoplay');
  };
  const assertReady = async () => {
    assert.equal(await start.isEnabled(), true);
    assert.equal(await page.getByLabel('Elapsed time', { exact: true }).innerText(), '00:00');
    assert.equal(await page.evaluate(() => window.importProbe.audio?.running ?? false), false);
  };
  const screenshot = async (name) => {
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
  };

  phase = 'loading stage';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await hydrated();
  await installProbe();
  await openLibrary(true);
  assert.equal(await page.evaluate(() => window.importProbe.beginCalls), 0,
    'Enter on Import songs must open the dialog without also starting playback');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await assertReady();
  assert.equal(await page.getByRole('button', { name: 'Import songs', exact: true }).evaluate((button) => document.activeElement === button), true,
    'closing the library must return keyboard focus to the opener');
  assert.equal(await page.evaluate(() => window.importProbe.beginCalls), 0, 'Escape must close the import dialog without starting a set');

  await openLibrary();
  await upload({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').innerText(), /JSON|chart|valid/i);
  assert.equal(await dialog.getByRole('alert').evaluate((alert) => document.activeElement === alert), true,
    'a rejected import must move keyboard focus to its recovery message');
  assert.equal(await page.getByRole('heading', { level: 2, name: 'Open Stage', exact: true }).count(), 1,
    'a rejected file must leave the selected song unchanged');
  await upload({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('unsupported-file') });
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').innerText(), /MIDI|chart|supported|audio/i);

  const keysFile = chartFile('Imported Rehearsal');
  await upload(keysFile);
  await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).waitFor();
  await assertPreviewFocused('Imported Rehearsal');
  await page.keyboard.press('Tab');
  assert.equal(await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).evaluate((button) => document.activeElement === button), true,
    'the next Tab after the preview heading must reach Add to setlist');
  await frames();
  assert.equal(await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).evaluate((button) => document.activeElement === button), true,
    'live stage HUD updates must not steal focus back from Add to setlist');
  assert.match(await dialog.innerText(), /3\s+notes/i, 'JSON preview must count the actual notes');
  assert.match(await dialog.innerText(), /Keys/);
  await screenshot('import-preview-desktop.png');
  await add('Imported Rehearsal');
  phase = 'selecting Expert difficulty for imported chart';
  await page.getByRole('combobox', { name: /DIFFICULTY/ }).selectOption('expert');
  phase = 'starting Imported Rehearsal';
  await start.click();
  phase = 'waiting for imported chart playback';
  await page.waitForFunction(() => window.importProbe.audio?.running && window.importProbe.judge);
  phase = 'scoring imported chart note and sustain';
  await page.evaluate(() => {
    const probe = window.importProbe;
    if (probe.lastOptions.song.name !== 'Imported Rehearsal') throw new Error('Playback did not receive the imported song');
    if (probe.lastOptions.song.parts.find((part) => part.type === 'keys').notes.length !== 3)
      throw new Error('Changing difficulty lost imported source notes');
    const note = probe.judge.notes.find((entry) => entry.pitch === 60 && entry.time === 1);
    if (!note) throw new Error('Imported note must reach the real Judge');
    probe.time = note.time;
    const code = probe.keys.keys[note.lane];
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    if (probe.judge.stats.score <= 0 || probe.hitCalls !== 1) throw new Error('Imported note did not score through mapped keyboard input');
    probe.time = note.time + note.duration;
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    if (note.hold !== 'complete') throw new Error('Imported sustain did not complete');
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Reset set', exact: true }).click();
  await assertReady();

  await openLibrary();
  await dialog.getByRole('button', { name: 'Remove Imported Rehearsal', exact: true }).click();
  await page.evaluate((fileName) => {
    const readText = File.prototype.text;
    File.prototype.text = function () {
      const result = readText.call(this);
      if (this.name !== fileName) return result;
      File.prototype.text = readText;
      return new Promise((resolve, reject) => {
        window.finishImportRead = () => result.then(resolve, reject);
      });
    };
  }, keysFile.name);
  await upload(keysFile);
  await dialog.getByRole('status').filter({ hasText: 'Reading your song' }).waitFor();
  for (const name of ['Play Imported Rehearsal', 'Remove Imported Rehearsal', 'Remove song', 'Keep']) {
    assert.equal(await dialog.getByRole('button', { name, exact: true }).isDisabled(), true,
      `${name} must wait until file processing finishes`);
  }
  assert.equal(await dialog.getByRole('button', { name: 'Close song library', exact: true }).isEnabled(), true,
    'file processing must remain dismissible');
  await page.evaluate(() => window.finishImportRead());
  await assertPreviewFocused('Imported Rehearsal');
  assert.equal(await dialog.getByRole('button', { name: 'Keep', exact: true }).isEnabled(), true,
    'saved song controls must recover when processing finishes');
  await add('Imported Rehearsal');
  await openLibrary();
  assert.equal(await dialog.getByRole('button', { name: 'Play Imported Rehearsal', exact: true }).count(), 1,
    'importing the same file twice must not duplicate its library entry');
  await dialog.getByRole('button', { name: 'Play Imported Rehearsal', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await hydrated();
  await installProbe();
  await page.getByRole('heading', { level: 2, name: 'Imported Rehearsal', exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: /DIFFICULTY/ }).inputValue(), 'expert');
  await assertReady();

  await openLibrary();
  await upload(chartFile('Drum Room', 'drums'));
  await add('Drum Room');
  assert.ok(await page.getByRole('button', { name: /^Drums .* key$/ }).count() > 0,
    'a drums-only import must select a populated playable part');
  assert.equal(await page.getByRole('button', { name: /^Keys .* key$/ }).count(), 0,
    'an empty imported keys part must not remain the solo player');

  await openLibrary();
  await upload(midiFile('Pocket MIDI.mid'));
  await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).waitFor();
  assert.equal(await dialog.locator('dt').filter({ hasText: /^Keys$/ }).locator('..').locator('dd').innerText(), '2 notes',
    'raw MIDI preview must retain both keys chord notes');
  assert.match(await dialog.locator('dt').filter({ hasText: /^Bass$/ }).locator('..').locator('dd').innerText(), /^1 notes?$/,
    'raw MIDI preview must keep the bass channel in its own part');
  await add('Pocket MIDI');
  assert.ok(await page.getByRole('button', { name: /^Keys .* key$/ }).count() > 0,
    'raw MIDI must enter the playable setlist');
  await page.evaluate(() => { window.importProbe.time = -1; });
  await start.click();
  await page.waitForFunction(() => window.importProbe.audio?.running && window.importProbe.judge);
  await page.evaluate(() => {
    const probe = window.importProbe;
    const parts = probe.lastOptions.song.parts;
    if (probe.lastOptions.song.name !== 'Pocket MIDI' || parts.find((part) => part.type === 'keys').notes.length !== 2 || parts.find((part) => part.type === 'bass').notes.length !== 1)
      throw new Error('MIDI arrangement did not reach playback intact');
    const note = probe.judge.notes.find((entry) => entry.pitch === 60);
    if (!note) throw new Error('MIDI keys note must reach the Judge');
    probe.time = note.time;
    const code = probe.keys.keys[note.lane];
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    if (probe.judge.stats.score <= 0) throw new Error('Raw MIDI note did not score through mapped input');
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.evaluate(() => {
    const probe = window.importProbe;
    probe.pausedMidiJudge = probe.judge;
    probe.pausedMidiScore = probe.judge.stats.score;
  });
  await openLibrary();
  await dialog.getByRole('button', { name: 'Remove Imported Rehearsal', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove song', exact: true }).click();
  await dialog.getByRole('button', { name: 'Play Imported Rehearsal', exact: true }).waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Resume', exact: true }).isEnabled(), true,
    'removing a different library song must preserve the paused take');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(() => window.importProbe.audio.running);
  await frames();
  await page.evaluate(() => {
    const probe = window.importProbe;
    if (probe.judge !== probe.pausedMidiJudge || probe.judge.stats.score !== probe.pausedMidiScore)
      throw new Error('Removing another imported song replaced the paused Judge or score');
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Reset set', exact: true }).click();

  await openLibrary();
  await upload(midiFile('Bass Line.mid', false));
  await add('Bass Line');
  assert.ok(await page.getByRole('button', { name: /^Bass .* key$/ }).count() > 0,
    'a bass-only MIDI must select its populated part');
  await page.getByRole('combobox', { name: /DIFFICULTY/ }).selectOption('chill');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await hydrated();
  await installProbe();
  await page.getByRole('heading', { level: 2, name: 'Bass Line', exact: true }).waitFor();
  await assertReady();
  await openLibrary();
  await dialog.getByRole('button', { name: 'Remove Bass Line', exact: true }).click();
  await page.getByRole('button', { name: 'Remove song', exact: true }).click();
  await dialog.getByRole('button', { name: 'Play Bass Line', exact: true }).waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { level: 2, name: 'Open Stage', exact: true }).waitFor();
  await assertReady();

  await page.setViewportSize({ width: 390, height: 844 });
  await openLibrary();
  await upload(chartFile('Mobile Rehearsal'));
  await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).waitFor();
  await assertPreviewFocused('Mobile Rehearsal');
  await page.getByRole('status').filter({ hasText: 'Song removed from your setlist.' }).waitFor({ state: 'hidden' });
  await frames();
  const previewBounds = await dialog.getByRole('heading', { level: 3, name: 'Mobile Rehearsal', exact: true }).boundingBox();
  const addBounds = await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).boundingBox();
  assert.ok(previewBounds && previewBounds.y >= 0 && previewBounds.y + previewBounds.height <= 844,
    'mobile file processing must bring the preview into view without manual scrolling');
  assert.ok(addBounds && addBounds.y >= 0 && addBounds.y + addBounds.height <= 844,
    'the compact mobile chart preview must reveal Add to setlist');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false,
    'mobile import preview must not overflow horizontally');
  const bounds = await dialog.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391, 'mobile dialog must fit the viewport');
  await screenshot('import-preview-mobile.png');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.midiPermissionRequests), 0,
    'local file imports must not request MIDI hardware permission');
  assert.deepEqual(errors, []);
  console.log('PASS: JSON/MIDI preview and import; focused preview/error recovery; stable keyboard focus; busy library controls; invalid/unsupported file isolation; keyboard scoring and sustain; difficulty-safe chart data; duplicate prevention; reload persistence; populated part selection; safe removal; unrelated removal preserves paused take; Escape; local import without MIDI permission; mobile preview visibility');
} catch (error) {
  // Print the original exception before attempting optional diagnostics. CI may
  // not have /workspace, and an unavailable screenshot must never replace it.
  console.error(`Import regression failed during ${phase}:`, error);
  console.error('Import regression state:', await page.locator('body').innerText().catch(() => 'Page unavailable'), { errors, navigations });
  console.error('Import regression probe:', await page.evaluate(() => ({
    url: location.href,
    focusedControl: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim(),
    transport: [...document.querySelectorAll('.stage-transport button')].map((button) => ({
      label: button.getAttribute('aria-label') || button.textContent.trim(), disabled: button.disabled,
    })),
    selectedOptions: [...document.querySelectorAll('select')].map((select) => select.value),
    beginCalls: window.importProbe?.beginCalls,
    song: window.importProbe?.lastOptions?.song?.name,
    running: window.importProbe?.audio?.running,
    audioState: window.importProbe?.audio?.ctx?.state,
    judge: window.importProbe?.judge?.stats,
  })).catch(() => 'Probe unavailable'));
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'import-failure.png'), fullPage: true })
    .catch((diagnosticError) => console.error('Import failure screenshot unavailable:', diagnosticError));
  throw error;
} finally {
  await browser.close().catch((cleanupError) => console.error('Browser cleanup failed:', cleanupError));
}
