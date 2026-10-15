#!/usr/bin/env node
// Exercise the real session and controls with a controlled song clock. No app hooks.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const output = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
if (output) {
  assert.ok(output === '/workspace/screenshots' || output.startsWith('/workspace/screenshots/'));
  await mkdir(output, { recursive: true });
}
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.pad').first().waitFor();
  await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const { StageRenderer } = await import('/src/lib/midi-stage/renderer.ts');
    const probe = window.hudProbe = { time: -1, live: null, stings: 0 };
    AudioEngine.prototype.songAt = function () { return probe.time; };
    AudioEngine.prototype.overdriveSting = function () { probe.stings++; };
    const draw = StageRenderer.prototype.draw;
    StageRenderer.prototype.draw = function (state) {
      probe.live = state;
      return draw.call(this, state);
    };
  });
  const boost = page.getByRole('button', { name: 'Activate Overdrive', exact: true });
  const meter = page.getByRole('meter', { name: 'Overdrive charge', exact: true });
  const transport = page.getByRole('group', { name: 'Playback controls', exact: true });
  const settle = () => page.waitForTimeout(180);
  const charge = async (value, active = false) => {
    await page.evaluate(([value, active]) => {
      for (const judge of window.hudProbe.live.judges.values()) {
        judge.overdriveMeter = value;
        judge.overdriveActive = active;
      }
    }, [value, active]);
    await settle();
  };
  const active = () => page.evaluate(() => [...window.hudProbe.live.judges.values()].some((j) => j.overdriveActive));
  const stings = () => page.evaluate(() => window.hudProbe.stings);
  assert.equal(await boost.isDisabled(), true, 'ready cannot activate');
  await transport.getByRole('button', { name: 'Start set', exact: true }).click();
  await page.waitForFunction(() => window.hudProbe.live?.status === 'playing');
  await charge(40);
  assert.equal(await boost.isDisabled(), true, 'count-in cannot activate');
  await page.locator('h2').first().click();
  await page.keyboard.press('Shift+Enter');
  assert.equal(await active(), false, 'shortcut cannot activate during count-in');
  await page.evaluate(() => { window.hudProbe.time = 0.1; });
  await charge(29.9);
  assert.equal(await boost.isDisabled(), true, 'charge below 30 cannot activate');
  await charge(30);
  assert.equal(await boost.isEnabled(), true, '30 percent enables activation');
  assert.equal(await boost.getAttribute('aria-keyshortcuts'), 'Shift+Enter');
  await page.keyboard.press('Shift+Enter');
  await settle();
  assert.equal(await active(), true, 'shortcut activates boost');
  assert.equal(await stings(), 1);
  assert.equal(await page.evaluate(() => window.hudProbe.live.status), 'playing', 'shortcut does not pause');
  const boostedMultiplier = await page.evaluate(() => [...window.hudProbe.live.judges.values()][0].multiplier);
  assert.equal(boostedMultiplier, 2, 'boost doubles the current base multiplier, not always 8x');
  assert.match(await page.locator('.stage-overdrive').innerText(), /Double your current multiplier/);
  await page.keyboard.press('Shift+Enter');
  assert.equal(await stings(), 1, 'active boost cannot retrigger');
  await transport.getByRole('button', { name: 'Pause', exact: true }).click();
  await charge(47, true);
  assert.equal(Number(await meter.getAttribute('value')), 47, 'paused meter retains real charge');
  await page.waitForTimeout(400);
  assert.equal(Number(await meter.getAttribute('value')), 47, 'pause does not drain charge');
  assert.match(await page.locator('.stage-overdrive').innerText(), /Boost paused/);
  await boost.evaluate((button) => button.blur());
  await page.keyboard.press('Shift+Enter');
  assert.equal(await page.evaluate(() => window.hudProbe.live.status), 'paused', 'shortcut does not resume');
  await charge(40);
  assert.equal(await boost.isDisabled(), true);
  assert.match(await page.locator('.stage-overdrive').innerText(), /Charge saved/);
  await transport.getByRole('button', { name: 'Resume', exact: true }).click();
  await settle();
  assert.equal(await boost.isEnabled(), true);

  // The shortcut must not submit a form, activate a dialog or steal a playing key.
  await page.getByLabel('Open stage finder', { exact: true }).click();
  await page.keyboard.press('Shift+Enter');
  assert.equal(await active(), false, 'finder owns its keyboard input');
  await page.keyboard.press('Escape');
  await transport.getByRole('button', { name: 'Resume', exact: true }).click();
  await charge(40);
  await page.getByRole('slider', { name: 'Master volume', exact: true }).focus();
  await page.keyboard.press('Shift+Enter');
  assert.equal(await active(), false, 'form controls keep their keyboard input');

  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await charge(40);
    await boost.scrollIntoViewIfNeeded();
    const bounds = await boost.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44, `${width}: clear activation target`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}: no horizontal overflow`);
    const tops = await page.locator('.stage-hud > .hud-chip').evaluateAll((chips) => chips
      .filter((chip) => getComputedStyle(chip).display !== 'none').map((chip) => chip.getBoundingClientRect().top));
    assert.ok(Math.max(...tops) - Math.min(...tops) < 2, `${width}: score stats stay on one row`);
    if (output) await page.screenshot({ path: `${output}/overdrive-ready-${width}.png` });
  }
  await boost.focus();
  await page.keyboard.press('Enter');
  await settle();
  assert.equal(await active(), true, 'focused button activates with ordinary Enter');
  await transport.getByRole('button', { name: 'Pause', exact: true }).click();
  await charge(47, true);
  if (output) {
    await page.locator('.stage-overdrive').screenshot({ path: `${output}/overdrive-paused-control.png` });
    await page.screenshot({ path: `${output}/overdrive-paused-laptop.png` });
  }
  await transport.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.evaluate(() => { window.hudProbe.time = window.hudProbe.live.song.duration + 1; });
  await page.locator('[data-session-overlay="results"]').waitFor();
  await settle();
  assert.equal(Number(await meter.getAttribute('value')), 0, 'completed sets do not advertise a live boost');
  assert.equal(await page.locator('.stage-overdrive').getAttribute('data-active'), 'false');
  await page.getByRole('button', { name: 'Reset set', exact: true }).click();
  await settle();
  assert.equal(Number(await meter.getAttribute('value')), 0, 'reset clears charge');
  await page.evaluate(() => { window.hudProbe.time = 0.1; });
  await page.getByRole('button', { name: 'Watch the house', exact: true }).click();
  await page.waitForFunction(() => window.hudProbe.live?.demo && window.hudProbe.live.status === 'playing');
  await charge(100);
  assert.equal(await boost.isDisabled(), true, 'autoplay cannot activate boost');
  await page.keyboard.press('Shift+Enter');
  assert.equal(await active(), false);
  assert.deepEqual(errors, []);
  console.log('Performance HUD: charge threshold, count-in, shortcut, pause/resume, focus ownership, desktop/laptop layout, keyboard button activation, completion, reset and autoplay passed.');
} finally {
  await browser.close();
}
