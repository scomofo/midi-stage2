#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { transcriptionAudioCases } from './fixtures/transcription-audio.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const output = resolve(process.env.SESSION_SCREENSHOT_DIR || '/workspace/screenshots/import-studio');
assert.ok(output.startsWith('/workspace/screenshots/')); await mkdir(output, { recursive: true });
const { cases } = await transcriptionAudioCases();
const fixture = cases.find((entry) => entry.id === 'guitar-short-attacks');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const fallbackOnly = process.argv.includes('--fallback-only');
const skipFallback = process.argv.includes('--skip-fallback');
const captureOnly = process.argv.includes('--capture-only');
const evidence = { browser: browser.version(), runs: [] };
let phase = 'loading';
try {
  for (const fallback of (fallbackOnly ? ["blocked", "invalid"] : (skipFallback || captureOnly) ? [false] : [false, "blocked", "invalid"])) {
    phase = fallback ? 'CPU fallback after blocked WASM' : 'real guitar import';
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const blocked = [];
    if (fallback) await context.route(/\.wasm(?:\?|$)/, (route) => { if (route.request().resourceType() !== 'fetch') return route.continue(); blocked.push(route.request().url()); return fallback === 'invalid' ? route.fulfill({ status: 200, contentType: 'application/wasm', body: 'invalid runtime' }) : route.abort(); });
    await context.addInitScript(() => {
      window.studioWorkers = []; window.studioAudio = [];
      const NativeWorker = Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); this.active = true; window.studioWorkers.push(this);
          this.addEventListener('message', ({ data }) => { if (data.type === 'complete') this.backend = data.backend; }); }
        terminate() { this.active = false; super.terminate(); }
      };
      const NativeContext = AudioContext;
      window.AudioContext = class extends NativeContext {
        constructor(...args) { super(...args); const capture = { context: this, starts: [], tones: [] }; window.studioAudio.push(capture);
          const bufferSource = this.createBufferSource.bind(this);
          this.createBufferSource = () => { const source = bufferSource(), start = source.start.bind(source);
            source.start = (...args) => { capture.starts.push({ bufferDuration: source.buffer?.duration, at: args[0], offset: args[1], duration: args[2] }); return start(...args); }; return source; };
          const oscillator = this.createOscillator.bind(this);
          this.createOscillator = () => { const source = oscillator(), start = source.start.bind(source);
            source.start = (...args) => { capture.tones.push({ frequency: source.frequency.value, at: args[0] }); return start(...args); }; return source; };
        }
      };
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(90000); page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.locator('.pad').first().waitFor();
    await page.getByRole('button', { name: 'Import songs', exact: true }).click();
    const library = page.getByRole('dialog', { name: 'Your songs', exact: true });
    const previewStart = library.getByLabel('Preview start time', { exact: true });
    const seekChecks = [];
    const expectPreviewStart = async (expected, message, tolerance = 0) => {
      // A seek request crosses a parent render and the audition's effect. The
      // input already exists, so inputValue() alone can read the previous note.
      await page.waitForFunction(({ input, expected, tolerance }) => input.isConnected && input.value.trim() !== ''
        && Math.abs(Number(input.value) - expected) <= tolerance + 1e-9,
      { input: await previewStart.elementHandle(), expected, tolerance }, { timeout: 5000 });
      assert.ok(Math.abs(Number(await previewStart.inputValue()) - expected) <= tolerance + 1e-9, message);
    };
    const keyboardSeek = async (key, expected) => {
      const waveform = library.getByRole('button', { name: 'Seek preview on recording waveform', exact: true });
      await waveform.evaluate(() => {
        window.studioLastSeek = null;
        document.addEventListener('click', (event) => {
          window.studioLastSeek = { detail: event.detail, valueAtActivation: document.querySelector('input[aria-label="Preview start time"]')?.value };
        }, { once: true });
      });
      await waveform.focus(); await page.keyboard.press(key);
      const immediate = await previewStart.inputValue();
      await expectPreviewStart(expected, `${key} seeking starts at the visible recording window`);
      const activation = await page.evaluate(() => window.studioLastSeek);
      assert.equal(activation?.detail, 0, `${key} activates the waveform using a keyboard click`);
      seekChecks.push({ key, expected, immediate, settled: await previewStart.inputValue(), ...activation });
    };
    await library.getByRole('button', { name: 'Guitar (draft)', exact: true }).click();
    await library.getByLabel('Choose song file', { exact: true }).setInputFiles({ name: fixture.fileName, mimeType: fixture.mime, buffer: fixture.audio });
    await Promise.race([
      library.getByRole('heading', { name: 'Review the guitar draft', exact: true }).waitFor(),
      library.getByRole('alert').waitFor().then(async () => { throw Error(await library.getByRole('alert').innerText()); }),
    ]);
    const workers = await page.evaluate(() => window.studioWorkers.map((worker) => ({ active: worker.active, backend: worker.backend })));
    assert.deepEqual(workers, [{ active: false, backend: fallback ? 'cpu' : 'wasm' }]);
    const download = async (suffix) => {
      const pending = page.waitForEvent('download'); await library.getByRole('button', { name: 'Download chart', exact: true }).click();
      const path = `${output}/${fallback ? 'cpu-' + fallback : 'wasm'}-${suffix}.midistage.json`; await (await pending).saveAs(path);
      return JSON.parse(await readFile(path, 'utf8'));
    };
    const captureStudio = async () => {
      await library.getByRole('heading', { name: 'Review the guitar draft', exact: true }).evaluate((element) => {
        let scroller = element.parentElement;
        while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
        if (scroller) scroller.scrollTop += element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12;
      });
      const close = await library.getByRole('button', { name: 'Close song library', exact: true }).boundingBox();
      assert.ok(close && close.y >= 0 && close.y + close.height <= 1000, 'framing must retain the library header and close control');
      await page.screenshot({ path: `${output}/studio-desktop.png` });
    };
    const chart = await download('detected'), notes = chart.parts.find((part) => part.type === 'guitar').notes;
    assert.equal(notes.length, 6); assert.deepEqual(notes.map((note) => note.pitch), [40, 40, 43, 43, 45, 45]);
    assert.ok(notes.every((note) => note.confidence === 0.5 && note.duration >= 0.035 && note.duration < 0.1));
    assert.equal(await library.locator('.studio-queue > button').count(), 6);
    assert.equal(await library.getByRole('button', { name: 'Apply corrections', exact: true }).isDisabled(), true);
    const bounds = await library.boundingBox(); assert.ok(bounds.width > 1300 && bounds.x > 0 && bounds.y >= 0);
    if (!fallback) {
      phase = 'waveform, selection, keyboard and history';
      await library.getByRole('heading', { name: 'Review the guitar draft', exact: true }).scrollIntoViewIfNeeded();
      await page.waitForFunction(() => { const canvas = document.querySelector('.studio-waveform canvas'); return canvas && !document.querySelector('.studio-waveform span') && canvas.width > 0; });
      if (captureOnly) {
        await captureStudio(); assert.deepEqual(errors, []);
        evidence.runs.push({ backend: workers[0].backend, detectedNotes: notes.length, captureOnly: true, browserErrors: errors });
        await context.close(); continue;
      }
      await library.getByRole('button', { name: 'Edit note 3', exact: true }).click();
      assert.equal(await library.getByLabel('Note 3 fret', { exact: true }).inputValue(), String(notes[2].guitarPosition.fret));
      assert.equal(await library.getByRole('button', { name: 'Apply corrections', exact: true }).isDisabled(), true, 'selection is not an edit');
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      for (const key of ['Enter', 'Space']) {
        await library.getByRole('button', { name: 'Edit note 3', exact: true }).click();
        await expectPreviewStart(0.835, 'note selection seeks to its own preview time');
        await keyboardSeek(key, 0);
      }
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await library.getByRole('group', { name: /Note timeline/ }).focus(); await page.keyboard.press('ArrowRight');
      await library.getByLabel('Note 4 fret', { exact: true }).waitFor();
      await library.getByRole('button', { name: 'Show needs review', exact: true }).click();
      assert.equal(await library.locator('.studio-queue > button').count(), 6);
      await library.getByRole('button', { name: 'Next needs review', exact: true }).click();
      await library.getByLabel('Note 5 fret', { exact: true }).fill('1');
      assert.equal(await library.getByRole('button', { name: 'Add to setlist', exact: true }).isDisabled(), true);
      await library.getByRole('button', { name: 'Undo note edit', exact: true }).click();
      assert.equal(await library.getByLabel('Note 5 fret', { exact: true }).inputValue(), String(notes[4].guitarPosition.fret));
      assert.equal(await library.getByRole('button', { name: 'Add to setlist', exact: true }).isEnabled(), true);
      await library.getByRole('button', { name: 'Redo note edit', exact: true }).click();
      await library.getByRole('button', { name: 'Remove note 5', exact: true }).click();
      assert.equal(await library.locator('.studio-queue > button').count(), 5);
      await library.getByRole('button', { name: 'Undo note edit', exact: true }).click();
      await library.getByLabel('Note 5 fret', { exact: true }).waitFor();
      assert.equal(await library.getByLabel('Note 5 fret', { exact: true }).inputValue(), '1');
      await library.getByRole('button', { name: 'Apply corrections', exact: true }).click();
      const edited = await download('edited'); assert.equal(edited.parts.find((part) => part.type === 'guitar').notes[4].pitch, chart.guitarTuning[6 - notes[4].guitarPosition.string] + 1);
      phase = 'selection-aware zoom and audio-clock comparisons';
      for (let i = 0; i < 3; i++) await library.getByRole('button', { name: 'Zoom in timeline', exact: true }).click();
      const focused = await library.locator('.studio-gem[aria-pressed="true"]').boundingBox(), timeline = await library.locator('.studio-gems').boundingBox();
      assert.ok(focused && timeline && focused.x >= timeline.x && focused.x + focused.width <= timeline.x + timeline.width + 1, 'zoom keeps the selected note visible');
      const pan = library.getByLabel('Timeline position', { exact: true });
      await pan.focus(); await page.keyboard.press('End');
      await page.waitForFunction(() => document.querySelector('.studio-time-ruler > span')?.textContent === '3.00s');
      for (const key of ['Enter', 'Space']) {
        await previewStart.fill('0.835');
        await keyboardSeek(key, 3);
      }
      const waveform = library.getByRole('button', { name: 'Seek preview on recording waveform', exact: true });
      const waveformBounds = await waveform.boundingBox();
      await waveform.click({ position: { x: waveformBounds.width / 2, y: waveformBounds.height / 2 } });
      await expectPreviewStart(3.5, 'pointer seeking uses the clicked position inside the visible window', 0.002);
      for (let i = 0; i < 3; i++) await library.getByRole('button', { name: 'Zoom out timeline', exact: true }).click();
      await library.getByLabel('Preview start time', { exact: true }).fill('0.55');
      await library.getByLabel('Preview length', { exact: true }).fill('0.7');
      await library.getByRole('checkbox', { name: 'Loop preview', exact: true }).check();
      await library.getByRole('button', { name: 'Play preview', exact: true }).click();
      await page.waitForFunction(() => window.studioAudio.at(-1)?.starts.filter((source) => source.bufferDuration === 4).length >= 4);
      const capture = await page.evaluate(() => ({ starts: window.studioAudio.at(-1).starts, tones: window.studioAudio.at(-1).tones }));
      const clips = capture.starts.filter((source) => source.bufferDuration === 4);
      for (let i = 1; i < clips.length; i++) assert.ok(Math.abs(clips[i].at - clips[i - 1].at - 0.7) < 1e-6, 'loop clips share exact audio boundaries');
      assert.ok(capture.tones.length); assert.ok(clips.every((clip) => clip.offset === 0.55 && Math.abs(clip.duration - 0.7) < 1e-6));
      await captureStudio();
      await library.getByRole('button', { name: 'Stop preview', exact: true }).click();
      await page.waitForFunction(() => window.studioAudio.at(-1).context.state === 'closed');
      await library.getByRole('checkbox', { name: 'Loop preview', exact: true }).uncheck();
      await library.getByRole('radio', { name: 'Recording only', exact: true }).check();
      await library.getByRole('button', { name: 'Play preview', exact: true }).click();
      await page.waitForFunction(() => window.studioAudio.at(-1)?.starts.some((source) => source.bufferDuration === 4));
      assert.equal(await page.evaluate(() => window.studioAudio.at(-1).tones.length), 0);
      await page.waitForFunction(() => window.studioAudio.at(-1)?.context.state === 'closed');
      await library.getByLabel('Preview start time', { exact: true }).fill('3.999999');
      const contextsBeforeInvalid = await page.evaluate(() => window.studioAudio.length);
      await library.getByRole('checkbox', { name: 'Loop preview', exact: true }).check();
      await library.getByRole('button', { name: 'Play preview', exact: true }).click();
      await library.getByRole('alert').filter({ hasText: /0.02 seconds before/ }).waitFor();
      assert.equal(await page.evaluate(() => window.studioAudio.length), contextsBeforeInvalid, 'an effectively empty loop never creates an audio context');
      await library.getByRole('checkbox', { name: 'Loop preview', exact: true }).uncheck();
      await library.getByRole('radio', { name: 'Corrected only', exact: true }).check();
      await library.getByRole('button', { name: 'Hear selected note', exact: true }).click();
      await page.waitForFunction(() => window.studioAudio.at(-1)?.tones.length > 0);
      assert.equal(await page.evaluate(() => window.studioAudio.at(-1).starts.some((source) => source.bufferDuration === 4)), false);
      const soloTones = await page.evaluate(() => window.studioAudio.at(-1).tones);
      const selectedPitch = edited.parts.find((part) => part.type === 'guitar').notes[4].pitch;
      assert.equal(soloTones.length, 1, 'selected-note audition omits nearby guide notes');
      assert.ok(Math.abs(soloTones[0].frequency - 440 * 2 ** ((selectedPitch - 69) / 12)) < 0.001);
      await library.getByRole('button', { name: 'Close song library', exact: true }).click();
      await page.waitForFunction(() => window.studioAudio.every((capture) => capture.context.state === 'closed'));
    }
    assert.deepEqual(errors, []); if (fallback) assert.ok(blocked.length);
    evidence.runs.push({ backend: workers[0].backend, fallback, detectedNotes: notes.length, seekChecks, blockedWasmRequests: blocked.length, browserErrors: errors });
    await context.close();
  }
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(captureOnly ? 'PASS: native WASM import and desktop studio framing, with visible header and close control.' : skipFallback ? 'PASS: real WASM studio import, waveform/keyboard seeking, selection-aware zoom, edit history, isolated selected-note audition, bounded loops and native audio cleanup. Desktop only.' : fallbackOnly ? 'PASS: native six-note CPU imports after blocked and invalid WASM binary fetches, with worker cleanup and no browser errors.' : 'PASS: native six-note recovery, waveform, selection, keyboard navigation, undo/redo, deletion, export, audio-clock looping, recording/corrected mixes, selected-note audition, cleanup and CPU fallback. Desktop only.');
} catch (error) { console.error(`FAIL during ${phase}:`, error); const page = browser.contexts().at(-1)?.pages()[0]; if (page) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); throw error; }
finally { await browser.close(); }
