#!/usr/bin/env node
// Real session transitions through the finder and song map, including focus,
// native keyboard input, Web Audio startup and mobile touch navigation.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const output = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
if (output) {
  assert.ok(output.startsWith('/workspace/screenshots/'));
  await mkdir(output, { recursive: true });
}
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let phase = 'loading';
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.pad').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Start set' && !b.disabled));
  await page.evaluate(async () => {
    const { StageRenderer } = await import('/src/lib/midi-stage/renderer.ts');
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const probe = window.navigationProbe = { live: null, audio: null, starts: 0, time: -1 };
    const draw = StageRenderer.prototype.draw;
    StageRenderer.prototype.draw = function (state) { probe.live = state; return draw.call(this, state); };
    AudioEngine.prototype.songAt = function () { return probe.time; };
    const begin = AudioEngine.prototype.begin;
    AudioEngine.prototype.begin = function (options) { probe.audio = this; probe.starts++; return begin.call(this, options); };
  });
  await page.waitForFunction(() => window.navigationProbe.live);
  const trigger = page.getByRole('button', { name: 'Open stage finder', exact: true });
  const finder = page.getByRole('dialog', { name: 'Stage finder', exact: true });
  const search = finder.getByRole('combobox');
  const command = (id) => finder.locator(`[data-command-id="${id}"]`);
  const screenshot = async (name) => { if (output) await page.screenshot({ path: `${output}/${name}.png`, fullPage: true }); };
  const frames = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

  phase = 'search, no match and keyboard song selection';
  await page.keyboard.press('Control+k');
  await finder.waitFor();
  assert.equal(await search.evaluate((el) => document.activeElement === el), true);
  await screenshot('finder-desktop');
  await search.fill('nothing-like-this-song-zzzz');
  await finder.getByText(/no .*found|no .*match/i).waitFor();
  await finder.getByRole('button', { name: 'Show all commands', exact: true }).click();
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.evaluate(() => window.navigationProbe.starts), 0, 'Search recovery must not execute a command');
  await search.fill('neon');
  await page.waitForFunction(() => document.querySelector('[data-command-id="song:neon-circuit"]')?.getAttribute('data-selected') === 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await finder.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Neon Circuit', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Elapsed time', { exact: true }).innerText(), '00:00');
  assert.equal(await page.evaluate(() => window.navigationProbe.starts), 0);

  phase = 'song map selection and full-song recovery';
  await trigger.click();
  await command('explore').click();
  await finder.waitFor({ state: 'hidden' });
  const map = page.locator('.song-map');
  await map.waitFor();
  assert.equal(await page.locator('.song-map-passage').first().evaluate((el) => document.activeElement === el), true);
  const section = page.getByRole('combobox', { name: 'Practice section', exact: true });
  const options = await section.locator('option').evaluateAll((items) => items.filter((item) => item.value).map((item) => item.value));
  assert.ok(options.length >= 2);
  await page.locator('.song-map-passage').nth(1).click();
  await frames();
  assert.equal(await section.inputValue(), options[1]);
  assert.equal(await page.locator('.song-map-passage').nth(1).getAttribute('aria-pressed'), 'true');
  await screenshot('song-map-desktop');
  await map.getByRole('button', { name: 'Full song', exact: true }).click();
  assert.equal(await section.inputValue(), '');
  assert.equal(await page.locator('.song-map-passage').first().evaluate((el) => document.activeElement === el), true);

  phase = 'direct passage search and focused play';
  await trigger.click();
  await command(`passage:${options[1]}`).scrollIntoViewIfNeeded();
  await command(`passage:${options[1]}`).click();
  await finder.waitFor({ state: 'hidden' });
  assert.equal(await section.inputValue(), options[1]);
  await trigger.click();
  await search.fill('Play in focus');
  await page.keyboard.press('Enter');
  await finder.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.navigationProbe.live.status === 'playing' && window.navigationProbe.audio.running);
  assert.equal(await page.locator('.stage-shell').evaluate((el) => el.classList.contains('stage-focused')), true);
  assert.equal(await page.evaluate(() => window.navigationProbe.starts), 1, 'Finder Enter must start exactly once');
  assert.equal(await map.count(), 0, 'Focused play must close the song map to bring the highway forward');
  assert.equal(await page.locator('.stage-canvas').evaluate((el) => document.activeElement === el), true,
    'Focused play must hand keyboard input to the playable stage');
  await page.evaluate(() => { const p = window.navigationProbe; p.judges = p.live.judges; p.time = 0.1; });

  phase = 'pause, escape focus and resume without rebuilding';
  await page.keyboard.press('Control+k');
  await finder.waitFor();
  await page.waitForFunction(() => window.navigationProbe.live.status === 'paused');
  assert.equal(await search.evaluate((el) => document.activeElement === el), true, 'Pause heading must not steal finder focus');
  await search.fill('asdf');
  assert.equal(await page.evaluate(() => window.navigationProbe.audio.monitorVoices.size), 0);
  await page.keyboard.press('Escape');
  await finder.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open stage finder');
  await page.keyboard.press('Control+k');
  await search.fill('Resume in focus');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.navigationProbe.live.status === 'playing');
  assert.equal(await page.evaluate(() => window.navigationProbe.live.judges === window.navigationProbe.judges), true);
  assert.equal(await page.evaluate(() => window.navigationProbe.starts), 2);

  phase = 'destination focus and modal shortcut isolation';
  await page.keyboard.press('Control+k');
  await command('soundcheck').click();
  await finder.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.id === 'soundcheck-title');
  await trigger.click();
  await command('room').click();
  await finder.waitFor({ state: 'hidden' });
  const room = page.locator('[role="dialog"][aria-labelledby="room-title"]');
  await room.waitFor();
  assert.equal(await room.evaluate((el) => el.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await room.waitFor({ state: 'hidden' });
  await trigger.click();
  await command('import').click();
  const library = page.getByRole('dialog', { name: 'Your songs', exact: true });
  await library.waitFor();
  assert.equal(await library.evaluate((el) => el.contains(document.activeElement)), true);
  await page.keyboard.press('Control+k');
  assert.equal(await finder.count(), 0, 'Finder must not take over another dialog');
  await page.keyboard.press('Escape');
  await library.waitFor({ state: 'hidden' });

  phase = 'mobile finder and passage touch layout';
  await page.getByRole('button', { name: 'Reset set', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.tap();
  await finder.waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  for (const item of await finder.getByRole('option').all()) {
    const box = await item.boundingBox();
    if (box) assert.ok(box.height >= 44, 'Finder options need 44px touch targets');
  }
  await screenshot('finder-mobile');
  await command('explore').tap();
  await finder.waitFor({ state: 'hidden' });
  await page.locator('.song-map-passage').first().tap();
  assert.equal(await section.inputValue(), options[0]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await screenshot('song-map-mobile');
  await trigger.tap();
  await command('play-focus').tap();
  await page.waitForFunction(() => window.navigationProbe.live.status === 'playing');
  assert.equal(await page.locator('.practice-controls').isVisible(), false);
  const highway = await page.locator('.stage-canvas').boundingBox();
  assert.ok(highway && highway.y + highway.height * 0.9 < 844, 'Focused mobile play must keep the strike area in view');
  if (output) await page.screenshot({ path: `${output}/focused-play-mobile.png` });
  assert.deepEqual(errors, []);
  console.log('PASS: finder keyboard search, no-match state and song selection; visual passage map and focus recovery; direct passage commands; focused play starts once; pause/resume preserves the take; modal focus and shortcut isolation; mobile touch, reduced motion and overflow');
} catch (error) {
  console.error('Navigation regression failed during:', phase, error);
  console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
  if (output) await page.screenshot({ path: `${output}/navigation-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
