#!/usr/bin/env node
// Real UI, renderer and Web Audio; hold only the clock / delivery of audio
// initialization so failed and cancelled starts can be checked deterministically.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const key = 'midi-stage/rehearsal-bookmark';
const routeKey = 'midi-stage-midi-routes/v1';
const output = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
if (output) {
  assert.ok(output === '/workspace/screenshots' || output.startsWith('/workspace/screenshots/'));
  await mkdir(output, { recursive: true });
}
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let phase = 'loading';

try {
  const frames = () => page.evaluate(() => new Promise((done) => {
    let count = 0;
    const next = () => ++count === 4 ? done() : requestAnimationFrame(next);
    requestAnimationFrame(next);
  }));
  const screenshot = async (name) => {
    if (output) await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  };
  const start = page.getByRole('button', { name: 'Start set', exact: true });
  const reset = page.getByRole('button', { name: 'Reset set', exact: true });
  const section = page.getByRole('combobox', { name: 'Practice section', exact: true });
  const difficulty = page.getByRole('combobox', { name: 'DIFFICULTY', exact: true });
  const tempo = page.getByRole('combobox', { name: 'TEMPO', exact: true });
  const guide = page.getByRole('checkbox', { name: 'Guide part', exact: true });
  const click = page.getByRole('checkbox', { name: 'Click', exact: true });
  const strum = page.getByRole('checkbox', { name: 'Strum arrows', exact: true });
  const repeat = page.getByRole('checkbox', { name: 'Repeat section', exact: true });
  const master = page.getByRole('slider', { name: 'Master volume', exact: true });
  const card = page.locator('.rehearsal-bookmark-card');
  const continueButton = card.getByRole('button', { name: /^Continue rehearsal:/ });
  const finder = page.getByRole('dialog', { name: 'Stage finder', exact: true });
  const command = (id) => finder.locator(`[data-command-id="${id}"]`);
  const readBookmark = () => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? 'null'), key);
  const seedBookmark = (value) => page.evaluate(({ storageKey, value }) => localStorage.setItem(storageKey, JSON.stringify(value)), { storageKey: key, value });
  const chooseCommand = async (id) => {
    await page.keyboard.press('Control+k');
    await finder.waitFor();
    await command(id).click();
    await finder.waitFor({ state: 'hidden' });
    await frames();
  };
  const instrumentButton = (label) => page.getByRole('complementary', { name: 'Setlist and lineup', exact: true })
    .getByRole('button', { name: new RegExp(`^${label} (ON|OFF)$`) });
  const setInstrument = async (label, enabled) => {
    const button = instrumentButton(label);
    if ((await button.getAttribute('aria-pressed') === 'true') !== enabled) await button.click();
  };
  const installProbe = async () => {
    await page.locator('.pad').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Start set' && !button.disabled));
    await page.evaluate(async () => {
      const { StageRenderer } = await import('/src/lib/midi-stage/renderer.ts');
      const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
      const probe = window.rehearsalProbe = {
        live: null, audio: null, begins: [], settled: 0, time: -1,
        failNext: false, holdInit: false, pendingInit: [],
      };
      const draw = StageRenderer.prototype.draw;
      StageRenderer.prototype.draw = function (state) { probe.live = state; return draw.call(this, state); };
      AudioEngine.prototype.songAt = function () { return probe.time; };
      const init = AudioEngine.prototype.init;
      AudioEngine.prototype.init = async function () {
        await init.call(this);
        if (probe.holdInit) await new Promise((done) => probe.pendingInit.push(done));
      };
      const begin = AudioEngine.prototype.begin;
      AudioEngine.prototype.begin = async function (options) {
        probe.audio = this;
        probe.begins.push(options);
        try {
          if (probe.failNext) { probe.failNext = false; throw new Error('Audio setup interrupted for this check'); }
          return await begin.call(this, options);
        } finally { probe.settled++; }
      };
    });
    await page.waitForFunction(() => window.rehearsalProbe.live);
  };
  const reload = async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await installProbe();
  };
  const assertReady = async () => {
    await frames();
    assert.equal(await start.isEnabled(), true);
    assert.equal(await page.evaluate(() => window.rehearsalProbe.live.status), 'ready');
    assert.equal(await page.evaluate(() => window.rehearsalProbe.audio?.running ?? false), false);
  };
  const begin = async (demo = false) => {
    const before = await page.evaluate(() => window.rehearsalProbe.begins.length);
    await (demo ? page.getByRole('button', { name: 'Watch the house', exact: true }) : start).click();
    await page.waitForFunction((count) => window.rehearsalProbe.begins.length === count + 1
      && window.rehearsalProbe.live.status === 'playing' && window.rehearsalProbe.audio.running, before);
  };

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await installProbe();
  await chooseCommand('song:neon-circuit');
  await difficulty.selectOption('chill');
  await tempo.selectOption('0.75');
  await setInstrument('Guitar', true);
  await guide.check();
  await click.check();
  await strum.check();
  const passage = await page.evaluate(async () => {
    const { catalog } = await import('/src/lib/midi-stage/songs.ts');
    const { practiceSections } = await import('/src/lib/midi-stage/practice.ts');
    return practiceSections(catalog('chill').find((song) => song.id === 'neon-circuit'))[1];
  });
  assert.ok(passage);
  await section.selectOption(passage.id);
  await repeat.uncheck();
  await frames();
  assert.equal(await readBookmark(), null, 'Selecting a passage must not save an unplayed rehearsal');

  phase = 'failed and cancelled starts do not save';
  console.log('Checking:', phase);
  await page.evaluate(() => { window.rehearsalProbe.failNext = true; });
  await start.click();
  await page.getByText('Audio setup interrupted for this check', { exact: true }).waitFor();
  await assertReady();
  assert.equal(await readBookmark(), null);
  await page.evaluate(() => { window.rehearsalProbe.holdInit = true; });
  await start.click();
  await page.waitForFunction(() => window.rehearsalProbe.pendingInit.length === 1);
  await reset.click();
  await page.evaluate(() => {
    const probe = window.rehearsalProbe;
    probe.holdInit = false;
    probe.pendingInit.splice(0).forEach((done) => done());
  });
  await page.waitForFunction(() => window.rehearsalProbe.settled === 2);
  await assertReady();
  assert.equal(await readBookmark(), null, 'A cancelled audio startup must not create a bookmark');

  phase = 'successful practice saves the complete rehearsal';
  console.log('Checking:', phase);
  await begin();
  const saved = await readBookmark();
  assert.deepEqual(saved, {
    version: 1, songId: 'neon-circuit', section: { id: passage.id, start: passage.start, end: passage.end },
    setup: { difficulty: 'chill', speed: 0.75, enabledPlayers: ['keys', 'guitar'], guide: true, strumGuide: true, metronome: true, repeat: false },
  });
  await reset.click();
  await section.selectOption('');
  await assertReady();
  await card.waitFor();
  assert.deepEqual(await readBookmark(), saved, 'Leaving practice must retain the rehearsal');

  phase = 'full-song play and autoplay preserve the rehearsal';
  console.log('Checking:', phase);
  await chooseCommand('song:open-stage');
  await begin();
  assert.deepEqual(await readBookmark(), saved);
  await reset.click();
  await section.selectOption(await section.locator('option').nth(1).getAttribute('value'));
  await begin(true);
  assert.deepEqual(await readBookmark(), saved, 'Watching a different passage must not overwrite human practice');
  await reset.click();
  await section.selectOption('');

  phase = 'reload and keyboard card restore without starting';
  console.log('Checking:', phase);
  await difficulty.selectOption('expert');
  await tempo.selectOption('1.25');
  await guide.uncheck();
  await click.uncheck();
  await strum.uncheck();
  await setInstrument('Guitar', false);
  await master.press('Home');
  await master.press('ArrowRight');
  await chooseCommand('soundcheck');
  await page.getByRole('combobox', { name: 'Keys MIDI input', exact: true }).selectOption('off');
  await page.getByRole('button', { name: 'Close soundcheck', exact: true }).click();
  await page.getByRole('button', { name: 'Focus stage', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('rehearsal-regression/unrelated', 'keep me'));
  const routes = await page.evaluate((storageKey) => localStorage.getItem(storageKey), routeKey);
  await frames();
  await reload();
  await card.waitFor();
  await assertReady();
  assert.equal(await section.inputValue(), '', 'Reload must offer the bookmark without entering practice');
  assert.equal(await page.evaluate(() => window.rehearsalProbe.begins.length), 0);
  await screenshot('rehearsal-bookmark-desktop');
  await continueButton.focus();
  await page.keyboard.press('Enter');

  const assertRestored = async () => {
    await assertReady();
    assert.equal(await section.inputValue(), passage.id);
    assert.equal(await difficulty.inputValue(), 'chill');
    assert.equal(await tempo.inputValue(), '0.75');
    assert.equal(await guide.isChecked(), true);
    assert.equal(await click.isChecked(), true);
    assert.equal(await strum.isChecked(), true);
    assert.equal(await repeat.isChecked(), false);
    assert.deepEqual(await page.evaluate(() => window.rehearsalProbe.live.players.filter((player) => player.enabled).map((player) => player.id)), ['keys', 'guitar']);
    assert.equal(await master.inputValue(), '1', 'Restoring rehearsal must preserve current master volume');
    assert.equal(await page.locator('.stage-shell').evaluate((element) => element.classList.contains('stage-focused')), true);
    assert.equal(await page.evaluate((storageKey) => localStorage.getItem(storageKey), routeKey), routes);
    assert.equal(await page.evaluate(() => window.rehearsalProbe.begins.length), 0, 'Continue must wait for an explicit Start');
    assert.equal(await page.evaluate(() => window.rehearsalProbe.live.song.id), 'neon-circuit');
    assert.equal(await page.evaluate(() => window.rehearsalProbe.live.song.duration), passage.end - passage.start);
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Start set');
    assert.equal(await card.count(), 0, 'The resume card must give way to the selected practice controls');
  };
  await assertRestored();

  phase = 'Stage Finder restores by keyboard';
  console.log('Checking:', phase);
  await section.selectOption('');
  await tempo.selectOption('1');
  await page.keyboard.press('Control+k');
  await finder.waitFor();
  await finder.getByRole('combobox').fill('Continue rehearsal');
  await page.waitForFunction(() => document.querySelector('[data-command-id="continue-rehearsal"]')?.getAttribute('data-selected') === 'true');
  await page.keyboard.press('Enter');
  await finder.waitFor({ state: 'hidden' });
  await assertRestored();

  phase = 'mobile touch, reduced motion and isolated forget';
  console.log('Checking:', phase);
  await section.selectOption('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card.waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  for (const button of await card.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    assert.ok(bounds && bounds.height >= 44 && bounds.width >= 44, 'Bookmark actions need 44px touch targets');
  }
  await screenshot('rehearsal-bookmark-mobile');
  await continueButton.tap();
  await assertRestored();
  await screenshot('rehearsal-restored-mobile');
  await section.selectOption('');
  await card.getByRole('button', { name: 'Forget saved rehearsal', exact: true }).tap();
  await frames();
  assert.equal(await readBookmark(), null);
  assert.equal(await card.count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('rehearsal-regression/unrelated')), 'keep me');
  assert.equal(await page.evaluate((storageKey) => localStorage.getItem(storageKey), routeKey), routes);
  await page.keyboard.press('Control+k');
  await finder.waitFor();
  assert.equal(await command('continue-rehearsal').count(), 0);
  await page.keyboard.press('Escape');

  phase = 'stale song and changed passage saves are discarded';
  console.log('Checking:', phase);
  for (const stale of [
    { ...saved, songId: 'removed-import-no-longer-in-library' },
    { ...saved, section: { ...saved.section, end: saved.section.end + 0.25 } },
  ]) {
    await seedBookmark(stale);
    await reload();
    await assertReady();
    assert.equal(await readBookmark(), null, 'Unavailable songs and changed boundaries must discard stale bookmarks');
    assert.equal(await card.count(), 0);
    await page.keyboard.press('Control+k');
    await finder.waitFor();
    assert.equal(await command('continue-rehearsal').count(), 0);
    await page.keyboard.press('Escape');
  }

  phase = 'blocked storage keeps the rehearsal for this visit';
  console.log('Checking:', phase);
  await page.evaluate((storageKey) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === storageKey) throw new DOMException('Storage is full', 'QuotaExceededError');
      return set.call(this, name, value);
    };
  }, key);
  await section.selectOption(passage.id);
  await begin();
  await page.getByText(/^Rehearsal kept for this visit\./).waitFor();
  assert.equal(await readBookmark(), null);
  await reset.click();
  await section.selectOption('');
  await card.waitFor();
  const startsBeforeContinue = await page.evaluate(() => window.rehearsalProbe.begins.length);
  await continueButton.tap();
  await assertReady();
  assert.equal(await section.inputValue(), passage.id);
  assert.equal(await page.evaluate(() => window.rehearsalProbe.begins.length), startsBeforeContinue);
  assert.deepEqual(errors, []);
  console.log('PASS: successful human practice saves exact setup; failed/cancelled starts, full-song and autoplay do not overwrite; reload/card/Finder restore ready without audio; current volume/focus/MIDI routes retained; mobile targets and overflow; isolated forget; stale saves discarded; blocked storage retains rehearsal for this visit');
} catch (error) {
  console.error('Rehearsal bookmark regression failed during:', phase, error);
  console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
  if (output) await page.screenshot({ path: `${output}/rehearsal-bookmark-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
