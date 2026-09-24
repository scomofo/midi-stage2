#!/usr/bin/env node
// Run against npm run dev. Use real UI, Web Audio, input handling and storage;
// only the MIDI hardware is replaced with browser EventTargets.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const screenshotDir = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
if (screenshotDir) {
  assert.ok(screenshotDir === '/workspace/screenshots' || screenshotDir.startsWith('/workspace/screenshots/'),
    'Setup screenshots must be stored under /workspace/screenshots');
  await mkdir(screenshotDir, { recursive: true });
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const access = new EventTarget();
    access.inputs = new Map();
    for (const [id, name] of [['qa-keys', 'Rehearsal keyboard'], ['qa-spare', 'Spare keyboard']]) {
      const input = Object.assign(new EventTarget(), { id, name, manufacturer: 'MIDI Stage QA', state: 'connected' });
      access.inputs.set(id, input);
    }
    const fake = window.fakeMidi = {
      requests: 0,
      send(id, channel, note, velocity = 100) {
        const event = new Event('midimessage');
        Object.defineProperty(event, 'data', { value: new Uint8Array([0x90 | (channel - 1), note, velocity]) });
        access.inputs.get(id).dispatchEvent(event);
      },
      disconnect(id) {
        access.inputs.get(id).state = 'disconnected';
        access.dispatchEvent(new Event('statechange'));
      },
      reconnect(id) {
        access.inputs.get(id).state = 'connected';
        access.dispatchEvent(new Event('statechange'));
      },
    };
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: async () => { fake.requests++; return access; },
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
    const { Judge } = await import('/src/lib/midi-stage/engine.ts');
    const probe = window.setupProbe = { audio: null, monitors: [], judgeHits: 0 };
    const monitor = AudioEngine.prototype.monitor;
    AudioEngine.prototype.monitor = function (token, instrument, ...args) {
      probe.audio = this;
      probe.monitors.push({ token, instrument });
      return monitor.call(this, token, instrument, ...args);
    };
    const init = AudioEngine.prototype.init;
    AudioEngine.prototype.init = async function (...args) {
      probe.audio = this;
      return init.apply(this, args);
    };
    const hit = Judge.prototype.hit;
    Judge.prototype.hit = function (...args) {
      probe.judgeHits++;
      return hit.apply(this, args);
    };
  });
  const screenshot = async (name) => {
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
  };
  const key = (type, code = 'KeyA') => page.evaluate(({ type, code }) => {
    document.body.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  }, { type, code });
  const send = (channel, velocity = 100, id = 'qa-keys') => page.evaluate(({ channel, velocity, id }) => {
    window.setupProbe.monitors = [];
    window.fakeMidi.send(id, channel, 60, velocity);
    return window.setupProbe.monitors.map((entry) => entry.instrument);
  }, { channel, velocity, id });
  const voices = () => page.evaluate(() => window.setupProbe.audio?.monitorVoices.size ?? 0);
  const route = async (label, input, channel) => {
    await page.getByRole('combobox', { name: `${label} MIDI input`, exact: true }).selectOption(input);
    if (channel !== undefined)
      await page.getByRole('combobox', { name: `${label} MIDI channel`, exact: true }).selectOption(String(channel));
    await frames();
  };
  const assertUnscored = async () => {
    await frames();
    assert.equal(await page.getByLabel('Elapsed time', { exact: true }).innerText(), '00:00');
    assert.equal(await page.locator('.hud-chip').filter({ hasText: 'SCORE' }).locator('strong').innerText(), '000000');
    assert.equal(await page.evaluate(() => window.setupProbe.judgeHits), 0, 'soundcheck must never submit scored hits');
    assert.equal(await page.evaluate(() => window.setupProbe.audio?.running ?? false), false,
      'soundcheck must not start the backing scheduler');
  };

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await hydrated();
  await installProbe();
  assert.equal(await page.evaluate(() => window.fakeMidi.requests), 0, 'MIDI permission must be user initiated');
  await page.getByRole('button', { name: 'Soundcheck', exact: true }).click();
  await page.locator('#soundcheck-panel').waitFor();
  await key('keydown');
  assert.equal(await voices(), 0, 'a fresh page must not play audio before sound is enabled');
  await key('keyup');
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await page.waitForFunction(() => window.setupProbe.audio?.ctx?.state === 'running');
  await key('keydown');
  assert.equal(await voices(), 1, 'soundcheck must produce a real monitor voice');
  assert.match(await page.getByLabel('Soundcheck feedback', { exact: true }).innerText(), /Keys/);
  await key('keyup');
  assert.equal(await voices(), 0, 'releasing the warmup key must release its voice');
  await assertUnscored();

  await page.getByRole('button', { name: 'Connect MIDI', exact: true }).first().click();
  await page.waitForFunction(() => window.fakeMidi.requests === 1);
  await page.getByRole('combobox', { name: 'Keys MIDI input', exact: true })
    .locator('option[value="device:qa-keys"]').waitFor({ state: 'attached' });
  assert.deepEqual(await send(1), ['keys'], 'automatic solo routing must select the enabled instrument');
  assert.equal(await voices(), 1);
  await send(1, 0);
  assert.equal(await voices(), 0);

  const setlist = page.getByRole('complementary', { name: 'Setlist and lineup', exact: true });
  for (const label of ['Drums', 'Guitar', 'Bass']) {
    await setlist.getByRole('button', { name: `${label} OFF`, exact: true }).click();
    const selected = setlist.getByRole('button', { name: `${label} ON`, exact: true });
    await selected.waitFor();
    assert.equal(await selected.getAttribute('aria-pressed'), 'true', `${label} must join the lineup after its toggle`);
    await page.getByRole('combobox', { name: `${label} MIDI input`, exact: true }).waitFor();
  }
  await route('Drums', 'off');
  await route('Guitar', 'off');
  await route('Keys', 'device:qa-keys', 1);
  await route('Bass', 'device:qa-keys', 2);
  assert.deepEqual(await send(1), ['keys'], 'channel 1 must play Keys without ghost input to the band');
  assert.deepEqual(await send(2), ['bass'], 'channel 2 must play Bass without ghost input to the band');
  assert.equal(await voices(), 2, 'independent channel notes must coexist');
  assert.deepEqual(await send(3), [], 'unassigned channels must be ignored');
  assert.deepEqual(await send(1, 100, 'qa-spare'), [], 'an unassigned device must not play an explicit route');
  await route('Keys', 'device:qa-keys', 4);
  assert.equal(await voices(), 0, 'editing routing must release existing MIDI voices');
  await send(1, 0);
  await send(2, 0);
  assert.deepEqual(await send(4), ['keys']);
  await page.evaluate(() => window.fakeMidi.disconnect('qa-keys'));
  await frames();
  assert.equal(await voices(), 0, 'disconnect must release the lost device');
  assert.equal(await page.getByRole('combobox', { name: 'Keys MIDI input', exact: true }).inputValue(), 'device:qa-keys',
    'a disconnected assignment must remain selected for reconnection');
  await page.evaluate(() => window.fakeMidi.reconnect('qa-keys'));
  await frames();
  assert.deepEqual(await send(4), ['keys'], 'reconnection must restore the assigned route once');
  await send(4, 0);
  await route('Guitar', 'off');
  await key('keydown', 'KeyZ');
  assert.equal(await voices(), 1, 'MIDI off must leave the computer keyboard playable');
  await key('keyup', 'KeyZ');
  await assertUnscored();

  // Keep one inactive player as well as changed chart/listening preferences, so
  // reload checks exercise both sides of lineup restoration.
  await setlist.getByRole('button', { name: 'Guitar ON', exact: true }).click();
  await setlist.getByRole('button', { name: /^First Rehearsal/ }).click();
  await page.getByRole('combobox', { name: /DIFFICULTY/ }).selectOption('expert');
  await page.getByRole('combobox', { name: /TEMPO/ }).selectOption('0.75');
  await page.getByRole('slider', { name: 'Master volume', exact: true }).fill('73');
  await page.getByLabel('Guide part', { exact: true }).check();
  await page.getByLabel('Click', { exact: true }).check();
  await frames();
  await screenshot('setup-soundcheck-desktop.png');
  const storageKey = await page.evaluate(() => Object.keys(localStorage).find((key) => /midi-stage.*preferences/.test(key)));
  assert.ok(storageKey, 'session preferences must be saved');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await hydrated();
  await installProbe();
  assert.equal(await page.getByRole('combobox', { name: /DIFFICULTY/ }).inputValue(), 'expert');
  assert.equal(await page.getByRole('combobox', { name: /TEMPO/ }).inputValue(), '0.75');
  assert.equal(await page.getByRole('slider', { name: 'Master volume', exact: true }).inputValue(), '73');
  assert.equal(await page.getByLabel('Guide part', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Click', { exact: true }).isChecked(), true);
  assert.equal(await setlist.getByRole('button', { name: /^First Rehearsal/ }).getAttribute('aria-pressed'), 'true');
  for (const label of ['Drums', 'Keys', 'Bass'])
    assert.equal(await setlist.getByRole('button', { name: `${label} ON`, exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await setlist.getByRole('button', { name: 'Guitar OFF', exact: true }).getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => window.fakeMidi.requests), 0, 'reload must not request MIDI permission');
  await assertUnscored();
  await page.getByRole('button', { name: 'Soundcheck', exact: true }).click();
  assert.equal(await page.getByRole('combobox', { name: 'Keys MIDI input', exact: true }).inputValue(), 'device:qa-keys');
  assert.equal(await page.getByRole('combobox', { name: 'Keys MIDI channel', exact: true }).inputValue(), '4');
  assert.equal(await page.getByRole('combobox', { name: 'Bass MIDI channel', exact: true }).inputValue(), '2');
  assert.equal(await page.getByRole('button', { name: 'Enable sound', exact: true }).isVisible(), true,
    'reload must return to an explicit sound-enable gesture');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#soundcheck-panel').scrollIntoViewIfNeeded();
  await frames();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false,
    'mobile soundcheck must fit the viewport');
  for (const label of ['Keys', 'Bass']) {
    const input = page.getByRole('combobox', { name: `${label} MIDI input`, exact: true });
    const bounds = await input.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391, 'mobile routing control must be on screen');
  }
  await screenshot('setup-soundcheck-mobile.png');

  await page.evaluate((key) => localStorage.setItem(key, '{broken JSON'), storageKey);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await hydrated();
  await installProbe();
  assert.equal(await page.getByRole('combobox', { name: /DIFFICULTY/ }).inputValue(), 'standard');
  assert.equal(await page.getByRole('combobox', { name: /TEMPO/ }).inputValue(), '1');
  assert.equal(await page.getByRole('slider', { name: 'Master volume', exact: true }).inputValue(), '55');
  assert.equal(await page.locator('.pad').count() > 0, true, 'invalid saved data must leave playable controls');
  await assertUnscored();
  assert.deepEqual(errors, []);
  console.log('PASS: sound-enable gesture; unscored keyboard/MIDI warmup; per-device/channel routing; route-edit release; disconnect/reconnect; keyboard fallback; session/routing preferences survive reload; no auto MIDI permission; corrupt storage recovery; mobile soundcheck');
} catch (error) {
  console.error('Setup regression failed:', error);
  console.error('Setup regression state:', await page.evaluate(() => ({
    url: location.href,
    soundcheckPresent: Boolean(document.querySelector('#soundcheck-panel')),
    controls: [...document.querySelectorAll('button, select')].map((element) => ({
      role: element.tagName.toLowerCase(),
      name: element.getAttribute('aria-label') || element.textContent.trim(),
      pressed: element.getAttribute('aria-pressed'),
      expanded: element.getAttribute('aria-expanded'),
      disabled: element.disabled,
    })),
  })).catch(() => 'Page unavailable'));
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'setup-failure.png'), fullPage: true })
    .catch((diagnosticError) => console.error('Setup failure screenshot unavailable:', diagnosticError));
  throw error;
} finally {
  await browser.close().catch((cleanupError) => console.error('Browser cleanup failed:', cleanupError));
}
