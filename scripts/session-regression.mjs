#!/usr/bin/env node
// Run against npm run dev. Only the song clock is controlled; the real React
// component, Judge, input handlers, Web Audio and persistence remain in use.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  page.setDefaultTimeout(10000);
  await page.locator('.pad').first().waitFor(); // Wait for the hydrated session, not just SSR controls.
  await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const { Judge, KEYS } = await import('/src/lib/midi-stage/engine.ts');
    const probe = window.sessionProbe = { time: 0, ticks: 0, judge: null, audio: null, keys: KEYS.keys };
    AudioEngine.prototype.songAt = function () { probe.audio = this; return probe.time; };
    const tick = Judge.prototype.tick;
    Judge.prototype.tick = function (time) {
      probe.judge = this;
      probe.ticks++;
      return tick.call(this, time);
    };
  });
  const start = page.getByRole('button', { name: 'Start set', exact: true });
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  await start.click();
  await page.waitForFunction(() => window.sessionProbe.judge !== null, null, { timeout: 10000 }).catch(async (error) => {
    console.error(await page.locator('body').innerText(), errors);
    throw error;
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
  await pause.click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  // Listening options may change while paused without resetting the session.
  await page.getByLabel('Guide part', { exact: true }).check();
  await page.getByLabel('Click', { exact: true }).check();
  await page.getByRole('slider', { name: 'Master volume' }).fill('70');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
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
  const result = await page.evaluate(() => {
    const p = window.sessionProbe;
    const stored = Object.keys(localStorage).filter((k) => k.startsWith('midi-stage-best/'));
    return { score: p.finalScore, saved: stored.map((k) => Number(localStorage.getItem(k))) };
  });
  assert.ok(result.score > 0 && result.saved.includes(result.score), 'completed score must persist');
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
  assert.deepEqual(errors, []);
  console.log('PASS: hit/hold → volume changes → pause/listening options → resume → release → finish/save; paused tempo resets coherently');
} finally {
  await browser.close();
}
