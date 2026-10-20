#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { fullBandFixture } from './fixtures/full-band-draft.mjs';
import { drumWav } from './fixtures/drum-draft.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const uiOnly = process.argv.includes('--ui-only');
const output = resolve(process.env.SESSION_SCREENSHOT_DIR || '/workspace/screenshots/full-band-import');
assert.ok(output.startsWith('/workspace/screenshots/'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const instruments = ['drums', 'keys', 'guitar', 'bass'];
const labels = { drums: 'Drums', keys: 'Keys', guitar: 'Guitar', bass: 'Bass' };
let phase = 'loading';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(Number(process.env.FULL_BAND_IMPORT_TIMEOUT_MS || 90000));
  const errors = [], models = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().includes('/models/basic-pitch/')) models.push(request.url()); });
  await page.addInitScript(() => {
    const inputs = ['drums', 'keys', 'guitar', 'bass'].map((kind) => Object.assign(new EventTarget(), {
      id: `full-band-${kind}`, name: `${kind} QA`, manufacturer: 'MIDI Stage QA', state: 'connected',
    }));
    const access = Object.assign(new EventTarget(), { inputs: new Map(inputs.map((input) => [input.id, input])) });
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
    window.bandMidi = (kind, pitch, on = true) => {
      const event = new Event('midimessage');
      Object.defineProperty(event, 'data', { value: new Uint8Array([(on ? 0x90 : 0x80) + (kind === 'drums' ? 9 : 0), pitch, on ? 100 : 0]) });
      inputs.find((input) => input.id === `full-band-${kind}`).dispatchEvent(event);
    };
    window.bandWorkers = [];
    window.bandAudio = [];
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        const capture = { context: this, starts: [], tones: [], analyser: null };
        window.bandAudio.push(capture);
        const bufferSource = this.createBufferSource.bind(this);
        this.createBufferSource = () => {
          const source = bufferSource(), start = source.start.bind(source);
          source.start = (...args) => {
            capture.starts.push({ bufferDuration: source.buffer?.duration, at: args[0], offset: args[1], duration: args[2] });
            return start(...args);
          };
          return source;
        };
        const oscillator = this.createOscillator.bind(this);
        this.createOscillator = () => {
          const source = oscillator(), start = source.start.bind(source);
          source.start = (...args) => { capture.tones.push({ frequency: source.frequency.value, at: args[0] }); return start(...args); };
          return source;
        };
        const compressor = this.createDynamicsCompressor.bind(this);
        this.createDynamicsCompressor = () => {
          const node = compressor(); capture.analyser = this.createAnalyser(); node.connect(capture.analyser); return node;
        };
      }
    };
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args); this.active = true; this.phase = '';
        window.bandWorkers.push(this);
        this.addEventListener('message', ({ data }) => { if (data.type === 'progress') this.phase = data.phase; });
      }
      terminate() { this.active = false; super.terminate(); }
    };
  });
  const probe = () => page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const { StageRenderer } = await import('/src/lib/midi-stage/renderer.ts');
    const data = window.bandProbe = { time: -1, live: null, audio: null };
    const begin = AudioEngine.prototype.begin;
    AudioEngine.prototype.begin = function (options) { data.audio = this; return begin.call(this, options); };
    AudioEngine.prototype.songAt = function () { return data.time; };
    const draw = StageRenderer.prototype.draw;
    StageRenderer.prototype.draw = function (state) { data.live = state; return draw.call(this, state); };
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.pad').first().waitFor();
  if (!uiOnly) await probe();
  assert.equal(models.length, 0);
  const library = page.getByRole('dialog', { name: 'Your songs', exact: true });
  const transport = page.getByRole('group', { name: 'Playback controls', exact: true });
  const open = async () => {
    const button = page.getByRole('button', { name: 'Import songs', exact: true });
    if (await button.isVisible()) await button.click();
    else { await page.keyboard.press('Control+k'); await page.locator('[data-command-id="import"]').click(); }
    await library.waitFor();
  };
  const fixture = fullBandFixture();
  const form = library.locator('details').filter({ hasText: 'Build a full-band song from stems' });
  const files = Object.fromEntries(instruments.map((kind) => [kind, {
    name: kind === 'keys' ? 'piano.wav' : `${kind}.wav`, mimeType: 'audio/wav', buffer: drumWav(fixture[kind]),
  }]));
  const choose = async () => {
    if (!(await form.evaluate((element) => element.open))) await form.locator('summary').click();
    await form.getByLabel('Full-band original song', { exact: true }).setInputFiles({ name: 'Full Band Study.wav', mimeType: 'audio/wav', buffer: drumWav(fixture.backing) });
    for (const kind of instruments) await form.getByLabel(`Full-band ${kind === 'keys' ? 'keyboard' : kind} stem`, { exact: true }).setInputFiles(files[kind]);
    return form.getByRole('button', { name: 'Analyze 4 stems as one song', exact: true });
  };
  const download = async (name) => {
    const pending = page.waitForEvent('download');
    await library.getByRole('button', { name: 'Download chart', exact: true }).click();
    const path = `${output}/${name}.midistage.json`;
    await (await pending).saveAs(path);
    return JSON.parse(await readFile(path, 'utf8'));
  };
  const toggle = (kind) => page.getByRole('button', { name: new RegExp(`^${labels[kind]} (ON|OFF)$`) });
  phase = 'stem assignment validation before model work';
  await open(); let build = await choose();
  await form.getByLabel('Full-band guitar stem', { exact: true }).setInputFiles(files.drums);
  await build.click();
  await library.getByRole('alert').filter({ hasText: /looks like a drums stem/ }).waitFor();
  assert.equal(models.length, 0);
  await form.getByLabel('Full-band guitar stem', { exact: true }).setInputFiles(files.guitar);
  await form.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/full-band-files-desktop.png` });
  phase = 'four real instrument analyses on one recording timeline';
  await build.click();
  await Promise.race([
    library.getByRole('heading', { name: 'Review the guitar draft', exact: true }).waitFor(),
    library.getByRole('alert').waitFor().then(async () => { throw new Error(await library.getByRole('alert').innerText()); }),
  ]);
  assert.equal(await page.evaluate(() => window.bandWorkers.length), 3);
  assert.equal(await page.evaluate(() => window.bandWorkers.every((worker) => !worker.active)), true);
  assert.ok(models.length && models.every((model) => new URL(model).origin === new URL(url).origin));
  await library.getByText('Full-band draft · aligned instrument parts with the original recording', { exact: true }).waitFor();
  const detected = await download('full-band-detected');
  assert.equal(detected.origin, 'audio-full-band-draft'); assert.equal(detected.guitarMode, 'strings');
  assert.equal(detected.duration, 10); assert.equal(detected.audioName, 'Full Band Study.wav');
  for (const kind of instruments) {
    const notes = detected.parts.find((part) => part.type === kind).notes;
    assert.ok(notes.length > 0, `missing ${kind} part`);
    assert.ok(notes.every((note) => note.time + note.duration <= fixture[kind].duration + 1e-6));
    assert.ok(notes.every((note) => note.time >= 0.25 && note.time < 8), 'preserves leading silence and ignores master-only attack');
  }
  assert.equal(detected.firstBeat, Math.min(...detected.parts.flatMap((part) => part.notes.map((note) => note.time))));
  phase = 'count-in correction without moving any instrument';
  await library.getByLabel('Guitar count-in tempo', { exact: true }).fill('90');
  assert.equal(await library.getByRole('button', { name: 'Add to setlist', exact: true }).isDisabled(), true);
  await library.getByRole('button', { name: 'Apply corrections', exact: true }).click();
  let reviewed = await download('full-band-reviewed');
  assert.equal(reviewed.bpm, 90); assert.equal(reviewed.duration, 10);
  assert.deepEqual(reviewed.parts, detected.parts);
  const tabs = library.getByRole('tablist', { name: 'Review instrument', exact: true });
  const tab = (kind) => tabs.getByRole('tab', { name: labels[kind], exact: true });
  const notes = (chart, kind) => chart.parts.find((part) => part.type === kind).notes;
  const apply = () => library.getByRole('button', { name: 'Apply corrections', exact: true }).click();
  const restore = () => library.getByRole('button', { name: 'Restore original', exact: true }).click();
  const unchanged = (next, current, changed) => {
    for (const kind of instruments.filter((kind) => kind !== changed)) assert.deepEqual(notes(next, kind), notes(current, kind), `${changed} changed ${kind}`);
    for (const key of ['duration', 'audioOffset', 'audioName', 'beats', 'sections']) assert.deepEqual(next[key], current[key], key);
    assert.equal(next.bpm, 90);
    assert.equal(next.firstBeat, Math.min(...next.parts.flatMap((part) => part.notes.map((note) => note.time))));
  };
  phase = 'guitar edits stop audition and protect pending changes';
  await library.getByRole('button', { name: 'Play preview', exact: true }).click();
  await page.waitForFunction(() => window.bandAudio.at(-1)?.context.state === 'running');
  const guitarFret = String(notes(detected, 'guitar')[0].guitarPosition.fret === 24 ? 23 : notes(detected, 'guitar')[0].guitarPosition.fret + 1);
  await library.getByLabel('Note 1 fret', { exact: true }).fill(guitarFret);
  await page.waitForFunction(() => window.bandAudio.at(-1)?.context.state === 'closed');
  assert.equal(await tab('keys').isDisabled(), true);
  assert.equal(await library.getByRole('button', { name: 'Download chart', exact: true }).isDisabled(), true);
  assert.equal(await library.getByRole('button', { name: 'Play preview', exact: true }).isDisabled(), true);
  await apply();
  let next = await download('full-band-guitar-edit'); unchanged(next, reviewed, 'guitar'); reviewed = next;
  assert.equal(notes(reviewed, 'guitar')[0].guitarPosition.fret, Number(guitarFret));

  phase = 'drum corrections preserve guitar and the recording';
  await tab('drums').click();
  await library.getByLabel('Hit 1 time', { exact: true }).fill('0.12');
  await library.getByLabel('Hit 1 drum', { exact: true }).selectOption('49');
  await apply();
  next = await download('full-band-drum-edit'); unchanged(next, reviewed, 'drums'); reviewed = next;
  assert.equal(notes(reviewed, 'drums')[0].time, 0.12); assert.equal(notes(reviewed, 'drums')[0].pitch, 49);
  await library.getByRole('heading', { name: 'Review the drum draft', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/full-band-drums-review-desktop.png` });

  phase = 'keyboard pitch, length, timing and added notes';
  await tab('keys').click();
  await library.getByLabel('Note 1 time', { exact: true }).fill('0.18');
  await library.getByLabel('Note 1 length', { exact: true }).fill('0.3');
  await library.getByLabel('Note 1 pitch', { exact: true }).selectOption('61');
  await library.getByRole('button', { name: 'Add note', exact: true }).click();
  const addedNumber = notes(reviewed, 'keys').length + 1;
  await library.getByLabel(`Note ${addedNumber} time`, { exact: true }).fill('8.8');
  await library.getByLabel(`Note ${addedNumber} length`, { exact: true }).fill('0.2');
  await library.getByLabel(`Note ${addedNumber} pitch`, { exact: true }).selectOption('72');
  await apply();
  next = await download('full-band-keys-edit'); unchanged(next, reviewed, 'keys'); reviewed = next;
  assert.ok(notes(reviewed, 'keys').some((note) => note.pitch === 61 && note.time === 0.18 && note.duration === 0.3));
  assert.ok(notes(reviewed, 'keys').some((note) => note.pitch === 72 && note.time === 8.8 && note.duration === 0.2));
  assert.equal(await library.getByLabel('Preview start time', { exact: true }).inputValue(), '0', 'default audition follows an earlier corrected note');

  phase = 'real corrected-pitch audition with synchronized backing, stop and restart';
  await library.getByLabel('Preview start time', { exact: true }).fill('0.17');
  await library.getByRole('button', { name: 'Play preview', exact: true }).click();
  await page.waitForFunction(() => window.bandAudio.at(-1)?.tones.length > 0);
  let preview = await page.evaluate(() => ({ starts: window.bandAudio.at(-1).starts, tones: window.bandAudio.at(-1).tones }));
  const backing = preview.starts.find((source) => source.bufferDuration === 10);
  assert.ok(backing); assert.equal(backing.offset, 0.17); assert.equal(backing.duration, 8);
  assert.ok(preview.tones.some((tone) => Math.abs(tone.frequency - 440 * 2 ** ((61 - 69) / 12)) < 0.001 && Math.abs(tone.at - backing.at - 0.01) < 1e-6));
  await page.waitForFunction(() => {
    const analyser = window.bandAudio.at(-1)?.analyser; if (!analyser) return false;
    const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data);
    return data.some((sample) => Math.abs(sample) > 0.001);
  });
  await page.screenshot({ path: `${output}/full-band-audition-desktop.png` });
  await library.getByRole('button', { name: 'Stop preview', exact: true }).click();
  await page.waitForFunction(() => window.bandAudio.at(-1)?.context.state === 'closed');
  await library.getByRole('radio', { name: 'Corrected only', exact: true }).check();
  await library.getByRole('button', { name: 'Play preview', exact: true }).click();
  await page.waitForFunction(() => window.bandAudio.at(-1)?.tones.length > 0);
  preview = await page.evaluate(() => ({ starts: window.bandAudio.at(-1).starts, tones: window.bandAudio.at(-1).tones }));
  assert.ok(preview.tones.length); assert.equal(preview.starts.some((source) => source.bufferDuration === 10), false);
  await tab('bass').click();
  await page.waitForFunction(() => window.bandAudio.at(-1)?.context.state === 'closed');

  phase = 'bass validation and corrections';
  await library.getByLabel('Note 1 time', { exact: true }).fill('9.9');
  await library.getByLabel('Note 1 length', { exact: true }).fill('0.35');
  await library.getByLabel('Note 1 pitch', { exact: true }).selectOption('43');
  await apply(); await library.getByRole('alert').filter({ hasText: /fit inside the recording/ }).waitFor();
  assert.equal(await tab('keys').isDisabled(), true);
  await library.getByLabel('Note 1 time', { exact: true }).fill('0.22');
  await apply();
  next = await download('full-band-bass-edit'); unchanged(next, reviewed, 'bass'); reviewed = next;
  assert.ok(notes(reviewed, 'bass').some((note) => note.pitch === 43 && note.time === 0.22 && note.duration === 0.35));
  await library.getByRole('heading', { name: 'Review the bass draft', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/full-band-bass-review-desktop.png` });

  phase = 'audition completion and original-player ownership';
  await library.getByLabel('Preview start time', { exact: true }).fill('9.8');
  await library.getByRole('button', { name: 'Play preview', exact: true }).click();
  await page.waitForFunction(() => window.bandAudio.at(-1)?.context.state === 'closed');
  await library.getByRole('button', { name: 'Play preview', exact: true }).waitFor();
  await library.getByLabel('Preview start time', { exact: true }).fill('0');
  await library.getByRole('button', { name: 'Play preview', exact: true }).click();
  await page.waitForFunction(() => window.bandAudio.at(-1)?.tones.length > 0);
  await library.locator('audio').evaluate((audio) => audio.play());
  await page.waitForFunction(() => window.bandAudio.at(-1)?.context.state === 'closed');
  assert.equal(await library.locator('audio').evaluate((audio) => audio.paused), false);
  await library.locator('audio').evaluate((audio) => audio.pause());

  phase = 'restore one part after editing the other three';
  await tab('guitar').click(); await restore();
  next = await download('full-band-guitar-restored'); unchanged(next, reviewed, 'guitar');
  assert.deepEqual(notes(next, 'guitar'), notes(detected, 'guitar')); reviewed = next;
  await library.getByLabel('Note 1 fret', { exact: true }).fill(guitarFret); await apply();
  next = await download('full-band-reviewed'); unchanged(next, reviewed, 'guitar'); reviewed = next;
  assert.equal(await page.evaluate(() => window.bandWorkers.length), 3, 'edits and tabs must never rerun transcription');
  await library.getByRole('heading', { name: 'Review the guitar draft', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/full-band-review-desktop.png` });
  await library.getByRole('button', { name: 'Add to setlist', exact: true }).click();
  await library.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Full Band Study', level: 2, exact: true }).waitFor();
  assert.equal(await toggle('keys').getAttribute('aria-pressed'), 'true');
  assert.equal(await toggle('guitar').getAttribute('aria-pressed'), 'false');
  for (const kind of ['drums', 'guitar', 'bass']) { assert.equal(await toggle(kind).isEnabled(), true); await toggle(kind).click(); }
  phase = 'per-instrument MIDI ownership and mixed highway';
  await transport.getByRole('button', { name: 'Connect guitar MIDI', exact: true }).click();
  await page.getByLabel('Guitar MIDI input', { exact: true }).waitFor();
  // A connected keyboard must not falsely mark an unreachable automatic guitar route as ready.
  await transport.getByRole('button', { name: 'Connect guitar MIDI', exact: true }).waitFor();
  for (const kind of instruments) await page.getByLabel(`${labels[kind]} MIDI input`, { exact: true }).selectOption(`device:full-band-${kind}`);
  await page.getByRole('button', { name: 'Close soundcheck', exact: true }).click();
  await transport.getByRole('button', { name: 'Start set', exact: true }).click();
  await transport.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  if (!uiOnly) {
    await page.waitForFunction(() => window.bandProbe.audio?.backingSource);
    assert.equal(await page.evaluate(() => window.bandProbe.audio.backingSource.buffer.duration), 10);
    assert.deepEqual(await page.evaluate(() => [...window.bandProbe.live.judges.keys()].sort()), [...instruments].sort());
    const attacks = instruments.map((kind) => ({ kind, ...reviewed.parts.find((part) => part.type === kind).notes[0] })).sort((a, b) => a.time - b.time);
    for (const attack of attacks) {
      await page.evaluate(({ kind, pitch, time }) => { window.bandProbe.time = time; window.bandMidi(kind, pitch); }, attack);
      await page.waitForFunction((kind) => window.bandProbe.live.judges.get(kind).stats.perfect === 1, attack.kind);
    }
    assert.deepEqual(await page.evaluate(() => Object.fromEntries([...window.bandProbe.live.judges].map(([kind, judge]) => [kind, judge.stats.perfect]))), { drums: 1, keys: 1, guitar: 1, bass: 1 });
  }
  await page.locator('.stage-viewport').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${output}/full-band-highways-desktop.png` });
  await transport.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Reset set', exact: true }).click();
  phase = 'solo keys from a guitar-containing chart without guitar MIDI';
  // Turn guitar MIDI off while it is still in the lineup, then remove that part.
  await page.getByRole('button', { name: 'Soundcheck', exact: true }).click();
  await page.getByLabel('Guitar MIDI input', { exact: true }).selectOption('off');
  await page.getByRole('button', { name: 'Close soundcheck', exact: true }).click();
  for (const kind of ['drums', 'guitar', 'bass']) await toggle(kind).click();
  await transport.getByRole('button', { name: 'Start set', exact: true }).click();
  await transport.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reset set', exact: true }).click();
  phase = 'saved full-band reload and original backing';
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.pad').first().waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('midi-stage/song-library')));
  assert.deepEqual(stored.entries.find((entry) => entry.chart.title === 'Full Band Study').chart.parts, reviewed.parts);
  if (!uiOnly) await probe();
  await page.getByRole('heading', { name: 'Full Band Study', level: 2, exact: true }).waitFor();
  assert.equal(await toggle('keys').getAttribute('aria-pressed'), 'true');
  assert.equal(await toggle('guitar').getAttribute('aria-pressed'), 'false');
  await transport.getByRole('button', { name: 'Start set', exact: true }).click();
  await transport.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  if (!uiOnly) {
    await page.waitForFunction(() => window.bandProbe.audio?.backingSource);
    assert.equal(await page.evaluate(() => window.bandProbe.audio.backingSource.buffer.duration), 10);
    assert.deepEqual(await page.evaluate(() => [...window.bandProbe.live.judges.keys()]), ['keys']);
  }
  await page.getByRole('button', { name: 'Reset set', exact: true }).click();
  phase = 'cancel a partially analyzed set without publishing a partial band';
  const mixer = page.getByRole('region', { name: 'BAND MIX', exact: true });
  await mixer.getByRole('radio', { name: 'Stem mix', exact: true }).check();
  const recordedStarts = () => page.evaluate(() => window.bandAudio.flatMap(capture => capture.starts).filter(source => source.bufferDuration > 3));
  const beforeStems = (await recordedStarts()).length;
  await transport.getByRole('button', { name: 'Start set', exact: true }).click();
  await page.waitForFunction(count => window.bandAudio.flatMap(capture => capture.starts).filter(source => source.bufferDuration > 3).length >= count + 4, beforeStems);
  const fourStems = (await recordedStarts()).slice(beforeStems);
  assert.deepEqual(fourStems.map(source => source.bufferDuration), [8, 4, 4, 4]);
  assert.equal(new Set(fourStems.map(source => source.at)).size, 1, 'all four stems share one audio start');
  assert.ok(fourStems.every(source => source.offset === 0));
  await page.getByRole('button', { name: 'Reset set', exact: true }).click();
  await mixer.getByRole('radio', { name: 'Original recording', exact: true }).check();
  await open(); build = await choose(); await build.click();
  await page.waitForFunction(() => window.bandWorkers.some((worker) => worker.active && worker.phase === 'analyzing'));
  await library.getByRole('button', { name: 'Cancel import', exact: true }).click();
  assert.equal(await page.evaluate(() => window.bandWorkers.every((worker) => !worker.active)), true);
  assert.equal(await library.getByRole('button', { name: 'Add to setlist', exact: true }).count(), 0);
  await page.waitForTimeout(200);
  assert.equal(await library.getByRole('heading', { name: 'Review the guitar draft', exact: true }).count(), 0);
  phase = 'partial full-band JSON review without guitar or attached audio';
  const partial = { ...reviewed, version: 1, guitarMode: undefined, guitarTuning: undefined,
    parts: reviewed.parts.map((part) => ['drums', 'keys'].includes(part.type) ? part : { ...part, notes: [] }),
    chordHighways: { keys: [], guitar: [] } };
  await library.getByLabel('Choose song file', { exact: true }).setInputFiles({ name: 'Partial Band.midistage.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(partial)) });
  await library.getByRole('heading', { name: 'Review the drum draft', exact: true }).waitFor();
  assert.equal(await tab('drums').getAttribute('aria-selected'), 'true');
  assert.equal(await tab('guitar').isDisabled(), true); assert.equal(await tab('bass').isDisabled(), true);
  await tab('keys').click();
  assert.equal(await library.locator('audio').count(), 0);
  assert.equal(await library.getByRole('radio', { name: 'Corrected + recording', exact: true }).isDisabled(), true);
  await library.getByLabel('Note 1 pitch', { exact: true }).selectOption('62'); await apply();
  const partialExport = await download('partial-band-reviewed');
  assert.deepEqual(notes(partialExport, 'drums'), notes(partial, 'drums'));
  assert.equal(notes(partialExport, 'keys')[0].pitch, 62);
  await library.getByRole('button', { name: 'Play preview', exact: true }).click();
  await page.waitForFunction(() => window.bandAudio.at(-1)?.tones.length > 0);
  assert.equal(await page.evaluate(() => window.bandAudio.at(-1).starts.some((source) => source.bufferDuration === 10)), false);
  await page.screenshot({ path: `${output}/partial-band-review-desktop.png` });
  phase = 'preserve the built-in solo guitar setup';
  await library.getByRole('button', { name: 'Close song library', exact: true }).click();
  await page.waitForFunction(() => window.bandAudio.at(-1)?.context.state === 'closed');
  await page.keyboard.press('Control+k');
  await page.locator('[data-command-id="song:backline-drive"]').click();
  await page.locator('.stage-real-guitar').waitFor();
  assert.equal(await toggle('guitar').getAttribute('aria-pressed'), 'true');
  assert.equal(await toggle('keys').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(errors, []);
  console.log(`PASS: real four-stem transcription; independent drum/keys/guitar/bass edits and restore; pending-edit protection; native corrected-pitch/backing audition, stop/restart/completion and player ownership; canonical export and saved reload${uiOnly ? '' : '; mixed MIDI scoring'}; cancellation. Desktop only.`);
} catch (error) {
  console.error(`Full-band import phase: ${phase}`);
  const page = browser.contexts()[0]?.pages()[0];
  if (page) { await page.screenshot({ path: `${output}/full-band-failure.png` }).catch(() => {}); console.error(await page.locator('body').innerText().catch(() => 'Page unavailable')); }
  throw error;
} finally { await browser.close(); }
