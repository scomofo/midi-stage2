#!/usr/bin/env node
// Run against npm run dev. Exercise the real stage, imports, input, scoring and
// Web Audio. Only the song clock and delivery of audio initialization are held.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const screenshotDir = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
if (screenshotDir) {
  assert.ok(screenshotDir === '/workspace/screenshots' || screenshotDir.startsWith('/workspace/screenshots/'),
    'Practice screenshots must be stored under /workspace/screenshots');
  await mkdir(screenshotDir, { recursive: true });
}
const chartFile = {
  name: 'practice-boundaries.midistage.json', mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({
    schema: 'midi-stage-chart', version: 1, id: 'practice-boundaries', title: 'Practice Boundaries', bpm: 120, duration: 6,
    sections: [{ time: 0, name: 'Opening' }, { time: 2, name: 'Solo' }, { time: 4, name: 'Outro' }, { time: 5.5, name: 'Silence' }],
    parts: ['drums', 'keys', 'guitar', 'bass'].map((type) => ({ type, notes: type === 'keys' ? [
      { time: 0.5, duration: 0.2, pitch: 60, velocity: 100 },
      { time: 1.5, duration: 1, pitch: 60, velocity: 100 }, // Enters Solo from before its boundary.
      { time: 2, duration: 0.3, pitch: 60, velocity: 100 },
      { time: 2.5, duration: 0.3, pitch: 62, velocity: 100 },
      { time: 3, duration: 2, pitch: 64, velocity: 100 }, // Leaves Solo; must be clipped to one second.
      { time: 4, duration: 0.3, pitch: 65, velocity: 100 }, // Belongs only to Outro.
      { time: 5, duration: 0.3, pitch: 67, velocity: 100 },
    ] : [] })),
  })),
};

