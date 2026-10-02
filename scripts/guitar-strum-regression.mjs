#!/usr/bin/env node
// Exercise the authored guitar chart through the real renderer, judge, audio
// engine and browser input. Only the song clock is controlled.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  const input = Object.assign(new EventTarget(), { id: 'strum-qa-midi', name: 'Guitar regression keyboard', manufacturer: 'MIDI Stage QA', state: 'connected' });
  const access = Object.assign(new EventTarget(), { inputs: new Map([[input.id, input]]) });
  window.sendGuitarQaMidi = (pitch, velocity = 100) => {
    const event = new Event('midimessage');
    Object.defineProperty(event, 'data', { value: new Uint8Array([0x90, pitch, velocity]) });
    input.dispatchEvent(event);
  };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
});
const fretKeys = ['z', 'x', 'c', 'v', 'b'];
let phase = 'loading';

try {
  const frames = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const screenshot = async (name) => {
    if (output) await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  };
  const fret = (lane) => page.getByRole('button', { name: `Fret ${lane + 1}`, exact: true, includeHidden: true });
  const down = page.getByRole('button', { name: 'Strum down', exact: true });
  const up = page.getByRole('button', { name: 'Strum up', exact: true });
  const canvas = page.locator('.stage-canvas');
  const start = page.getByRole('button', { name: 'Start set', exact: true });
  const reset = page.getByRole('button', { name: 'Reset set', exact: true });
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  const section = page.getByRole('combobox', { name: 'Practice section', exact: true });
  const finder = page.getByRole('dialog', { name: 'Stage finder', exact: true });
  const command = async (id) => {
    await page.keyboard.press('Control+k');
    await finder.waitFor();
    await finder.locator(`[data-command-id="${id}"]`).click();
    await finder.waitFor({ state: 'hidden' });
    await frames();
  };
  const setTime = async (time) => { await page.evaluate((time) => { window.guitarProbe.time = time; }, time); await frames(); };
  const stats = () => page.evaluate(() => ({ ...window.guitarProbe.live.judges.get('guitar').stats }));
  const voices = () => page.evaluate(() => window.guitarProbe.monitors.length);
  const holdFrets = async (lanes) => { for (const lane of lanes) await page.keyboard.down(fretKeys[lane]); await frames(); };
  const releaseFrets = async (lanes) => { for (const lane of lanes) await page.keyboard.up(fretKeys[lane]); await frames(); };
  const groups = () => page.evaluate(() => {
    const notes = window.guitarProbe.live.judges.get('guitar').notes;
    const byTime = new Map();
    for (const note of notes) {
      const group = byTime.get(note.time) ?? { time: note.time, lanes: [], ids: [], duration: 0 };
      group.lanes.push(note.lane);
      group.ids.push(note.id);
      group.duration = Math.max(group.duration, note.duration);
      byTime.set(note.time, group);
    }
    return [...byTime.values()];
  });
  const noteStates = (group) => page.evaluate((ids) => window.guitarProbe.live.judges.get('guitar').notes
    .filter((note) => ids.includes(note.id)).map((note) => ({ state: note.state, hold: note.hold })), group.ids);
  const assertUnpressed = async () => {
    await frames();
    for (let lane = 0; lane < 5; lane++) assert.equal(await fret(lane).getAttribute('aria-pressed'), 'false');
  };
  const begin = async (demo = false) => {
    await setTime(-1);
    const before = await page.evaluate(() => window.guitarProbe.begins);
    await (demo ? page.getByRole('button', { name: /^(Watch the house|Play along)$/ }).last() : start).click();
    await page.waitForFunction((before) => window.guitarProbe.begins === before + 1
      && window.guitarProbe.live.status === 'playing' && window.guitarProbe.audio.running, before);
    await canvas.focus();
  };
  const fresh = async () => {
    await releaseFrets([0, 1, 2, 3, 4]);
    await reset.click();
    await assertUnpressed();
    await begin();
  };

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Start set' && !button.disabled));
  await page.evaluate(async () => {
    const { StageRenderer } = await import('/src/lib/midi-stage/renderer.ts');
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const probe = window.guitarProbe = { live: null, audio: null, begins: 0, time: -1, monitors: [] };
    const draw = StageRenderer.prototype.draw;
    StageRenderer.prototype.draw = function (state) { probe.live = state; return draw.call(this, state); };
    AudioEngine.prototype.songAt = function () { return probe.time; };
    const begin = AudioEngine.prototype.begin;
    AudioEngine.prototype.begin = function (options) { probe.audio = this; probe.begins++; return begin.call(this, options); };
    const monitor = AudioEngine.prototype.monitor;
    AudioEngine.prototype.monitor = function (...args) { probe.monitors.push(args); return monitor.apply(this, args); };
  });
  await page.waitForFunction(() => window.guitarProbe.live);

  phase = 'real-guitar scored start requires a usable MIDI route';
  console.log(`Guitar check: ${phase}`);
  await command('song:backline-drive');
  assert.equal(await start.count(), 0, 'Disconnected guitar should offer setup before a scored take');
  await page.locator('.session-actions').getByRole('button', { name: 'Connect guitar MIDI', exact: true }).waitFor();
  await page.locator('.session-actions').getByRole('button', { name: 'Play along', exact: true }).waitFor();
  await begin(true);
  assert.equal(await page.evaluate(() => window.guitarProbe.live.demo), true, 'Play along must be unscored autoplay');
  await pause.click();
  await resume.click();
  await page.waitForFunction(() => window.guitarProbe.live.status === 'playing' && window.guitarProbe.live.demo);
  await reset.click();
  const assertGatedStart = async () => {
    const before = await page.evaluate(() => window.guitarProbe.begins);
    await canvas.focus();
    await page.keyboard.press('Enter');
    await page.getByText('Connect a guitar MIDI input in Soundcheck, or choose Play along without scoring.', { exact: true }).first().waitFor();
    await page.locator('#soundcheck-panel').waitFor();
    await frames();
    assert.equal(await page.evaluate(() => window.guitarProbe.live.status), 'ready');
    assert.equal(await page.evaluate(() => window.guitarProbe.begins), before, 'A blocked scored start must not begin audio');
    assert.equal(await page.evaluate(() => window.guitarProbe.audio?.running ?? false), false);
    assert.equal((await stats()).score, 0);
  };
  await assertGatedStart();
  await page.getByRole('button', { name: 'Close soundcheck', exact: true }).click();
  const beforeConnect = await page.evaluate(() => window.guitarProbe.begins);
  await page.locator('.session-actions').getByRole('button', { name: 'Connect guitar MIDI', exact: true }).click();
  await page.getByRole('button', { name: 'MIDI connected', exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'soundcheck-title');
  assert.equal(await page.evaluate(() => window.guitarProbe.live.status), 'ready', 'Connecting must not start playback');
  assert.equal(await page.evaluate(() => window.guitarProbe.begins), beforeConnect);
  await page.getByRole('combobox', { name: 'Guitar MIDI input', exact: true }).selectOption('off');
  await page.getByRole('button', { name: 'Close soundcheck', exact: true }).click();
  await assertGatedStart();
  await page.getByRole('combobox', { name: 'Guitar MIDI input', exact: true }).selectOption('auto');
  await page.getByRole('button', { name: 'Close soundcheck', exact: true }).click();

  phase = 'arcade chart selection';
  console.log(`Guitar check: ${phase}`);
  await command('song:backline-drive-arcade');
  await down.waitFor();
  assert.equal(await page.evaluate(() => window.guitarProbe.live.song.guitarMode), 'fret-strum');
  assert.deepEqual(await page.evaluate(() => window.guitarProbe.live.players.filter((player) => player.enabled).map((player) => player.id)), ['guitar']);
  assert.equal(await page.evaluate(() => window.guitarProbe.live.judges.get('guitar').lanes.length), 5);
  for (let lane = 0; lane < 5; lane++) await fret(lane).waitFor();
  assert.match(await page.locator('body').innerText(), /Choose another song to play MIDI\./, 'The keyboard/touch input scope must be explicit');
  await screenshot('guitar-strum-desktop');
  await begin();
  const authored = await groups();
  const single = authored.find((group) => group.lanes.length === 1 && group.duration < 0.35);
  const chord = authored.find((group) => group.lanes.length > 1 && group.lanes.length < 5);
  const sustain = authored.find((group) => group.duration >= 0.5);
  assert.ok(single && chord && sustain, 'Backline Drive · Arcade must teach single notes, chords and holds');

  phase = 'frets alone never hit or sound; an explicit strum scores';
  console.log(`Guitar check: ${phase}`);
  await setTime(single.time);
  const soundsBeforeFret = await voices();
  const scoreBeforeFret = (await stats()).score;
  await page.evaluate((ids) => {
    const note = window.guitarProbe.live.judges.get('guitar').notes.find((note) => ids.includes(note.id));
    window.sendGuitarQaMidi(note.pitch);
    window.sendGuitarQaMidi(note.pitch, 0);
  }, single.ids);
  await frames();
  assert.equal((await stats()).score, scoreBeforeFret, 'MIDI must not bypass the explicit fret-and-strum controls');
  assert.equal(await voices(), soundsBeforeFret);
  await assertUnpressed();
  await holdFrets(single.lanes);
  assert.equal((await stats()).score, scoreBeforeFret);
  assert.equal(await voices(), soundsBeforeFret);
  assert.equal(await fret(single.lanes[0]).getAttribute('aria-pressed'), 'true');
  assert.deepEqual((await noteStates(single)).map((note) => note.state), [0]);
  await page.keyboard.press('ArrowDown');
  assert.deepEqual((await noteStates(single)).map((note) => note.state), [1]);
  assert.equal((await stats()).perfect, 1);
  assert.ok(await voices() > soundsBeforeFret, 'A strum must produce monitored guitar audio');

  phase = 'chords reject missing, wrong and extra frets atomically';
  console.log(`Guitar check: ${phase}`);
  await fresh();
  await setTime(chord.time);
  const scoreBeforeChord = (await stats()).score;
  const extraBeforeChord = (await stats()).extra;
  await holdFrets(chord.lanes.slice(0, 1));
  await page.keyboard.press('ArrowUp');
  assert.equal((await stats()).extra, extraBeforeChord + 1);
  assert.equal((await stats()).score, scoreBeforeChord);
  assert.ok((await noteStates(chord)).every((note) => note.state === 0));
  await releaseFrets(chord.lanes);
  const spare = [0, 1, 2, 3, 4].find((lane) => !chord.lanes.includes(lane));
  await holdFrets([spare]);
  await page.keyboard.press('Space');
  assert.equal((await stats()).extra, extraBeforeChord + 2);
  assert.equal((await stats()).score, scoreBeforeChord);
  await holdFrets(chord.lanes);
  await page.keyboard.press('ArrowDown');
  assert.equal((await stats()).extra, extraBeforeChord + 3);
  assert.ok((await noteStates(chord)).every((note) => note.state === 0));
  await releaseFrets([spare]);
  await page.keyboard.down('ArrowUp');
  assert.ok((await noteStates(chord)).every((note) => note.state === 1));
  assert.equal((await stats()).perfect, chord.lanes.length, 'A correct chord scores each gem in one strum');
  const scored = await stats();
  const sounded = await voices();
  await page.keyboard.down('ArrowUp');
  await page.keyboard.up('ArrowUp');
  assert.deepEqual(await stats(), scored, 'Auto-repeat must not restrum or add an extra press');
  assert.equal(await voices(), sounded);

  phase = 'sustains complete with held frets and break on early release';
  console.log(`Guitar check: ${phase}`);
  await fresh();
  await setTime(sustain.time);
  await holdFrets(sustain.lanes);
  await page.keyboard.press('Space');
  assert.ok((await noteStates(sustain)).some((note) => note.hold === 'held'));
  await setTime(sustain.time + sustain.duration);
  await releaseFrets(sustain.lanes);
  assert.ok((await noteStates(sustain)).some((note) => note.hold === 'complete'));
  assert.equal((await stats()).holdBreaks, 0);
  await fresh();
  await setTime(sustain.time);
  await holdFrets(sustain.lanes);
  await page.keyboard.press('ArrowDown');
  await setTime(sustain.time + 0.1);
  await releaseFrets(sustain.lanes);
  assert.ok((await noteStates(sustain)).some((note) => note.hold === 'broken'));
  assert.ok((await stats()).holdBreaks > 0);

  phase = 'manual pause preserves ownership and resume preserves the take';
  console.log(`Guitar check: ${phase}`);
  await fresh();
  await setTime(sustain.time);
  await holdFrets(sustain.lanes);
  await page.keyboard.press('ArrowDown');
  await page.evaluate(() => { window.guitarProbe.originalJudge = window.guitarProbe.live.judges.get('guitar'); });
  const pauseScore = (await stats()).score;
  await pause.click();
  await page.waitForFunction(() => window.guitarProbe.live.status === 'paused');
  for (const lane of sustain.lanes) assert.equal(await fret(lane).getAttribute('aria-pressed'), 'true');
  assert.equal((await stats()).score, pauseScore);
  await resume.click();
  await page.waitForFunction(() => window.guitarProbe.live.status === 'playing');
  assert.equal(await page.evaluate(() => window.guitarProbe.live.judges.get('guitar') === window.guitarProbe.originalJudge), true);
  assert.ok((await noteStates(sustain)).some((note) => note.hold === 'held'));
  await setTime(sustain.time + sustain.duration);
  await releaseFrets(sustain.lanes);
  assert.ok((await noteStates(sustain)).some((note) => note.hold === 'complete'));

  phase = 'finder isolates typing; blur and reset release unattended input';
  console.log(`Guitar check: ${phase}`);
  await fresh();
  await holdFrets([0]);
  await page.keyboard.press('Control+k');
  await finder.waitFor();
  await page.keyboard.up('z');
  await finder.getByRole('combobox').pressSequentially('zxcvb');
  await assertUnpressed();
  await page.keyboard.press('Escape');
  await finder.waitFor({ state: 'hidden' });
  await fresh();
  await setTime(sustain.time);
  await holdFrets(sustain.lanes);
  await page.keyboard.press('ArrowDown');
  await setTime(sustain.time + 0.1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => window.guitarProbe.live.status === 'paused');
  await assertUnpressed();
  assert.equal(await page.evaluate(() => window.guitarProbe.audio.monitorVoices.size), 0);
  assert.ok((await noteStates(sustain)).some((note) => note.hold === 'broken'));
  await releaseFrets(sustain.lanes);
  await reset.click();
  await canvas.focus();
  await holdFrets([0, 4]);
  await reset.click();
  await assertUnpressed();
  await releaseFrets([0, 4]);

  phase = 'practice keeps five frets and a restorable rehearsal';
  console.log(`Guitar check: ${phase}`);
  const passageId = await section.locator('option').nth(1).getAttribute('value');
  await section.selectOption(passageId);
  await page.getByRole('checkbox', { name: 'Repeat section', exact: true }).uncheck();
  await begin();
  assert.equal(await page.evaluate(() => window.guitarProbe.live.judges.get('guitar').lanes.length), 5);
  await reset.click();
  await section.selectOption('');
  await page.getByRole('button', { name: /^Continue rehearsal:/ }).click();
  assert.equal(await section.inputValue(), passageId);
  assert.equal(await page.evaluate(() => window.guitarProbe.live.status), 'ready');
  assert.equal(await page.evaluate(() => window.guitarProbe.live.judges.get('guitar').lanes.length), 5);

  phase = 'autoplay stays isolated from physical strums';
  console.log(`Guitar check: ${phase}`);
  await begin(true);
  const demoGroup = (await groups())[0];
  await setTime(demoGroup.time);
  const demoStats = await stats();
  const demoVoices = await voices();
  await holdFrets(demoGroup.lanes);
  await page.keyboard.press('ArrowDown');
  await releaseFrets(demoGroup.lanes);
  assert.deepEqual(await stats(), demoStats);
  assert.equal(await voices(), demoVoices);
  await reset.click();
  await section.selectOption('');

  phase = 'phone multi-touch, assistive latch and strum scroll prevention';
  console.log(`Guitar check: ${phase}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await begin();
  await setTime(chord.time);
  await down.scrollIntoViewIfNeeded();
  for (const control of [...Array.from({ length: 5 }, (_, lane) => fret(lane)), down, up]) {
    const bounds = await control.boundingBox();
    assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44, 'Every guitar control needs a 44px touch target');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const center = async (locator, id) => {
    const bounds = await locator.boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 844, 'Touch controls must be in view together');
    return { id, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  };
  const client = await page.context().newCDPSession(page);
  const contacts = await Promise.all(chord.lanes.map((lane, i) => center(fret(lane), i + 1)));
  const strumContact = await center(down, 10);
  const beforeTouch = (await stats()).score;
  const extraBeforeTouch = (await stats()).extra;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: contacts });
  assert.equal((await stats()).score, beforeTouch, 'Touch frets alone must not score');
  for (const lane of chord.lanes) assert.equal(await fret(lane).getAttribute('aria-pressed'), 'true');
  const scrollBefore = await page.evaluate(() => scrollY);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts, strumContact] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: contacts });
  assert.ok((await noteStates(chord)).every((note) => note.state === 1));
  assert.equal((await stats()).extra, extraBeforeTouch, 'A touch strum must not also synthesize a second scored click');
  assert.equal(await page.evaluate(() => scrollY), scrollBefore);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await assertUnpressed();
  await fresh();
  await setTime(single.time);
  await fret(single.lanes[0]).press('Enter');
  assert.equal(await fret(single.lanes[0]).getAttribute('aria-pressed'), 'true', 'Assistive activation must latch a fret');
  await up.tap();
  assert.equal((await noteStates(single))[0].state, 1);
  await fret(single.lanes[0]).press('Enter');
  await assertUnpressed();
  await screenshot('guitar-strum-mobile');
  if (output) await page.screenshot({ path: `${output}/guitar-strum-mobile-viewport.png`, fullPage: false });

  phase = 'real guitar uses six authored strings and exact MIDI pitch';
  console.log(`Guitar check: ${phase}`);
  await reset.click();
  await canvas.focus();
  await holdFrets([0]);
  await command('song:backline-drive');
  await releaseFrets([0]);
  assert.equal(await page.evaluate(() => window.guitarProbe.live.pressed.size), 0, 'Changing chart must clear prior arcade fret ownership');
  assert.equal(await down.count(), 0, 'The real guitar chart must use its string guide instead of arcade buttons');
  const stringGuide = page.getByRole('region', { name: 'Real guitar guide', exact: true });
  await stringGuide.waitFor();
  await stringGuide.scrollIntoViewIfNeeded();
  assert.match(await stringGuide.innerText(), /Standard tuning/i);
  assert.match(await stringGuide.innerText(), /Pitch scoring/i);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await screenshot('guitar-strings-mobile');
  const realChart = await page.evaluate(() => {
    const { song, judges } = window.guitarProbe.live;
    const judge = judges.get('guitar');
    return {
      mode: song.guitarMode, tuning: song.guitarTuning, lanes: judge.lanes.length,
      notes: judge.notes.map((note) => ({ id: note.id, time: note.time, pitch: note.pitch, position: note.guitarPosition })),
    };
  });
  assert.equal(realChart.mode, 'strings');
  assert.equal(realChart.lanes, 6);
  assert.deepEqual(realChart.tuning, [40, 45, 50, 55, 59, 64]);
  assert.ok(realChart.notes.length > 0);
  for (const note of realChart.notes) {
    assert.ok(note.position && Number.isInteger(note.position.string) && note.position.string >= 1 && note.position.string <= 6);
    assert.ok(Number.isInteger(note.position.fret) && note.position.fret >= 0);
    assert.equal(note.pitch, realChart.tuning[6 - note.position.string] + note.position.fret,
      'Every displayed string/fret position must produce its authored MIDI pitch');
  }
  const exactNote = realChart.notes.find((note) => realChart.notes.filter((other) => other.time === note.time).length === 1);
  assert.ok(exactNote, 'Real guitar fixture needs an isolated note for exact-pitch acceptance');
  await begin();
  await setTime(exactNote.time);
  await page.waitForTimeout(180);
  const beforeReal = await stats();
  await page.keyboard.press('z');
  assert.deepEqual(await stats(), beforeReal, 'Computer-key audition must not score a real guitar pitch');
  await page.evaluate((pitch) => { window.sendGuitarQaMidi(pitch + 12); window.sendGuitarQaMidi(pitch + 12, 0); }, exactNote.pitch);
  assert.equal((await stats()).extra, beforeReal.extra + 1, 'An octave substitution is one extra, not a matching real-guitar note');
  assert.equal((await stats()).score, beforeReal.score);
  assert.equal(await page.evaluate((id) => window.guitarProbe.live.judges.get('guitar').notes.find((note) => note.id === id).state, exactNote.id), 0);
  const pitchFeedback = stringGuide.locator('.guitar-pitch-feedback');
  await page.waitForFunction(() => document.querySelector('.guitar-pitch-feedback')?.dataset.kind === 'octave');
  assert.match(await pitchFeedback.innerText(), /Octave differs/);
  const pitchNames = await page.evaluate(async (pitch) => {
    const { noteName } = await import('/src/lib/midi-stage/engine.ts');
    return { played: noteName(pitch + 12), target: noteName(pitch) };
  }, exactNote.pitch);
  assert.match(await pitchFeedback.innerText(), new RegExp(pitchNames.played));
  assert.match(await pitchFeedback.innerText(), new RegExp(pitchNames.target));
  assert.deepEqual(await page.evaluate(() => window.guitarProbe.live.flashes.map(({ lane, kind }) => ({ lane, kind }))), [],
    'A rejected pitch cannot flash an inferred guitar string');
  await page.evaluate((pitch) => { window.sendGuitarQaMidi(pitch); window.sendGuitarQaMidi(pitch, 0); }, exactNote.pitch);
  assert.equal(await page.evaluate((id) => window.guitarProbe.live.judges.get('guitar').notes.find((note) => note.id === id).state, exactNote.id), 1);
  assert.equal((await stats()).perfect, beforeReal.perfect + 1);
  assert.ok((await stats()).score > beforeReal.score);
  await page.waitForFunction(() => document.querySelector('.guitar-pitch-feedback')?.dataset.kind === 'matched');
  assert.match(await pitchFeedback.innerText(), /Perfect/);
  await screenshot('guitar-pitch-matched-mobile');
  await pause.click();
  assert.equal(await pitchFeedback.count(), 0, 'Pause must hide recent scored input');
  await resume.click();
  await page.waitForFunction(() => window.guitarProbe.live.status === 'playing');
  assert.equal(await pitchFeedback.getAttribute('data-kind'), 'listening', 'Resume must not repeat the old pitch diagnostic');

  phase = 'between-target and unrelated pitch feedback stays neutral';
  console.log(`Guitar check: ${phase}`);
  await reset.click();
  await begin();
  const firstRealTime = realChart.notes[0].time;
  const secondRealTime = realChart.notes.find((note) => note.time > firstRealTime).time;
  await setTime((firstRealTime + secondRealTime) / 2);
  await page.evaluate((pitch) => { window.sendGuitarQaMidi(pitch); window.sendGuitarQaMidi(pitch, 0); }, realChart.notes[0].pitch);
  await page.waitForFunction(() => document.querySelector('.guitar-pitch-feedback')?.dataset.kind === 'between');
  assert.match(await pitchFeedback.innerText(), /Between targets/);
  await reset.click();
  await begin();
  await setTime(exactNote.time);
  await page.waitForTimeout(180);
  const beforeUnrelated = await stats();
  await page.evaluate(() => { window.sendGuitarQaMidi(127); window.sendGuitarQaMidi(127, 0); });
  await page.waitForFunction(() => document.querySelector('.guitar-pitch-feedback')?.dataset.kind === 'different');
  assert.match(await pitchFeedback.innerText(), /Different pitch/);
  assert.equal((await stats()).extra, beforeUnrelated.extra + 1);
  assert.equal((await stats()).score, beforeUnrelated.score);
  assert.equal(await stringGuide.locator('[data-hit="true"]').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.guitarProbe.live.flashes), [], 'An unrelated pitch has no string receptor');
  await page.waitForFunction(() => document.querySelector('.guitar-pitch-feedback')?.dataset.kind === 'listening');

  phase = 'live spatial fingering preview retains a partially played chord';
  console.log(`Guitar check: ${phase}`);
  await reset.click();
  await begin();
  const realChord = await page.evaluate(() => {
    const notes = window.guitarProbe.live.judges.get('guitar').notes;
    const first = notes.find((note) => {
      const group = notes.filter((mate) => mate.time === note.time);
      const next = notes.find((mate) => mate.time > note.time);
      const following = next ? notes.filter((mate) => mate.time === next.time) : [];
      return group.length > 1 && following.length > 0 && JSON.stringify(group.map((mate) => mate.guitarPosition)) !== JSON.stringify(following.map((mate) => mate.guitarPosition));
    });
    if (!first) throw Error('The real guitar fixture needs a chord');
    return { time: first.time, notes: notes.filter((note) => note.time === first.time).map((note) => ({ pitch: note.pitch, position: note.guitarPosition })) };
  });
  await setTime(realChord.time);
  await page.waitForTimeout(150);
  const currentShape = () => stringGuide.locator('.guitar-string-guide-string[data-active="true"]').evaluateAll((items) => items.map((item) => ({
    string: item.dataset.string, fret: item.querySelector('.guitar-string-guide-fret')?.textContent,
  })));
  const beforeShape = await currentShape();
  assert.equal(beforeShape.length, realChord.notes.length);
  await page.evaluate((pitch) => { window.sendGuitarQaMidi(pitch); }, realChord.notes[0].pitch);
  await page.waitForTimeout(150);
  assert.deepEqual(await currentShape(), beforeShape, 'One MIDI chord tone must not remove its fingering from the guide');
  assert.match(await stringGuide.locator('.guitar-pitch-progress').innerText(), new RegExp(`1 / ${realChord.notes.length} pitches matched`));
  const hitPosition = realChord.notes[0].position;
  const hitRow = stringGuide.locator(`.guitar-fretboard-string[data-string="${hitPosition.string}"]`);
  assert.equal(await hitRow.locator('[data-hit="true"]').count(), 1, 'Only the actually judged target gains a matched mark');
  const beforeRepeat = await stats();
  await page.evaluate((pitch) => { window.sendGuitarQaMidi(pitch, 0); window.sendGuitarQaMidi(pitch); }, realChord.notes[0].pitch);
  await page.waitForFunction(() => document.querySelector('.guitar-pitch-feedback')?.dataset.kind === 'repeat');
  assert.match(await pitchFeedback.innerText(), /Already matched/);
  assert.equal((await stats()).extra, beforeRepeat.extra + 1);
  assert.equal((await stats()).score, beforeRepeat.score, 'Repeated chord tones cannot add score');
  await page.setViewportSize({ width: 1280, height: 900 });
  await stringGuide.scrollIntoViewIfNeeded();
  await screenshot('guitar-pitch-chord-desktop');
  if (output) await page.screenshot({ path: `${output}/guitar-pitch-chord-desktop-viewport.png`, fullPage: false });
  for (const target of realChord.notes.slice(1)) await page.evaluate((pitch) => { window.sendGuitarQaMidi(pitch); }, target.pitch);
  await page.waitForTimeout(150);
  assert.notDeepEqual(await currentShape(), beforeShape, 'The next shape appears after the whole chord is played');
  for (const target of realChord.notes) await page.evaluate((pitch) => { window.sendGuitarQaMidi(pitch, 0); }, target.pitch);
  await reset.click();
  assert.equal(await pitchFeedback.count(), 0, 'Reset leaves no scored pitch feedback');
  await page.getByRole('button', { name: 'Soundcheck', exact: true }).click();
  const readyBefore = await stats();
  await page.evaluate(() => { window.sendGuitarQaMidi(40); window.sendGuitarQaMidi(40, 0); });
  await page.waitForFunction(() => document.querySelector('output[aria-label="Soundcheck feedback"]')?.textContent === 'Guitar · E2 · MIDI pitch');
  assert.deepEqual(await stats(), readyBefore, 'Ready Soundcheck notes remain unscored');
  assert.equal(await pitchFeedback.count(), 0);
  await page.getByRole('button', { name: 'Close soundcheck', exact: true }).click();
  await begin(true);
  await setTime(realChord.time);
  assert.equal(await pitchFeedback.count(), 0, 'Play along cannot present human pitch diagnostics');
  assert.equal(await stringGuide.locator('.guitar-pitch-progress').count(), 0);
  assert.equal(await stringGuide.locator('[data-hit="true"]').count(), 0, 'Demo note state is not personal performance feedback');

  phase = 'high frets, open strings and desktop guitar cockpit';
  console.log(`Guitar check: ${phase}`);
  await reset.click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await begin();
  // Rendering fixture through the real React HUD and Canvas2D renderer. These
  // positions are not added to the authored setlist or used as scoring evidence.
  await page.evaluate(() => {
    const judge = window.guitarProbe.live.judges.get('guitar');
    const positions = [{ string: 6, fret: 0 }, { string: 5, fret: 5 }, { string: 4, fret: 9 },
      { string: 3, fret: 13 }, { string: 2, fret: 17 }, { string: 1, fret: 24 }];
    const fixture = (position, id, time) => ({ id, time, duration: 0.5, velocity: 90,
      pitch: [64, 59, 55, 50, 45, 40][position.string - 1] + position.fret,
      lane: 6 - position.string, guitarPosition: position, state: 0, hold: null, name: 'Fretboard fixture' });
    judge.notes = [...positions.map((position, id) => fixture(position, id, 20)), fixture({ string: 1, fret: 20 }, 6, 21)];
    window.guitarProbe.time = 20;
  });
  await page.waitForFunction(() => document.querySelector('.guitar-string-guide-following')?.textContent.includes('High E fret 20'));
  assert.deepEqual(await stringGuide.locator('.guitar-fretboard-string').evaluateAll((rows) => rows.map((row) => row.dataset.string)), ['1', '2', '3', '4', '5', '6']);
  assert.equal(await stringGuide.locator('[data-string="1"] .guitar-fretboard-cell[data-target="true"] b').innerText(), '24');
  assert.equal(await stringGuide.locator('[data-string="6"] .guitar-fretboard-open[data-active="true"] b').innerText(), '0');
  assert.match(await stringGuide.locator('.guitar-string-guide-window').innerText(), /collapsed/);
  assert.equal(await page.locator('.stage-shell').evaluate((shell) => shell.classList.contains('stage-focused')), true,
    'Starting a guitar take must already focus the stage');
  await stringGuide.scrollIntoViewIfNeeded();
  const guideBox = await stringGuide.boundingBox();
  const highwayBox = await canvas.boundingBox();
  assert.ok(guideBox.x >= highwayBox.x + highwayBox.width, 'The desktop guide sits beside the highway during play');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await screenshot('guitar-cockpit-desktop');
  if (output) await page.screenshot({ path: `${output}/guitar-cockpit-desktop-viewport.png`, fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await stringGuide.scrollIntoViewIfNeeded();
  await screenshot('guitar-cockpit-mobile');

  phase = 'other songs retain immediate keyboard play';
  console.log(`Guitar check: ${phase}`);
  await reset.click();
  await command('song:open-stage');
  assert.equal(await down.count(), 0);
  assert.equal(await stringGuide.count(), 0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Show setlist', exact: true }).click();
  const lineup = page.getByRole('complementary', { name: 'Setlist and lineup', exact: true });
  const keysButton = lineup.getByRole('button', { name: /^Keys (ON|OFF)$/ });
  if (await keysButton.getAttribute('aria-pressed') !== 'true') await keysButton.click();
  const guitarButton = lineup.getByRole('button', { name: /^Guitar (ON|OFF)$/ });
  if (await guitarButton.getAttribute('aria-pressed') === 'true') await guitarButton.click();
  await begin();
  const normalNote = await page.evaluate(async () => {
    const { KEYS } = await import('/src/lib/midi-stage/engine.ts');
    const note = window.guitarProbe.live.judges.get('keys').notes[0];
    return { time: note.time, code: KEYS.keys[note.lane] };
  });
  await setTime(normalNote.time);
  await page.keyboard.press(normalNote.code);
  assert.ok(await page.evaluate(() => window.guitarProbe.live.judges.get('keys').stats.score) > 0);
  const normalMidi = await page.evaluate(() => {
    const judge = window.guitarProbe.live.judges.get('keys');
    const note = judge.notes.find((note) => note.state === 0 && note.time > window.guitarProbe.time + 0.3);
    return { id: note.id, time: note.time, pitch: note.pitch };
  });
  await setTime(normalMidi.time);
  await page.evaluate((pitch) => { window.sendGuitarQaMidi(pitch); window.sendGuitarQaMidi(pitch, 0); }, normalMidi.pitch);
  assert.equal(await page.evaluate((id) => window.guitarProbe.live.judges.get('keys').notes.find((note) => note.id === id).state, normalMidi.id), 1);
  assert.deepEqual(errors, []);
  console.log('PASS: explicit MIDI setup and unscored play-along/resume; scored guitar MIDI gate; arcade strums, holds and input cleanup; rehearsal/demo isolation; touch/latching; exact guitar pitches; received pitch/octave/duplicate/between-target feedback without inferred strings; actual partial-chord progress; reset/pause/ready/demo isolation; fret 24/open strings/collapsed gaps; desktop cockpit and narrow layout; existing keyboard/MIDI play');
} catch (error) {
  console.error('Guitar strum regression failed during:', phase, error);
  console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
  if (output) await page.screenshot({ path: `${output}/guitar-strum-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
