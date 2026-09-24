#!/usr/bin/env node
// Run against npm run dev. Control the song clock and delay audio initialization;
// the real React component, Judge, input, Web Audio and persistence stay in use.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const screenshotDir = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
if (screenshotDir) {
  assert.ok(screenshotDir === '/workspace/screenshots' || screenshotDir.startsWith('/workspace/screenshots/'),
    'Session screenshots must be stored under /workspace/screenshots');
  await mkdir(screenshotDir, { recursive: true });
}
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const screenshot = async (name) => {
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  page.setDefaultTimeout(10000);
  await page.locator('.pad').first().waitFor(); // Wait for the hydrated session, not just SSR controls.
  await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const { Judge, KEYS } = await import('/src/lib/midi-stage/engine.ts');
    const probe = window.sessionProbe = {
      time: -1, ticks: 0, judge: null, audio: null, keys: KEYS.keys,
      beginCalls: 0, beginSettled: 0, blockInit: false, pendingInit: [],
    };
    AudioEngine.prototype.songAt = function () { probe.audio = this; return probe.time; };
    const init = AudioEngine.prototype.init;
    AudioEngine.prototype.init = async function () {
      await init.call(this);
      if (probe.blockInit) await new Promise((resolve) => probe.pendingInit.push(resolve));
    };
    const begin = AudioEngine.prototype.begin;
    AudioEngine.prototype.begin = async function (options) {
      probe.audio = this;
      probe.beginCalls++;
      probe.lastOptions = options;
      try { return await begin.call(this, options); }
      finally { probe.beginSettled++; }
    };
    const tick = Judge.prototype.tick;
    Judge.prototype.tick = function (time) {
      probe.judge = this;
      probe.ticks++;
      return tick.call(this, time);
    };
  });
  const start = page.getByRole('button', { name: 'Start set', exact: true });
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  const elapsed = page.getByLabel('Elapsed time', { exact: true });
  const remaining = page.getByLabel('Remaining time', { exact: true });
  const frames = () => page.evaluate(() => new Promise((resolve) => {
    let count = 0;
    const next = () => ++count === 12 ? resolve() : requestAnimationFrame(next);
    requestAnimationFrame(next);
  }));
  const assertReady = async () => {
    await frames();
    assert.equal(await start.isEnabled(), true, 'ready session must have an enabled Start set');
    assert.equal(await pause.isEnabled(), false, 'ready session must not offer Pause');
    assert.equal(await elapsed.innerText(), '00:00', 'ready clock must remain at zero');
    assert.equal(await page.evaluate(() => window.sessionProbe.audio?.running ?? false), false,
      'ready session must not have a live audio scheduler');
  };
  await assertReady();
  // Observe long enough for the decorative highway loop to move independently
  // of the player clock (a frame-only check can miss a clock rounded to seconds).
  await page.waitForTimeout(2700);
  await assertReady();

  // Hold a real audio begin open: repeated shortcuts must not spawn competing
  // starts, and restarting during initialization must not revive a stale set.
  await page.evaluate(() => { window.sessionProbe.blockInit = true; });
  await start.click(); // A trusted gesture unlocks Web Audio before delaying init.
  await page.evaluate(() => {
    for (let i = 0; i < 2; i++) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
      document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', bubbles: true }));
    }
  });
  await page.waitForFunction(() => window.sessionProbe.pendingInit.length > 0);
  assert.equal(await page.evaluate(() => window.sessionProbe.beginCalls), 1,
    'rapid Start shortcuts must share one pending start');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.evaluate(() => {
    const p = window.sessionProbe;
    p.blockInit = false;
    p.pendingInit.splice(0).forEach((resolve) => resolve());
  });
  await page.waitForFunction(() => window.sessionProbe.beginSettled === 1);
  await assertReady();

  // A focused button owns Enter. A global shortcut must not also fire it.
  await start.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.sessionProbe.judge !== null, null, { timeout: 10000 }).catch(async (error) => {
    console.error(await page.locator('body').innerText(), errors);
    throw error;
  });
  assert.equal(await page.evaluate(() => window.sessionProbe.beginCalls), 2,
    'Enter on Start must begin exactly one set');
  await page.evaluate(() => {
    const p = window.sessionProbe;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: p.keys[0], bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code: p.keys[0], bubbles: true }));
    if (p.judge.stats.extra !== 0 || p.judge.stats.miss !== 0 || p.judge.stats.score !== 0)
      throw Error('Count-in practice must not score or penalize stray input');
  });
  await page.evaluate(() => {
    const p = window.sessionProbe;
    p.originalJudge = p.judge;
    const note = p.judge.notes.find((n) => n.duration >= 0.35);
    if (!note) throw Error('Fixture needs a sustained note');
    p.note = note;
    p.time = note.time;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: p.keys[note.lane], bubbles: true }));
    p.score = p.judge.stats.score;
    if (p.score <= 0 || p.judge.activeHolds.size !== 1) throw Error('Input must score and start a hold');
  });
  for (const value of ['20', '85', '0', '55']) {
    const ticks = await page.evaluate(() => window.sessionProbe.ticks);
    await page.getByRole('slider', { name: 'Master volume' }).fill(value);
    await page.waitForFunction((before) => window.sessionProbe.ticks > before + 2, ticks, { timeout: 3000 });
    await page.evaluate((value) => {
      const p = window.sessionProbe;
      if (p.judge !== p.originalJudge || p.judge.stats.score !== p.score || p.judge.activeHolds.size !== 1)
        throw Error('Volume changed the scoring session');
      if (p.audio.volume !== Number(value) / 100) throw Error('Volume did not reach the audio engine');
    }, value);
  }
  await pause.focus();
  await page.keyboard.press('Enter');
  await resume.waitFor();
  await page.getByRole('button', { name: 'Resume set', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.sessionProbe.audio.running), false,
    'Enter on Pause must pause once without toggling back to play');
  // Listening options may change while paused without resetting the session.
  await page.getByLabel('Guide part', { exact: true }).check();
  await page.getByLabel('Click', { exact: true }).check();
  await page.getByRole('slider', { name: 'Master volume' }).fill('70');
  await resume.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.sessionProbe.audio.running);
  await page.evaluate(() => {
    const p = window.sessionProbe;
    if (p.judge !== p.originalJudge || p.judge.stats.score !== p.score || p.note.hold !== 'held')
      throw Error('Pause/resume lost score or held note');
    if (!p.audio.events.some((e) => e.click)) throw Error('Paused click option was not applied on resume');
    p.time = p.note.time + p.note.duration;
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code: p.keys[p.note.lane], bubbles: true }));
    if (p.note.hold !== 'complete') throw Error('Held note did not complete');
    p.finalScore = p.judge.stats.score;
    p.time = p.audio.song.duration + 2;
  });
  await page.getByText('SET COMPLETE', { exact: true }).waitFor();
  await frames();
  assert.equal(await remaining.innerText(), '00:00', 'finished session must show no remaining time');
  const duration = await page.evaluate(() => {
    const seconds = Math.floor(window.sessionProbe.audio.song.duration);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  });
  assert.equal(await elapsed.innerText(), duration, 'results must retain the completed song clock');
  const result = await page.evaluate(() => {
    const p = window.sessionProbe;
    const stored = Object.keys(localStorage).filter((k) => k.startsWith('midi-stage-best/'));
    return { score: p.finalScore, saved: stored.map((k) => Number(localStorage.getItem(k))) };
  });
  assert.ok(result.score > 0 && result.saved.includes(result.score), 'completed score must persist');
  await screenshot('session-results.png');
  await page.evaluate(() => { window.sessionProbe.time = 0; });
  await start.click();
  await page.waitForFunction(() => window.sessionProbe.audio.running);
  await pause.click();
  await page.getByRole('combobox', { name: /TEMPO/ }).selectOption('0.75');
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll('button')];
    return buttons.some((b) => b.textContent.trim() === 'Start set' && !b.disabled);
  });
  assert.equal(await page.getByRole('button', { name: 'Resume', exact: true }).count(), 0,
    'chart-changing settings must explicitly reset a paused session');
  await assertReady();

  // The beginner action must configure and actually start the promised session.
  await page.evaluate(() => { window.sessionProbe.beforeBeginnerJudge = window.sessionProbe.judge; });
  await page.getByRole('button', { name: 'Try beginner rehearsal', exact: true }).click();
  await page.waitForFunction(() => {
    const p = window.sessionProbe;
    return p.audio.running && p.audio.song.id === 'first-rehearsal' && p.judge !== p.beforeBeginnerJudge;
  });
  assert.equal(await page.getByRole('combobox', { name: /DIFFICULTY/ }).inputValue(), 'chill');
  assert.equal(await page.getByRole('combobox', { name: /TEMPO/ }).inputValue(), '0.75');
  assert.equal(await page.getByLabel('Guide part', { exact: true }).isChecked(), true);
  await page.evaluate(() => {
    const p = window.sessionProbe;
    if (p.lastOptions.players.filter((player) => player.enabled).map((player) => player.id).join() !== 'keys')
      throw Error('First rehearsal must configure a solo keys session');
    if (!p.audio.events.some((event) => event.destination === p.audio.buses.guide))
      throw Error('First rehearsal must have an audible guide part');
    const note = p.judge.notes.find((n) => n.duration >= 0.35);
    if (!note) throw Error('First rehearsal needs a sustained note for interruption coverage');
    p.time = note.time;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: p.keys[note.lane], bubbles: true }));
    if (p.judge.activeHolds.size !== 1) throw Error('Interruption check needs an active hold');
    p.beforeBlur = p.judge;
    window.dispatchEvent(new Event('blur'));
  });
  await resume.waitFor();
  await page.evaluate(() => {
    const p = window.sessionProbe;
    if (p.audio.running || p.audio.monitorVoices.size || p.judge.activeHolds.size)
      throw Error('Losing focus must pause playback and release held input');
    if (p.judge !== p.beforeBlur) throw Error('Losing focus must preserve the scoring session');
  });
  await page.getByRole('button', { name: 'Resume set', exact: true }).click();
  await page.waitForFunction(() => window.sessionProbe.audio.running);
  await pause.click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  const savedBeforeDemo = await page.evaluate(() => {
    window.sessionProbe.time = 0;
    return Object.keys(localStorage).filter((key) => key.startsWith('midi-stage-best/'))
      .sort().map((key) => [key, localStorage.getItem(key)]);
  });
  await page.getByRole('button', { name: 'Watch the house', exact: true }).last().click();
  await page.waitForFunction(() => {
    const p = window.sessionProbe;
    return p.audio.running && p.lastOptions.demo;
  });
  await page.evaluate(() => { window.sessionProbe.time = window.sessionProbe.audio.song.duration + 2; });
  await page.getByText('AUTOPLAY · NOT SAVED', { exact: true }).waitFor();
  const savedAfterDemo = await page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key.startsWith('midi-stage-best/')).sort().map((key) => [key, localStorage.getItem(key)]));
  assert.deepEqual(savedAfterDemo, savedBeforeDemo, 'autoplay must not create or replace a personal best');

  // Settings must pause an active take, and focus mode must not hide the
  // mobile drawer after the player explicitly requests the setlist.
  await page.evaluate(() => { window.sessionProbe.time = 0; });
  await start.click();
  await page.waitForFunction(() => window.sessionProbe.audio.running);
  await page.getByRole('button', { name: 'The room', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await resume.waitFor();
  assert.equal(await page.evaluate(() => window.sessionProbe.audio.running), false,
    'opening room settings during play must pause the set');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await resume.isEnabled(), true, 'closing settings must preserve the paused set');
  await page.getByRole('button', { name: 'Focus stage', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Show setlist', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open setlist', exact: true }).click();
  const setlist = page.getByRole('complementary', { name: 'Setlist and lineup', exact: true });
  await setlist.waitFor();
  await page.waitForFunction(() => {
    const bounds = document.querySelector('aside[aria-label="Setlist and lineup"]').getBoundingClientRect();
    return bounds.left >= -1 && bounds.right <= window.innerWidth + 1;
  });
  assert.equal(await page.getByRole('button', { name: 'Focus stage', exact: true }).getAttribute('aria-pressed'), 'false',
    'opening the mobile setlist must leave focus mode');
  await screenshot('session-mobile-setlist.png');
  await page.keyboard.press('Escape');
  await setlist.waitFor({ state: 'hidden' });
  await screenshot('session-mobile-paused.png');
  assert.deepEqual(errors, []);
  console.log('PASS: ready clock; duplicate/cancelled start; count-in input; native button keys; hit/hold through volume and pause; finish/save; chart reset; first rehearsal; focus-loss pause/release; autoplay never saves; room pauses; mobile setlist exits focus mode');
} finally {
  await browser.close();
}