// Original 24-second percussion gives the audio importer enough material for
// more than one eight-bar section without relying on an external encoder.
function audioFile() {
  const rate = 16000;
  const samples = rate * 24;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const time = i / rate;
    const phase = (time - 0.25 + 0.5) % 0.5;
    const sample = time >= 0.25 && phase < 0.12
      ? 0.8 * Math.exp(-phase * 50) * Math.sin(2 * Math.PI * 150 * phase) : 0;
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return { name: 'Practice Percussion.wav', mimeType: 'audio/wav', buffer };
}

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
    const probe = window.practiceProbe = {
      time: -2, live: null, audio: null, begins: [], settled: 0,
      blockInit: false, pendingInit: [], clicks: [], starts: [], stops: [], bestReads: [], bestWrites: [],
    };
    const draw = StageRenderer.prototype.draw;
    StageRenderer.prototype.draw = function (state) { probe.live = state; return draw.call(this, state); };
    AudioEngine.prototype.songAt = function () { return probe.time; };
    const init = AudioEngine.prototype.init;
    AudioEngine.prototype.init = async function () {
      await init.call(this);
      if (probe.blockInit) await new Promise((done) => probe.pendingInit.push(done));
    };
    const begin = AudioEngine.prototype.begin;
    AudioEngine.prototype.begin = async function (options) {
      probe.audio = this;
      probe.begins.push(options);
      probe.time = options.countIn !== false ? -4 * 60 / options.song.bpm : options.seek;
      try { return await begin.call(this, options); }
      finally { probe.settled++; }
    };
    const click = AudioEngine.prototype.click;
    AudioEngine.prototype.click = function (at, accent) {
      probe.clicks.push({ generation: this.generation, at, accent });
      return click.call(this, at, accent);
    };
    const schedule = AudioEngine.prototype.schedule;
    // The scheduler is exercised at each event's real look-ahead boundary.
    // This avoids relying on timer punctuality on an overloaded CI worker.
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
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer?.duration > 10) probe.starts.push({ source: this, when: args[0], offset: args[1] ?? 0, duration: args[2], now: this.context.currentTime });
      return start.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args) {
      if (this.buffer?.duration > 10) probe.stops.push(this);
      return stop.apply(this, args);
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
    probe.readBest = (key) => get.call(localStorage, key);
    probe.seedBest = (key, value) => set.call(localStorage, key, value);
  });
  const start = page.getByRole('button', { name: 'Start set', exact: true });
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  const reset = page.getByRole('button', { name: 'Reset set', exact: true });
  const section = page.getByRole('combobox', { name: 'Practice section', exact: true });
  const repeat = page.getByRole('checkbox', { name: 'Repeat section', exact: true });
  const fullSong = page.getByRole('button', { name: 'Full song', exact: true });
  const results = page.locator('[data-session-overlay="results"]');
  const selectNamedSection = async (name) => {
    const value = await section.locator('option').evaluateAll((options, text) =>
      options.find((option) => option.value && option.textContent.includes(text))?.value, name);
    assert.ok(value, `Practice must offer ${name}`);
    await section.selectOption(value);
    await frames();
  };
  const ready = async () => {
    await frames();
    assert.equal(await start.isEnabled(), true);
    assert.equal(await pause.isEnabled(), false);
    assert.equal(await page.getByLabel('Elapsed time', { exact: true }).innerText(), '00:00');
    assert.equal(await page.evaluate(() => window.practiceProbe.audio?.running ?? false), false);
  };
  const begin = async (demo = false) => {
    const before = await page.evaluate(() => window.practiceProbe.begins.length);
    if (demo) await page.getByRole('button', { name: 'Watch the house', exact: true }).click();
    else await start.click();
    await page.waitForFunction((calls) => window.practiceProbe.begins.length === calls + 1
      && window.practiceProbe.live?.status === 'playing', before);
  };
  const endPass = async () => {
    await page.evaluate(() => { const p = window.practiceProbe; p.time = p.live.song.duration + 1; });
  };
  const countIn = () => page.evaluate(() => {
    const p = window.practiceProbe;
    const audio = p.audio;
    const options = p.begins.at(-1);
    const beat = 60 / options.song.bpm;
    if (options.countIn === false || options.seek !== 0) throw Error('Each pass must start with a fresh count-in');
    const beats = audio.events.filter((event) => event.click && event.time < 0);
    if (beats.length !== 4 || beats.some((event, i) => Math.abs(event.time - (-4 + i) * beat) > 1e-6))
      throw Error('Every pass needs all four count-in beats');
    const generation = audio.generation;
    for (const event of beats) p.scheduleAt(audio.origin + event.time / audio.speed - 0.06);
    const dispatched = p.clicks.filter((event) => event.generation === generation);
    if (dispatched.length !== 4 || !dispatched[0].accent) throw Error('Count-in must dispatch four actual Web Audio clicks');
  });
  const noBestAccess = async () => assert.deepEqual(await page.evaluate(() => {
    const p = window.practiceProbe;
    return { reads: p.bestReads, writes: p.bestWrites };
  }), { reads: [], writes: [] }, 'Practice must neither read nor write full-song personal records');
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

  phase = 'built-in section selection';
  await frames();
  const builtin = await page.evaluate(() => {
    const song = window.practiceProbe.live.song;
    return { duration: song.duration, names: song.sections.map((item) => item.name) };
  });
  assert.ok(builtin.names.length > 1, 'Built-in fixture must contain named sections');
  await selectNamedSection(builtin.names[1]);
  assert.equal(await repeat.isChecked(), true, 'Practice should repeat by default');
  assert.ok(await page.evaluate(() => window.practiceProbe.live.song.duration) < builtin.duration);
  await fullSong.click();
  await ready();
  assert.equal(await page.evaluate(() => window.practiceProbe.live.song.duration), builtin.duration);

  phase = 'section boundaries and personal records';
  await importFile(chartFile, 'Practice Boundaries');
  await page.evaluate(() => {
    const p = window.practiceProbe;
    p.savedKey = `midi-stage-best/${p.live.song.id}/standard/1/keys`;
    p.fullSongLanes = p.live.judges.get('keys').lanes.map((lane) => lane.pitch);
    p.seedBest(p.savedKey, '98765');
    p.bestReads = [];
    p.bestWrites = [];
  });
  await selectNamedSection('Solo');
  await noBestAccess();
  await begin();
  await countIn();
  assert.deepEqual(await page.evaluate(() => window.practiceProbe.live.judges.get('keys').lanes.map((lane) => lane.pitch)),
    await page.evaluate(() => window.practiceProbe.fullSongLanes), 'Section practice must preserve full-song lane positions and keyboard mappings');
  assert.deepEqual(await page.evaluate(() => {
    const p = window.practiceProbe;
    return { duration: p.live.song.duration, notes: p.live.judges.get('keys').notes.map(({ time, duration, pitch }) => ({ time, duration, pitch })) };
  }), { duration: 2, notes: [
    { time: 0, duration: 0.3, pitch: 60 },
    { time: 0.5, duration: 0.3, pitch: 62 },
    { time: 1, duration: 1, pitch: 64 },
  ] }, 'Practice must rebase onsets, clip the outgoing hold, and exclude both adjacent sections');

  phase = 'held input and first repeat';
  await page.evaluate(() => { const p = window.practiceProbe; p.firstJudge = p.live.judges.get('keys'); p.time = 0; });
  await page.keyboard.press('KeyA');
  await page.evaluate(() => { window.practiceProbe.time = 1; });
  await page.keyboard.down('KeyW');
  await page.evaluate(() => {
    const p = window.practiceProbe;
    if (!p.firstJudge.activeHolds.size || !p.audio.monitorVoices.size) throw Error('Fixture must have a real held note and monitor voice');
  });
  let before = await page.evaluate(() => window.practiceProbe.begins.length);
  await endPass();
  await page.waitForFunction((calls) => window.practiceProbe.begins.length === calls + 1
    && window.practiceProbe.live?.status === 'playing', before);
  await countIn();
  assert.match(await page.locator('.practice-status').innerText(), /Take 2/);
  assert.match(await page.locator('.practice-status').innerText(), /Last take:.*accuracy.*points/);
  await page.evaluate(() => {
    const p = window.practiceProbe;
    const current = p.live.judges.get('keys');
    if (current === p.firstJudge || current.stats.score || current.stats.offsets.length || current.activeHolds.size
      || p.audio.monitorVoices.size || p.live.pressed.size) throw Error('Repeat must replace scoring and clear held input, voices and highlights');
    p.secondJudge = current;
    p.time = 1;
  });
  await page.keyboard.down('KeyW'); // Browser repeat: the physical key is still down.
  assert.equal(await page.evaluate(() => window.practiceProbe.secondJudge.stats.score), 0,
    'A held key must not score on the next pass without a fresh press');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyW');
  assert.ok(await page.evaluate(() => window.practiceProbe.secondJudge.stats.score) > 0,
    'A fresh press must score normally after the repeat');
  await page.keyboard.up('KeyW');
  await screenshot('practice-repeat-desktop.png');

  phase = 'second repeat and paused count-in';
  before = await page.evaluate(() => window.practiceProbe.begins.length);
  await endPass();
  await page.waitForFunction((calls) => window.practiceProbe.begins.length === calls + 1
    && window.practiceProbe.live?.status === 'playing', before);
  await countIn();
  assert.match(await page.locator('.practice-status').innerText(), /Take 3/);
  await page.evaluate(() => {
    const p = window.practiceProbe;
    p.thirdJudge = p.live.judges.get('keys');
    p.time = -1.2;
  });
  await pause.click();
  await resume.click();
  await page.waitForFunction(() => window.practiceProbe.audio.running && window.practiceProbe.live.status === 'playing');
  await page.evaluate(() => {
    const p = window.practiceProbe;
    const options = p.begins.at(-1);
    if (options.countIn !== false || options.seek !== -1.2 || p.live.judges.get('keys') !== p.thirdJudge)
      throw Error('Pausing a repeat count-in must preserve its position and current judge');
    const beats = p.audio.events.filter((event) => event.click && event.time < 0);
    if (JSON.stringify(beats.map((event) => event.time)) !== JSON.stringify([-1, -0.5]))
      throw Error('Resumed count-in must contain only the remaining two beats');
    const generation = p.audio.generation;
    for (const event of beats) p.scheduleAt(p.audio.origin + event.time / p.audio.speed - 0.06);
    if (p.clicks.filter((event) => event.generation === generation).length !== 2)
      throw Error('The remaining count-in beats must dispatch audio clicks');
  });
  await repeat.uncheck();
  before = await page.evaluate(() => window.practiceProbe.begins.length);
  await endPass();
  await results.waitFor();
  assert.match(await results.innerText(), /PRACTICE COMPLETE/);
  assert.match(await results.innerText(), /PRACTICE · NOT SAVED/);
  assert.equal(await page.evaluate(() => window.practiceProbe.begins.length), before,
    'Disabling Repeat must finish this pass without starting another');
  await noBestAccess();
  await screenshot('practice-results-desktop.png');

  phase = 'practice autoplay and restored full-song best';
  await reset.click();
  await repeat.check();
  before = await page.evaluate(() => window.practiceProbe.begins.length);
  await begin(true);
  await endPass();
  await results.waitFor();
  assert.equal(await page.evaluate(() => window.practiceProbe.begins.length), before + 1,
    'Autoplay must finish once even when repeat is selected');
  await noBestAccess();
  await fullSong.click();
  await ready();
  assert.equal(await page.evaluate(() => window.practiceProbe.readBest(window.practiceProbe.savedKey)), '98765');
  assert.match(await page.locator('.hud-personal-best').innerText(), /98,765/);

  phase = 'empty passage recovery';
  await selectNamedSection('Silence');
  before = await page.evaluate(() => window.practiceProbe.begins.length);
  await start.click();
  await page.getByRole('status').filter({ hasText: /no notes/i }).waitFor();
  await ready();
  assert.equal(await page.evaluate(() => window.practiceProbe.begins.length), before,
    'An empty selected passage must explain recovery without starting or looping');
  await fullSong.click();

  phase = 'cancelling pending repeat starts';
  for (const action of ['reset', 'full-song', 'settings']) {
    await selectNamedSection('Solo');
    await repeat.check();
    await begin();
    await page.evaluate(() => { window.practiceProbe.blockInit = true; });
    await endPass();
    await page.waitForFunction(() => window.practiceProbe.pendingInit.length > 0);
    const pending = await page.evaluate(() => window.practiceProbe.begins.length);
    if (action === 'full-song') await fullSong.click();
    else {
      await reset.click();
      if (action === 'settings') await page.getByRole('combobox', { name: /TEMPO/ }).selectOption('0.75');
    }
    await page.evaluate(() => {
      const p = window.practiceProbe;
      p.blockInit = false;
      p.pendingInit.splice(0).forEach((done) => done());
    });
    await page.waitForFunction((calls) => window.practiceProbe.settled === calls, pending);
    await ready();
    assert.equal(await page.evaluate(() => window.practiceProbe.begins.length), pending,
      `${action} must invalidate the abandoned repeat without another start`);
    if (action !== 'full-song') await fullSong.click();
  }

  phase = 'interrupted initialization preserves the first count-in';
  await selectNamedSection('Solo');
  await page.evaluate(() => { window.practiceProbe.blockInit = true; });
  await start.click();
  await page.waitForFunction(() => window.practiceProbe.pendingInit.length > 0);
  before = await page.evaluate(() => window.practiceProbe.begins.length);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.locator('[data-session-overlay="paused"]').waitFor();
  await page.evaluate(() => {
    const p = window.practiceProbe;
    p.blockInit = false;
    p.pendingInit.splice(0).forEach((done) => done());
  });
  await page.waitForFunction((calls) => window.practiceProbe.settled === calls, before);
  assert.equal(await page.evaluate(() => window.practiceProbe.audio.running), false,
    'An interrupted start must not become audible after initialization resolves');
  await resume.click();
  await page.waitForFunction(() => window.practiceProbe.audio.running && window.practiceProbe.live.status === 'playing');
  await page.evaluate(() => {
    const p = window.practiceProbe;
    const options = p.begins.at(-1);
    const beats = p.audio.events.filter((event) => event.click && event.time < 0);
    if (options.countIn !== false || options.seek !== -2 || beats.length !== 4)
      throw Error('Resuming an interrupted first start still owes the complete four-beat count-in');
    const generation = p.audio.generation;
    for (const event of beats) p.scheduleAt(p.audio.origin + event.time / p.audio.speed - 0.06);
    if (p.clicks.filter((event) => event.generation === generation).length !== 4)
      throw Error('Recovered first count-in must dispatch all four audible clicks');
  });
  await fullSong.click();

  phase = 'original audio offsets, resume and replay';
  await importFile(audioFile(), 'Practice Percussion');
  const audioOptions = await section.locator('option').evaluateAll((options) => options.filter((option) => option.value).map((option) => ({ value: option.value, label: option.textContent })));
  assert.ok(audioOptions.length >= 2, 'An unsectioned recording must offer successive eight-bar ranges');
  await page.evaluate(() => {
    const p = window.practiceProbe;
    p.originalAudioSong = p.live.song;
    p.bestReads = [];
    p.bestWrites = [];
  });
  await section.selectOption(audioOptions[1].value);
  await frames();
  await repeat.check();
  await begin();
  await page.waitForFunction(() => Boolean(window.practiceProbe.audio.backingSource));
  await page.evaluate(() => {
    const p = window.practiceProbe;
    const options = p.begins.at(-1);
    const source = p.audio.backingSource;
    const started = p.starts.at(-1);
    const offset = (p.originalAudioSong.audioOffset ?? 0) - options.song.audioOffset;
    if (!(offset > 0) || source.buffer !== options.backingBuffer || Math.abs(started.offset - offset) > 1e-6
      || Math.abs(started.duration - options.song.duration) > 1e-6 || source.playbackRate.value !== 0.75
      || started.when - started.now < 1) throw Error('Practice must play only its range from the original recording after the count-in');
    p.audioSectionOffset = offset;
    p.firstBacking = source;
    p.time = 0.75;
  });
  await pause.click();
  await page.evaluate(() => {
    const p = window.practiceProbe;
    if (p.audio.backingSource || !p.stops.includes(p.firstBacking)) throw Error('Pause must stop the old recording source');
  });
  await resume.click();
  await page.waitForFunction(() => Boolean(window.practiceProbe.audio.backingSource));
  await page.evaluate(() => {
    const p = window.practiceProbe;
    const started = p.starts.at(-1);
    if (Math.abs(started.offset - (p.audioSectionOffset + 0.75)) > 1e-6
      || Math.abs(started.duration - (p.live.song.duration - 0.75)) > 1e-6 || started.source === p.firstBacking)
      throw Error('Resume must seek within the selected section and keep its end boundary');
    p.resumedBacking = started.source;
  });
  before = await page.evaluate(() => window.practiceProbe.begins.length);
  await endPass();
  await page.waitForFunction((calls) => window.practiceProbe.begins.length === calls + 1
    && Boolean(window.practiceProbe.audio.backingSource) && window.practiceProbe.live.status === 'playing', before);
  await page.evaluate(() => {
    const p = window.practiceProbe;
    const started = p.starts.at(-1);
    if (started.offset !== p.audioSectionOffset || started.duration !== p.live.song.duration
      || !p.stops.includes(p.resumedBacking)) throw Error('Audio repeat must release the previous source and return to the original section offset');
  });
  await noBestAccess();

  phase = 'mobile practice controls and touch';
  await pause.click();
  await reset.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot('practice-ready-mobile.png');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await begin();
  await page.evaluate(() => {
    const p = window.practiceProbe;
    const judge = [...p.live.judges.values()][0];
    p.mobileJudge = judge;
    p.time = judge.notes[0].time;
  });
  await page.locator('.pad').tap();
  assert.ok(await page.evaluate(() => window.practiceProbe.mobileJudge.stats.score) > 0);
  await screenshot('practice-playing-mobile.png');
  await fullSong.click();
  await ready();
  assert.equal(await page.evaluate(() => window.practiceProbe.audio.backingSource), null);
  assert.deepEqual(errors, []);
  console.log('PASS: named and eight-bar sections; rebased boundaries and clipped holds; two repeats with audible count-ins; fresh scoring, held-input and voice cleanup; paused count-in resume; repeat-off results; practice/autoplay personal-best isolation; pending repeat cancellation; original audio section offsets, bounded duration, tempo, seek/resume/replay cleanup; mobile touch and layout');
} catch (error) {
  console.error('Practice regression failed during:', phase, error);
  console.error('Practice regression page:', await page.locator('body').innerText().catch(() => 'Page unavailable'));
  console.error('Practice probe:', await page.evaluate(() => {
    const p = window.practiceProbe;
    return p && { time: p.time, status: p.live?.status, duration: p.live?.song.duration, begins: p.begins.length,
      settled: p.settled, pending: p.pendingInit.length, running: p.audio?.running, errors: p.errors,
      bestReads: p.bestReads, bestWrites: p.bestWrites };
  }).catch(() => 'Probe unavailable'), { errors, navigations });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'practice-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
