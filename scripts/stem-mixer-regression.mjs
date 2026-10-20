import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { drumFixture, drumWav } from './fixtures/drum-draft.mjs';
import { keyboardFixture } from './fixtures/keyboard-draft.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const output = resolve(process.env.SESSION_SCREENSHOT_DIR || '/workspace/screenshots/stem-mixer');
assert.ok(output.startsWith('/workspace/screenshots/'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(90000);
const errors = [], evidence = {};
page.on('pageerror', error => errors.push(error.message));
let phase = 'initial load';
try {
  await page.addInitScript(() => {
    window.mixAudio = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        const capture = { context: this, starts: [], analyser: null };
        window.mixAudio.push(capture);
        const create = this.createBufferSource.bind(this);
        this.createBufferSource = () => {
          const source = create(), start = source.start.bind(source), connect = source.connect.bind(source);
          let gain;
          source.connect = (...values) => {
            if (values[0] instanceof GainNode) {
              gain = values[0]; gain.mixTargets = [];
              const target = gain.gain.setTargetAtTime.bind(gain.gain);
              gain.gain.setTargetAtTime = (...args) => { gain.mixTargets.push(args); return target(...args); };
            }
            return connect(...values);
          };
          source.start = (...values) => {
            // Noise synth buffers are two seconds; only file recordings are captured.
            if (source.buffer?.duration > 3) capture.starts.push({ source, gain, length: source.buffer.duration, at: values[0], offset: values[1], duration: values[2], rate: source.playbackRate.value });
            return start(...values);
          };
          return source;
        };
        const compressor = this.createDynamicsCompressor.bind(this);
        this.createDynamicsCompressor = () => {
          const node = compressor(); capture.analyser = this.createAnalyser(); node.connect(capture.analyser); return node;
        };
      }
    };
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.pad').first().waitFor();
  await page.getByRole('button', { name: 'Import songs', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Your songs', exact: true });
  const form = library.locator('details').filter({ hasText: 'Build a full-band song from stems' });
  await form.locator('summary').click();
  const drums = drumFixture();
  const keys = keyboardFixture(44100, 1, [
    { pitch: 60, time: 0.6, duration: 1 }, { pitch: 64, time: 2, duration: 1 },
    { pitch: 67, time: 5, duration: 1 }, { pitch: 60, time: 8.8, duration: 1 }, { pitch: 67, time: 10.5, duration: 1 },
  ], 12);
  const samples = new Float32Array(44100 * 14);
  for (const track of [drums, keys]) track.getChannelData(0).forEach((value, index) => { samples[index] += value * 0.5; });
  const master = { sampleRate: 44100, getChannelData: () => samples };
  const upload = (name, buffer) => ({ name, mimeType: 'audio/wav', buffer: drumWav(buffer) });
  await form.getByLabel('Full-band original song', { exact: true }).setInputFiles(upload('Stem Practice.wav', master));
  await form.getByLabel('Full-band drums stem', { exact: true }).setInputFiles(upload('drums.wav', drums));
  await form.getByLabel('Full-band keyboard stem', { exact: true }).setInputFiles(upload('piano.wav', keys));
  phase = 'real partial-band import and save';
  await form.getByRole('button', { name: 'Analyze 2 stems as one song', exact: true }).click();
  await library.getByLabel('Drum count-in tempo', { exact: true }).waitFor();
  await library.getByLabel('Drum count-in tempo', { exact: true }).fill('240');
  await library.getByRole('button', { name: 'Apply corrections', exact: true }).click();
  await library.getByRole('button', { name: 'Add to setlist', exact: true }).click();
  await library.waitFor({ state: 'hidden' });
  const mixer = page.getByRole('region', { name: 'BAND MIX', exact: true });
  await mixer.waitFor();
  console.log('Imported and saved the real two-stem fixture.');
  const transport = page.getByRole('group', { name: 'Playback controls', exact: true });
  const start = async () => {
    await transport.getByRole('button', { name: /^(Start set|Start practice|Resume)$/ }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.stage-transport button')].some(button => button.textContent.trim() === 'Pause' && !button.disabled));
  };
  const level = async (name, value) => {
    const slider = mixer.getByLabel(name, { exact: true });
    await slider.evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await page.waitForFunction(({ name, value }) => document.querySelector(`input[aria-label="${name}"]`)?.getAttribute('aria-valuetext') === `${value}%`, { name, value });
  };
  const reset = () => page.getByRole('button', { name: 'Reset set', exact: true }).click();
  const starts = () => page.evaluate(() => window.mixAudio.flatMap(c => c.starts).map(({ length, at, offset, duration, rate, gain }) => ({ length, at, offset, duration, rate, gain: gain.gain.value })));
  assert.equal(await mixer.getByRole('radio', { name: 'Original recording', exact: true }).isChecked(), true);
  phase = 'original and stem modes are exclusive';
  await start();
  let captured = await starts();
  assert.deepEqual(captured.map(track => track.length), [14]);
  await reset();
  await mixer.getByRole('radio', { name: 'Stem mix', exact: true }).check();
  assert.equal(await mixer.getByRole('button', { name: 'Mute Guitar stem', exact: true }).count(), 0);
  await mixer.getByText(/Only these 2 supplied stems play/).waitFor();
  // Exercise native keyboard support while paused, then set the exact level via
  // the range's input event. Keep live interactions in one browser task below:
  // protocol round trips must not outlast this short recording.
  await mixer.getByLabel('Keys stem level', { exact: true }).press('Home');
  await level('Keys stem level', 50);
  await start();
  captured = (await starts()).slice(-2);
  assert.deepEqual(captured.map(track => track.length), [8, 12]);
  assert.equal(captured[0].at, captured[1].at);
  assert.deepEqual(captured.map(track => [track.offset, track.rate]), [[0, 1], [0, 1]]);
  evidence.initialStemSchedule = captured;
  phase = 'live gains do not restart audio or gameplay';
  console.log('Checking live stem gains.');
  evidence.live = await mixer.evaluate(async region => {
    const capture = window.mixAudio.find(c => c.starts.some(s => s.length === 12));
    const count = capture.starts.length;
    const track = length => capture.starts.filter(s => s.length === length).at(-1);
    const check = (test, message) => { if (!test) throw new Error(message); };
    const until = async (test, message) => {
      const deadline = performance.now() + 4000;
      while (!test()) {
        if (performance.now() > deadline) throw new Error(message);
        await new Promise(requestAnimationFrame);
      }
    };
    const click = label => {
      const button = region.querySelector(`button[aria-label="${label}"]`);
      check(button && !button.disabled && button.getClientRects().length, `${label} unavailable`);
      button.click();
    };
    const gain = (length, expected) => until(() => Math.abs(track(length).gain.gain.value - expected) < 0.001, `gain ${length}s should become ${expected}`);
    const wave = () => { const data = new Float32Array(capture.analyser.fftSize); capture.analyser.getFloatTimeDomainData(data); return data; };
    check(region.querySelector('input[value="original"]').matches(':disabled'), 'source changes require pause');
    click('Solo Keys stem'); await gain(8, 0); await gain(12, 0.25);
    click('Solo Drums stem'); await gain(8, 1);
    click('Mute Keys stem'); await gain(12, 0);
    [...region.querySelectorAll('button')].find(button => button.textContent === 'Reset levels').click();
    await gain(8, 1); await gain(12, 1);
    await until(() => wave().some(value => Math.abs(value) > 0.001), 'native stems should be audible');
    click('Mute Keys stem'); await gain(12, 0);
    click('Mute Drums stem'); await gain(8, 0);
    await until(() => wave().every(value => Math.abs(value) < 0.0001), 'muted stems should be silent');
    check(capture.starts.length === count, 'mixing must not restart recordings');
    const pause = [...document.querySelectorAll('.stage-transport button')].find(button => button.textContent.trim() === 'Pause');
    check(pause && !pause.disabled, 'mixing must not reset gameplay');
    pause.click();
    return { sourceCount: count, audibleAndMuted: true, clock: capture.context.currentTime };
  });
  phase = 'pause resume retains source position and levels';
  await mixer.getByRole('button', { name: 'Reset levels', exact: true }).click();
  await mixer.getByRole('button', { name: 'Mute my part', exact: true }).click();
  assert.equal(await mixer.getByRole('button', { name: 'Mute Keys stem', exact: true }).getAttribute('aria-pressed'), 'true');
  await level('Drums stem level', 70);
  const beforeResume = (await starts()).length;
  await start();
  captured = (await starts()).slice(beforeResume);
  assert.ok(captured.length > 0 && captured.every(track => track.offset > 0), 'resume must not restart at sample zero');
  assert.equal(new Set(captured.map(track => track.at)).size, 1);
  assert.equal(new Set(captured.map(track => track.offset)).size, 1);
  for (const track of captured) assert.ok(Math.abs(track.gain - (track.length === 8 ? 0.49 : 0)) < 0.001);
  evidence.resume = captured;
  await reset();
  phase = 'saved bundle and per-song mix survive reload';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await mixer.waitFor();
  assert.equal(await mixer.getByRole('radio', { name: 'Stem mix', exact: true }).isChecked(), true);
  assert.equal(await mixer.getByLabel('Drums stem level', { exact: true }).inputValue(), '70');
  assert.equal(await mixer.getByRole('button', { name: 'Mute Keys stem', exact: true }).getAttribute('aria-pressed'), 'true');
  await mixer.getByRole('button', { name: 'Reset levels', exact: true }).click();
  await page.getByRole('combobox', { name: /TEMPO/ }).selectOption('0.75');
  const section = page.getByRole('combobox', { name: 'Practice section', exact: true });
  const options = await section.locator('option').evaluateAll(items => items.map(item => ({ value: item.value, text: item.textContent })));
  const second = options.filter(option => option.value)[1];
  assert.ok(second, 'fixture should offer a nonzero practice passage');
  const from = Number(second.value.split(':')[1]);
  assert.ok(from > 8 && from < 12);
  await section.selectOption(second.value);
  phase = 'nonzero passage, shorter stem, tempo and repeat synchronization';
  await start();
  await page.waitForFunction(() => window.mixAudio.flatMap(c => c.starts).some(s => s.length === 12));
  captured = await starts();
  assert.ok(captured.length > 0 && captured.every(track => track.length === 12), 'the shorter drum stem has already ended; original mix must stay off');
  assert.equal(captured[0].length, 12);
  assert.ok(Math.abs(captured[0].offset - from) < 0.00001);
  assert.equal(captured[0].rate, 0.75);
  assert.ok(Math.abs(captured[0].duration - (12 - from)) < 0.00001);
  await page.waitForFunction(() => window.mixAudio.flatMap(c => c.starts).filter(s => s.length === 12).length >= 2);
  const repeated = (await starts()).slice(-2);
  assert.equal(repeated[0].offset, repeated[1].offset);
  assert.equal(repeated[0].rate, repeated[1].rate);
  evidence.practice = repeated;
  await transport.getByRole('button', { name: 'Pause', exact: true }).click();
  await mixer.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/stem-mixer-desktop.png` });
  phase = 'local asset deletion removes the complete bundle';
  await reset();
  await page.keyboard.press('Control+k');
  await page.locator('[data-command-id="import"]').click();
  await library.waitFor();
  const savedId = await page.evaluate(() => JSON.parse(localStorage.getItem('midi-stage/song-library')).entries.find(entry => entry.chart.title === 'Stem Practice').id);
  await library.getByRole('button', { name: 'Remove Stem Practice', exact: true }).click();
  await library.getByRole('button', { name: 'Remove song', exact: true }).click();
  await page.waitForFunction(async id => {
    const request = indexedDB.open('midi-stage-audio', 1);
    return new Promise(resolve => {
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('tracks'), read = tx.objectStore('tracks').get(id);
        tx.oncomplete = () => { db.close(); resolve(read.result === undefined); };
      };
    });
  }, savedId);
  assert.equal(await page.evaluate(id => Object.hasOwn(JSON.parse(localStorage.getItem('midi-stage/stem-mixes')).songs, id), savedId), false);
  assert.deepEqual(errors, []);
  evidence.browserErrors = errors;
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log('PASS: native partial stem import, exclusive original/stem sources, live mute/solo/levels, audible output/silence, pause/resume, saved reload, shorter stem, nonzero passage, tempo and repeated takes. Desktop only.');
} catch (error) {
  console.error(`Stem mixer failed during ${phase}:`, error);
  console.error('Audio trace:', JSON.stringify(await page.evaluate(() => window.mixAudio.map(capture => ({ state: capture.context.state, now: capture.context.currentTime,
    starts: capture.starts.map(({ length, gain, at, offset }) => ({ length, at, offset, gain: gain.gain.value, targets: gain.mixTargets })) }))).catch(() => [])));
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
  throw error;
} finally { await browser.close(); }
