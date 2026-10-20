#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { transcriptionAudioCases } from './fixtures/transcription-audio.mjs';
import { keyboardFixture } from './fixtures/keyboard-draft.mjs';
import { drumWav } from './fixtures/drum-draft.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const output = resolve(process.env.SESSION_SCREENSHOT_DIR || '/workspace/screenshots/chord-review');
assert.ok(output.startsWith('/workspace/screenshots/')); await mkdir(output, { recursive: true });
const { cases } = await transcriptionAudioCases();
const fixture = cases.find((entry) => entry.id === 'guitar-short-chords');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const evidence = { browser: browser.version(), runs: [] };
let phase = 'loading';
try {
  for (const fullBand of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(() => {
      window.chordAudio = []; window.chordWorkers = [];
      const NativeContext = AudioContext;
      window.AudioContext = class extends NativeContext {
        constructor(...args) {
          super(...args); const capture = { context: this, starts: [], tones: [] }; window.chordAudio.push(capture);
          const bufferSource = this.createBufferSource.bind(this);
          this.createBufferSource = () => { const source = bufferSource(), start = source.start.bind(source);
            source.start = (...args) => { capture.starts.push({ bufferDuration: source.buffer?.duration, at: args[0], offset: args[1], duration: args[2] }); return start(...args); }; return source; };
          const oscillator = this.createOscillator.bind(this);
          this.createOscillator = () => { const source = oscillator(), start = source.start.bind(source);
            source.start = (...args) => { capture.tones.push({ frequency: source.frequency.value, at: args[0] }); return start(...args); }; return source; };
        }
      };
      const NativeWorker = Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); this.active = true; window.chordWorkers.push(this); }
        terminate() { this.active = false; super.terminate(); }
      };
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(120000); page.on('pageerror', (error) => errors.push(error.message));
    phase = fullBand ? 'native full-band stem import' : 'native short-chord import';
    await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.locator('.pad').first().waitFor();
    await page.getByRole('button', { name: 'Import songs', exact: true }).click();
    const library = page.getByRole('dialog', { name: 'Your songs', exact: true });
    const file = { name: fixture.fileName, mimeType: fixture.mime, buffer: fixture.audio };
    if (fullBand) {
      const form = library.locator('details').filter({ hasText: 'Build a full-band song from stems' });
      await form.locator('summary').click();
      await form.getByLabel('Full-band original song', { exact: true }).setInputFiles(file);
      await form.getByLabel('Full-band guitar stem', { exact: true }).setInputFiles({ ...file, name: 'guitar.wav' });
      await form.getByLabel('Full-band keyboard stem', { exact: true }).setInputFiles({ name: 'piano.wav', mimeType: 'audio/wav', buffer: drumWav(keyboardFixture()) });
      await form.getByRole('button', { name: 'Analyze 2 stems as one song', exact: true }).click();
    } else {
      await library.getByRole('button', { name: 'Guitar (draft)', exact: true }).click();
      await library.getByLabel('Choose song file', { exact: true }).setInputFiles(file);
    }
    await Promise.race([
      library.getByRole('heading', { name: 'Review the guitar draft', exact: true }).waitFor(),
      library.getByRole('alert').waitFor().then(async () => { throw Error(await library.getByRole('alert').innerText()); }),
    ]);
    const suggestions = library.getByRole('region', { name: 'Chord suggestions', exact: true });
    await suggestions.waitFor();
    const captureStudio = async (suffix) => {
      await library.getByRole('heading', { name: 'Review the guitar draft', exact: true }).evaluate((element) => {
        let scroller = element.parentElement;
        while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
        if (scroller) scroller.scrollTop += element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12;
      });
      const close = await library.getByRole('button', { name: 'Close song library', exact: true }).boundingBox();
      assert.ok(close && close.y >= 0 && close.y + close.height <= 1000);
      await page.screenshot({ path: `${output}/${fullBand ? 'band' : 'single'}-${suffix}.png` });
    };
    const apply = library.getByRole('button', { name: 'Apply corrections', exact: true });
    const download = async (suffix) => {
      const pending = page.waitForEvent('download'); await library.getByRole('button', { name: 'Download chart', exact: true }).click();
      const path = `${output}/${fullBand ? 'band' : 'single'}-${suffix}.midistage.json`;
      await (await pending).saveAs(path); return JSON.parse(await readFile(path, 'utf8'));
    };
    const guitarNotes = (chart) => chart.parts.find((part) => part.type === 'guitar').notes;
    const baseline = await download('original');
    assert.equal(guitarNotes(baseline).length, 3, 'analysis never auto-inserts the suggestions');
    assert.equal(await suggestions.locator('.studio-suggestion-queue > button').count(), 2);
    assert.equal(await apply.isDisabled(), true);
    await suggestions.getByRole('button', { name: 'Review suggestion E3 at 0.639 seconds', exact: true }).click();
    assert.equal(await library.locator('.studio-suggestion-gem').count(), 1);
    await captureStudio('suggestion');
    const listening = library.getByRole('group', { name: 'Suggestion listening controls', exact: true });
    phase = 'native suggestion and source phrase audition';
    if (!fullBand) {
      for (const [name, recording, tones] of [['Recording phrase', true, false], ['Suggestion only', false, true], ['Suggestion + recording', true, true]]) {
        const before = await page.evaluate(() => window.chordAudio.length);
        await listening.getByRole('button', { name, exact: true }).click();
        await page.waitForFunction((before) => window.chordAudio.length > before && window.chordAudio.at(-1).starts.length > 0, before);
        const capture = await page.evaluate(() => ({ starts: window.chordAudio.at(-1).starts, tones: window.chordAudio.at(-1).tones }));
        const clips = capture.starts.filter((source) => source.bufferDuration === 4);
        assert.equal(clips.length, recording ? 1 : 0); assert.equal(capture.tones.length, tones ? 1 : 0);
        if (tones) assert.ok(Math.abs(capture.tones[0].frequency - 440 * 2 ** ((52 - 69) / 12)) < 0.001);
        if (recording && tones) assert.ok(Math.abs(capture.tones[0].at - clips[0].at - 0.15) < 0.001, 'suggestion and source share one audio clock');
        await page.waitForFunction(() => window.chordAudio.at(-1).context.state === 'closed');
      }
      assert.deepEqual(guitarNotes(await download('auditioned')), guitarNotes(baseline), 'listening does not mutate the chart');
    }
    phase = 'acceptance, undo/redo and pending protections';
    await suggestions.getByRole('button', { name: 'Accept tone', exact: true }).click();
    assert.equal(await library.locator('.studio-queue > button').count(), 4);
    assert.equal(await library.getByRole('button', { name: 'Add to setlist', exact: true }).isDisabled(), true);
    assert.equal(await library.getByRole('button', { name: 'Download chart', exact: true }).isDisabled(), true);
    assert.equal(await listening.getByRole('button', { name: 'Suggestion only', exact: true }).isDisabled(), true);
    if (fullBand) assert.equal(await library.getByRole('tab', { name: 'Keys', exact: true }).isDisabled(), true);
    await library.getByRole('button', { name: 'Undo note edit', exact: true }).click();
    assert.equal(await library.locator('.studio-queue > button').count(), 3);
    assert.equal(await suggestions.locator('.studio-suggestion-queue > button').count(), 2);
    await library.getByRole('button', { name: 'Redo note edit', exact: true }).click();
    assert.equal(await library.locator('.studio-queue > button').count(), 4);
    await apply.click();
    const accepted = await download('accepted'), added = guitarNotes(accepted).filter((note) => !guitarNotes(baseline).some((old) => JSON.stringify(old) === JSON.stringify(note)));
    assert.equal(added.length, 1); assert.equal(added[0].pitch, 52); assert.equal(added[0].confidence, undefined);
    assert.deepEqual(guitarNotes(accepted).filter((note) => !added.includes(note)), guitarNotes(baseline), 'acceptance preserves all previous notes, fingerings and holds');
    assert.deepEqual(accepted.parts.filter((part) => part.type !== 'guitar'), baseline.parts.filter((part) => part.type !== 'guitar'));
    assert.ok(!JSON.stringify(accepted).includes('short-chord:'), 'unverified candidates and decisions are not exported');
    phase = 'dismissal, decisions across instrument switches and restore';
    await suggestions.getByRole('button', { name: 'Review suggestion G2 at 2.138 seconds', exact: true }).click();
    await suggestions.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await library.getByRole('button', { name: 'Undo note edit', exact: true }).click();
    assert.equal(await suggestions.locator('.studio-suggestion-queue > button').count(), 1);
    await suggestions.getByRole('button', { name: 'Dismiss', exact: true }).click(); await apply.click();
    assert.deepEqual(guitarNotes(await download('dismissed')), guitarNotes(accepted));
    if (fullBand) {
      await library.getByRole('tab', { name: 'Keys', exact: true }).click();
      assert.equal(await library.getByRole('region', { name: 'Chord suggestions', exact: true }).count(), 0);
      await library.getByRole('tab', { name: 'Guitar', exact: true }).click();
      assert.equal(await suggestions.locator('.studio-suggestion-queue > button').count(), 0, 'applied decisions survive a tab remount');
      assert.equal(await library.locator('.studio-queue > button').count(), 4);
    }
    await suggestions.getByRole('button', { name: 'Show reviewed', exact: true }).click();
    await suggestions.getByRole('button', { name: 'Review suggestion E3 at 0.639 seconds', exact: true }).click();
    await suggestions.getByRole('button', { name: 'Reopen suggestion', exact: true }).click();
    assert.equal(await suggestions.getByRole('button', { name: 'Accept tone', exact: true }).isDisabled(), true, 'reopening cannot duplicate an accepted pitch');
    await suggestions.getByText(/already in the draft near this attack/).waitFor();
    await library.getByRole('button', { name: 'Undo note edit', exact: true }).click();
    await captureStudio('desktop');
    await library.getByRole('button', { name: 'Restore original', exact: true }).click();
    const restored = await download('restored'); assert.deepEqual(restored.parts, baseline.parts);
    assert.equal(await suggestions.locator('.studio-suggestion-queue > button').count(), 2);
    assert.equal(await apply.isDisabled(), true);
    await suggestions.getByRole('button', { name: 'Review suggestion G2 at 2.138 seconds', exact: true }).click();
    await listening.getByRole('button', { name: 'Suggestion + recording', exact: true }).click();
    await page.waitForFunction(() => window.chordAudio.at(-1)?.tones.length > 0);
    await library.getByRole('button', { name: 'Close song library', exact: true }).click();
    await page.waitForFunction(() => window.chordAudio.every((capture) => capture.context.state === 'closed'));
    assert.equal(await page.evaluate(() => window.chordWorkers.every((worker) => !worker.active)), true);
    assert.deepEqual(errors, []);
    evidence.runs.push({ fullBand, originalNotes: 3, suggestions: 2, acceptedNotes: 4, preservedOtherParts: true, browserErrors: errors });
    await context.close();
  }
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log('PASS: native chord imports, unverified source/tone/synchronized audition, acceptance, dismissal, undo/redo, pending guards, duplicate prevention, full-band tab decisions, export, independent restore and audio cleanup. Desktop only.');
} catch (error) {
  console.error(`FAIL during ${phase}:`, error);
  const page = browser.contexts().at(-1)?.pages()[0]; if (page) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }
