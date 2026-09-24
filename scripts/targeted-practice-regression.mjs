#!/usr/bin/env node
// Use the real import, input handlers, Judge and results/practice UI. A held
// song clock makes note outcomes deterministic without seeding scoring state.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const screenshotDir = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
const soloName = 'Solo — follow the melody through the long return into the final chorus';
if (screenshotDir) {
  assert.ok(screenshotDir === '/workspace/screenshots' || screenshotDir.startsWith('/workspace/screenshots/'),
    'Targeted practice screenshots must be stored under /workspace/screenshots');
  await mkdir(screenshotDir, { recursive: true });
}
const fixture = (sparse = false) => ({
  name: `${sparse ? 'sparse' : 'targeted'}-practice.midistage.json`, mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({
    schema: 'midi-stage-chart', version: 1, id: sparse ? 'sparse-practice' : 'targeted-practice',
    title: sparse ? 'Sparse Practice' : 'Targeted Practice', bpm: 120, duration: 24,
    sections: [{ time: 0, name: 'Opening' }, { time: 8, name: soloName }, { time: 16, name: 'Outro' }],
    parts: ['drums', 'keys', 'guitar', 'bass'].map((type) => ({ type,
      notes: type === 'keys'
        ? [0, 8, 16].flatMap((start, section) => Array.from({ length: sparse ? 3 : section === 0 ? 12 : 8 }, (_, index) => ({
          time: start + (section === 0 ? 0.4 + index * 0.6 : index),
          duration: section === 1 && (index === 4 || index === 5) ? 0.7 : 0.1,
          pitch: 60, velocity: 100,
        })))
        : type === 'bass'
          ? [0, 8, 16].flatMap((start) => [1.2, 3.2].map((time) => ({ time: start + time, duration: 0.1, pitch: 48, velocity: 100 })))
          : [],
    })),
  })),
});

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
page.setDefaultTimeout(15000);
const errors = [];
const navigations = [];
let phase = 'loading';
page.on('pageerror', (error) => errors.push(error.message));
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) navigations.push({ url: frame.url(), phase });
});
try {
  const frames = () => page.evaluate(() => new Promise((done) => {
    let count = 0;
    const next = () => ++count === 8 ? done() : requestAnimationFrame(next);
    requestAnimationFrame(next);
  }));
  const screenshot = async (name) => {
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
  };
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.pad').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .some((button) => button.textContent.trim() === 'Start set' && !button.disabled));
  await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const { StageRenderer } = await import('/src/lib/midi-stage/renderer.ts');
    const { KEYS } = await import('/src/lib/midi-stage/engine.ts');
    const probe = window.targetProbe = {
      time: -2, live: null, audio: null, begins: [], clicks: [], bestReads: [], bestWrites: [], keys: KEYS,
    };
    const draw = StageRenderer.prototype.draw;
    StageRenderer.prototype.draw = function (state) { probe.live = state; return draw.call(this, state); };
    AudioEngine.prototype.songAt = function () { return probe.time; };
    const begin = AudioEngine.prototype.begin;
    AudioEngine.prototype.begin = async function (options) {
      probe.audio = this;
      probe.begins.push(options);
      probe.time = options.countIn !== false ? -4 * 60 / options.song.bpm : options.seek;
      return await begin.call(this, options);
    };
    const click = AudioEngine.prototype.click;
    AudioEngine.prototype.click = function (at, accent) {
      probe.clicks.push({ generation: this.generation, at, accent });
      return click.call(this, at, accent);
    };
    const schedule = AudioEngine.prototype.schedule;
    AudioEngine.prototype.schedule = function () {};
    probe.scheduleAt = (time) => {
      const ctx = probe.audio.ctx;
      const ownClock = Object.getOwnPropertyDescriptor(ctx, 'currentTime');
      Object.defineProperty(ctx, 'currentTime', { configurable: true, value: time });
      try { schedule.call(probe.audio); }
      finally {
        if (ownClock) Object.defineProperty(ctx, 'currentTime', ownClock);
        else delete ctx.currentTime;
      }
    };
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (String(key).startsWith('midi-stage-best/')) probe.bestReads.push(key);
      return get.call(this, key);
    };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key).startsWith('midi-stage-best/')) probe.bestWrites.push({ key, value });
      return set.call(this, key, value);
    };
    probe.bestRecords = () => Object.keys(localStorage).filter((key) => key.startsWith('midi-stage-best/'))
      .sort().map((key) => [key, get.call(localStorage, key)]);
  });

  const start = page.getByRole('button', { name: 'Start set', exact: true });
  const reset = page.getByRole('button', { name: 'Reset set', exact: true });
  const fullSong = page.getByRole('button', { name: 'Full song', exact: true });
  const section = page.getByRole('combobox', { name: 'Practice section', exact: true });
  const repeat = page.getByRole('checkbox', { name: 'Repeat section', exact: true });
  const difficulty = page.getByRole('combobox', { name: /DIFFICULTY/ });
  const tempo = page.getByRole('combobox', { name: /TEMPO/ });
  const results = page.locator('[data-session-overlay="results"]');
  const recommendation = page.getByRole('region', { name: 'A passage to work on', exact: true });
  const practiceButton = page.getByRole('button', { name: 'Practice this passage', exact: true });
  const ready = async () => {
    await page.locator('[data-session-overlay="ready"]').waitFor();
    await frames();
    assert.equal(await start.isEnabled(), true);
    assert.equal(await page.evaluate(() => window.targetProbe.audio?.running ?? false), false);
  };
  const importFile = async (file, title) => {
    const opener = page.getByRole('button', { name: 'Import songs', exact: true });
    if (!await opener.isVisible()) await page.getByRole('button', { name: 'Open setlist', exact: true }).click();
    await opener.click();
    const library = page.getByRole('dialog', { name: 'Your songs', exact: true });
    await library.getByLabel('Choose song file', { exact: true }).setInputFiles(file);
    await library.getByRole('button', { name: 'Add to setlist', exact: true }).click();
    await library.waitFor({ state: 'hidden' });
    await page.getByRole('heading', { level: 2, name: title, exact: true }).waitFor();
    await ready();
  };
  const begin = async (action = 'start') => {
    const before = await page.evaluate(() => {
      const p = window.targetProbe;
      p.previousJudge = p.live.judges.get('keys');
      return p.begins.length;
    });
    if (action === 'demo') await page.getByRole('button', { name: 'Watch the house', exact: true }).last().click();
    else if (action === 'replay') await page.getByRole('button', { name: 'Play again', exact: true }).click();
    else await start.click();
    await page.waitForFunction((calls) => {
      const p = window.targetProbe;
      return p.begins.length === calls + 1 && p.audio.running && p.live?.status === 'playing'
        && p.live.judges.get('keys') !== p.previousJudge;
    }, before);
    assert.equal(await results.count(), 0, 'Starting a new take must dismiss previous results');
  };
  const playTake = async (pattern = 'solo', action = 'start') => {
    await begin(action);
    const played = await page.evaluate((pattern) => {
      const p = window.targetProbe;
      const events = [];
      for (const [id, judge] of p.live.judges) {
        if (judge.stats.score || judge.stats.miss || judge.stats.holdBreaks) throw Error('A new take must have fresh scoring');
        const sectionIndices = [0, 0, 0];
        for (const note of judge.notes) {
          const passage = Math.min(2, Math.floor(note.time / 8));
          const index = sectionIndices[passage]++;
          const miss = pattern === 'none' || (id === 'keys' && (
            pattern === 'solo' && (passage === 0 && index < 5 || passage === 1 && index < 3)
            || pattern === 'opening' && passage === 0 && index < 10
            || pattern === 'sparse' && passage === 1 && index < 2));
          if (miss) continue;
          const code = p.keys[id][note.lane];
          const broken = pattern === 'solo' && id === 'keys' && passage === 1 && (index === 4 || index === 5);
          events.push({ time: note.time, code, down: true, note });
          events.push({ time: note.time + (note.duration / judge.speed >= 0.35 && !broken ? note.duration : 0), code, down: false, note });
        }
      }
      events.sort((a, b) => a.time - b.time || Number(b.down) - Number(a.down));
      for (const event of events) {
        p.time = event.time;
        document.body.dispatchEvent(new KeyboardEvent(event.down ? 'keydown' : 'keyup', { code: event.code, bubbles: true }));
        if (event.down && event.note.state !== 1) throw Error(`Real keyboard input failed to hit note at ${event.note.time}`);
      }
      const outcomes = [...p.live.judges].flatMap(([id, judge]) => judge.notes.map((note) => ({ id, time: note.time, state: note.state, hold: note.hold })));
      p.time = p.live.song.duration + 1;
      return outcomes;
    }, pattern);
    await results.waitFor();
    await frames();
    return played;
  };
  const noRecommendation = async () => {
    assert.equal(await recommendation.count(), 0);
    assert.equal(await practiceButton.count(), 0);
  };
  const assertSetup = async () => {
    assert.equal(await difficulty.inputValue(), 'expert');
    assert.equal(await tempo.inputValue(), '0.75');
    assert.deepEqual(await page.evaluate(() => window.targetProbe.live.players.filter((player) => player.enabled).map((player) => player.id)), ['keys', 'bass']);
  };
  const assertSolo = async () => {
    await recommendation.waitFor();
    const text = await recommendation.innerText();
    assert.match(text, /Solo/);
    assert.match(text, /00:08–00:16/);
    assert.match(text, /3 missed notes/);
    assert.match(text, /2 broken holds/);
    assert.match(text, /10 notes/);
  };
  const enterRecommended = async (tap = false, repeatExpected = false) => {
    const calls = await page.evaluate(() => window.targetProbe.begins.length);
    if (tap) await practiceButton.tap();
    else await practiceButton.click();
    await ready();
    assert.equal(await section.inputValue(), 'section:8');
    assert.equal(await repeat.isChecked(), repeatExpected, 'A recommendation must preserve the existing repeat preference');
    await assertSetup();
    assert.equal(await results.count(), 0);
    await noRecommendation();
    assert.equal(await page.evaluate(() => window.targetProbe.begins.length), calls,
      'Choosing a recommendation must prepare practice without starting audio');
    assert.equal(await page.locator('.session-practice-context').innerText(), `${soloName} · 00:08–00:16 · Take 1`);
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-session-overlay="ready"]'))), true,
      'The removed recommendation button must hand keyboard focus to the ready panel');
    assert.equal(await page.evaluate(() => window.targetProbe.live.song.duration), 8);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  };

  phase = 'real full-song mistakes and recommendation';
  await importFile(fixture(), 'Targeted Practice');
  await difficulty.selectOption('expert');
  await tempo.selectOption('0.75');
  await page.getByRole('complementary', { name: 'Setlist and lineup', exact: true })
    .getByRole('button', { name: /^Bass\s+OFF$/ }).click();
  // Set a deliberate repeat preference before the full-song result exists.
  await section.selectOption('section:8');
  await repeat.uncheck();
  await fullSong.click();
  await ready();
  await assertSetup();
  const outcomes = await playTake();
  assert.equal(outcomes.filter((note) => note.hold === 'broken').length, 2,
    'The fixture must earn both broken holds through early key releases');
  await assertSolo();
  assert.match(await page.locator('.session-run-context').innerText(), /Expert · 75% tempo · Keys \+ Bass/);
  const savedBefore = await page.evaluate(() => window.targetProbe.bestRecords());
  assert.equal(savedBefore.length, 1, 'The full-song take must save its earned record');
  assert.ok(Number(savedBefore[0][1]) > 0);
  await practiceButton.focus();
  await frames();
  assert.equal(await practiceButton.evaluate((button) => button === document.activeElement), true,
    'Results refreshes must not steal focus from the practice action');
  await screenshot('targeted-practice-results-desktop.png');
  await page.evaluate(() => { window.targetProbe.bestReads = []; window.targetProbe.bestWrites = []; });

  phase = 'recommendation opens ready and preserves setup';
  await enterRecommended();
  await screenshot('targeted-practice-ready-desktop.png');
  await begin();
  await page.evaluate(() => {
    const p = window.targetProbe;
    const audio = p.audio;
    const options = p.begins.at(-1);
    if (options.countIn === false || options.seek !== 0 || options.speed !== 0.75) throw Error('Practice must start at zero with the selected tempo and a fresh count-in');
    const beats = audio.events.filter((event) => event.click && event.time < 0);
    if (beats.length !== 4) throw Error('Targeted practice needs all four count-in beats');
    const generation = audio.generation;
    for (const event of beats) p.scheduleAt(audio.origin + event.time / audio.speed - 0.06);
    if (p.clicks.filter((event) => event.generation === generation).length !== 4) throw Error('Targeted count-in must dispatch four actual clicks');
    const judge = p.live.judges.get('keys');
    if (judge.stats.score || judge.stats.miss || judge.stats.holdBreaks) throw Error('Practice must begin with empty scores');
    if (judge.notes[0].time !== 0 || judge.notes.length !== 8) throw Error('The recommended passage must start at its rebased boundary');
    p.time = 0;
    const code = p.keys.keys[judge.notes[0].lane];
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    if (judge.stats.perfect !== 1 || judge.stats.score !== 100) throw Error('The first practice hit must score into the fresh take');
    p.time = p.live.song.duration + 1;
  });
  await page.getByText('PRACTICE COMPLETE', { exact: true }).waitFor();
  await frames();
  await noRecommendation();
  assert.match(await results.innerText(), /PRACTICE · NOT SAVED/);
  assert.deepEqual(await page.evaluate(() => ({ reads: window.targetProbe.bestReads, writes: window.targetProbe.bestWrites })),
    { reads: [], writes: [] }, 'Recommended practice must neither read nor write full-song records');
  assert.deepEqual(await page.evaluate(() => window.targetProbe.bestRecords()), savedBefore);

  phase = 'replay replaces recommendation and clear take removes it';
  await fullSong.click();
  await ready();
  await playTake();
  await assertSolo();
  await playTake('opening', 'replay');
  assert.match(await recommendation.innerText(), /Opening/);
  assert.match(await recommendation.innerText(), /00:00–00:08/);
  assert.match(await recommendation.innerText(), /10 missed notes/);
  assert.doesNotMatch(await recommendation.innerText(), /Solo/);
  await playTake('clean', 'replay');
  await noRecommendation();

  phase = 'autoplay and all-miss takes never recommend';
  await reset.click();
  const beforeDemo = await page.evaluate(() => window.targetProbe.bestRecords());
  await begin('demo');
  await page.evaluate(() => { window.targetProbe.time = window.targetProbe.live.song.duration + 1; });
  await page.getByText('AUTOPLAY · NOT SAVED', { exact: true }).waitFor();
  await noRecommendation();
  assert.deepEqual(await page.evaluate(() => window.targetProbe.bestRecords()), beforeDemo);
  await playTake('none', 'replay');
  await noRecommendation();
  assert.match(await page.locator('.session-practice-tip').innerText(), /aim to land one gem at a time/);

  phase = 'mobile recommendation touch and repeat preference';
  await reset.click();
  await section.selectOption('section:8');
  await repeat.check();
  await fullSong.click();
  await playTake();
  await assertSolo();
  await page.setViewportSize({ width: 390, height: 844 });
  await recommendation.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false,
    'Results recommendation must fit a phone without horizontal overflow');
  const buttonSize = await practiceButton.boundingBox();
  assert.ok(buttonSize && buttonSize.height >= 44 && buttonSize.width >= 44, 'Practice action must have a usable touch target');
  await screenshot('targeted-practice-results-mobile.png');
  await enterRecommended(true, true);
  await screenshot('targeted-practice-ready-mobile.png');

  phase = 'sparse sections do not produce confident coaching';
  await fullSong.click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await importFile(fixture(true), 'Sparse Practice');
  await playTake('sparse');
  await noRecommendation();
  assert.ok(await page.evaluate(() => [...window.targetProbe.live.judges.values()].some((judge) => judge.stats.perfect > 0)),
    'Sparse suppression must be exercised with real successful hits, not an empty take');
  assert.deepEqual(errors, []);
  console.log('PASS: real misses and broken holds select the highest-rate passage; results counts and original range; ready handoff preserves difficulty, tempo, lineup and repeat preference; fresh scoring and audible count-in; practice record isolation; practice/autoplay/all-miss/sparse suppression; replay replaces and clears recommendations; mobile touch and layout');
} catch (error) {
  console.error('Targeted practice regression failed during:', phase, error);
  console.error('Targeted practice page:', await page.locator('body').innerText().catch(() => 'Page unavailable'));
  console.error('Targeted practice probe:', await page.evaluate(() => {
    const p = window.targetProbe;
    return p && { time: p.time, status: p.live?.status, duration: p.live?.song.duration, begins: p.begins.length,
      running: p.audio?.running, bestReads: p.bestReads, bestWrites: p.bestWrites,
      stats: p.live && [...p.live.judges].map(([id, judge]) => ({ id, stats: judge.stats })) };
  }).catch(() => 'Probe unavailable'), { errors, navigations });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'targeted-practice-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
