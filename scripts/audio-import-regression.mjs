#!/usr/bin/env node
// Real MP3/WAV/FLAC decoding, IndexedDB restoration and Web Audio backing.
// Fixtures are original deterministic percussion, independent of native tools.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const screenshotDir = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
if (screenshotDir) {
  assert.ok(screenshotDir === '/workspace/screenshots' || screenshotDir.startsWith('/workspace/screenshots/'),
    'Audio import screenshots must be stored under /workspace/screenshots');
  await mkdir(screenshotDir, { recursive: true });
}
const fixtures = Object.fromEntries(await Promise.all(['wav', 'mp3', 'flac'].map(async (extension) => [extension, {
  name: `${extension.toUpperCase()} Rehearsal.${extension}`,
  mimeType: { wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac' }[extension],
  buffer: await readFile(new URL(`../tests/fixtures/audio/rehearsal-pulse.${extension}`, import.meta.url)),
}])));
function silenceFile() {
  const rate = 8000;
  const samples = rate * 2;
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
  return { name: 'Silence.wav', mimeType: 'audio/wav', buffer };
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
page.setDefaultTimeout(15000);
const errors = [];
const navigations = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) navigations.push({ url: frame.url(), at: Date.now() });
});
try {
  await page.addInitScript(() => {
    const input = Object.assign(new EventTarget(), { id: 'rhythm-keys', name: 'Rhythm keyboard', state: 'connected' });
    const access = Object.assign(new EventTarget(), { inputs: new Map([[input.id, input]]) });
    const fake = window.audioMidi = {
      requests: 0,
      send(note, velocity = 100) {
        const event = new Event('midimessage');
        Object.defineProperty(event, 'data', { value: new Uint8Array([0x90, note, velocity]) });
        input.dispatchEvent(event);
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
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await page.locator('.pad').first().waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('button')]
          .some((button) => button.textContent.trim() === 'Start set' && !button.disabled));
        await frames();
        return;
      } catch (error) {
        // This helper is used only after explicit goto/reload. A finishing
        // document navigation may invalidate its short animation-frame wait.
        if (attempt || !String(error).includes('Execution context was destroyed')) throw error;
        await page.waitForLoadState('domcontentloaded');
      }
    }
  };
  const installProbe = () => page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const { Judge } = await import('/src/lib/midi-stage/engine.ts');
    const probe = window.audioImportProbe = { audio: null, judge: null, time: -1, beginCalls: 0, backingStarts: [], releases: [] };
    const begin = AudioEngine.prototype.begin;
    AudioEngine.prototype.begin = function (options) {
      probe.audio = this;
      probe.lastOptions = options;
      probe.beginCalls++;
      return begin.call(this, options);
    };
    AudioEngine.prototype.songAt = function () { return probe.time; };
    const tick = Judge.prototype.tick;
    Judge.prototype.tick = function (time) { probe.judge = this; return tick.call(this, time); };
    const release = Judge.prototype.release;
    Judge.prototype.release = function (token, time) { probe.releases.push(token); return release.call(this, token, time); };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer?.duration > 7) probe.backingStarts.push({ source: this, when: args[0], offset: args[1] ?? 0, calledAt: this.context.currentTime });
      return start.apply(this, args);
    };
  });
  const dialog = page.getByRole('dialog', { name: 'Your songs', exact: true });
  const start = page.getByRole('button', { name: 'Start set', exact: true });
  const openLibrary = async () => {
    const button = page.getByRole('button', { name: 'Import songs', exact: true });
    if (!await button.isVisible()) await page.getByRole('button', { name: 'Open setlist', exact: true }).click();
    await button.click();
    await dialog.waitFor();
  };
  const upload = async (file) => {
    await dialog.getByLabel('Choose song file', { exact: true }).setInputFiles(file);
    await frames();
  };
  const add = async (name) => {
    await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('heading', { level: 2, name, exact: true }).waitFor();
    await frames();
    assert.equal(await start.isEnabled(), true, 'audio import must leave the set ready');
  };
  const beginBacking = async (name, speed = 1) => {
    await page.evaluate(() => { window.audioImportProbe.time = -1; });
    await start.click();
    await page.waitForFunction(() => window.audioImportProbe.audio?.running && window.audioImportProbe.audio.backingSource);
    await page.evaluate(({ name, speed }) => {
      const probe = window.audioImportProbe;
      const source = probe.audio.backingSource;
      const decoded = probe.lastOptions.backingBuffer;
      if (probe.lastOptions.song.name !== name) throw new Error('Wrong audio song reached playback');
      if (!decoded || source.buffer !== decoded) throw new Error('Backing source must play the decoded original audio');
      if (decoded.duration < 7.8 || decoded.duration > 8.4) throw new Error('Decoded audio duration was lost');
      if (source.playbackRate.value !== speed) throw new Error('Backing speed must match chart tempo');
      const started = probe.backingStarts.at(-1);
      if (!started || started.source !== source || started.offset !== 0) throw new Error('Fresh backing must start from its beginning');
      if (started.when - started.calledAt < 1) throw new Error('Backing must wait for the audible count-in');
    }, { name, speed });
  };
  const reset = async () => {
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Reset set', exact: true }).click();
    await frames();
  };
  const assertRhythmControls = async () => {
    const overlay = page.locator('[data-session-overlay="ready"]');
    assert.match(await overlay.innerText(), /Tap once per gem/);
    assert.match(await overlay.innerText(), /any MIDI note/);
    assert.match(await overlay.innerText(), /No holds needed/);
    assert.match(await overlay.locator('.session-controls').innerText(), /SPACE/);
    await page.locator('.pad').evaluate((pad) => {
      if (pad.getBoundingClientRect().width < pad.parentElement.clientWidth - 2)
        throw new Error('The single rhythm pad must fill its available row');
      if (pad.getBoundingClientRect().height < 44)
        throw new Error('The rhythm pad must remain a usable touch target');
    });
  };
  const screenshot = async (name) => {
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
  };
  const cancelDuringDecode = async (method) => {
    await page.evaluate(() => {
      const prototype = OfflineAudioContext.prototype;
      const original = prototype.decodeAudioData;
      const owned = Object.hasOwn(prototype, 'decodeAudioData');
      const gate = window.pendingAudioDecode = { release: null, returned: false, sampleReads: 0 };
      (window.cancelledAudioDecodes ??= []).push(gate);
      window.restoreAudioDecode = () => {
        if (owned) prototype.decodeAudioData = original;
        else delete prototype.decodeAudioData;
      };
      prototype.decodeAudioData = async function (...args) {
        // Finish the actual browser decode, then hold only its delivery. If an
        // abandoned import still analyzes PCM, this buffer records that work.
        const decoded = await original.apply(this, args);
        const read = decoded.getChannelData;
        decoded.getChannelData = function (...readArgs) {
          gate.sampleReads++;
          return read.apply(this, readArgs);
        };
        await new Promise((release) => { gate.release = release; });
        gate.returned = true;
        return decoded;
      };
    });
    try {
      await upload({ ...fixtures.wav, name: `Cancelled ${method}.wav` });
      await page.waitForFunction(() => typeof window.pendingAudioDecode.release === 'function');
      await dialog.getByRole('status').filter({ hasText: 'Decoding audio…' }).waitFor();
      assert.equal(await dialog.getByLabel('Choose song file', { exact: true }).isDisabled(), true,
        'file selection must show that an import is in progress');
      assert.equal(await dialog.getByRole('progressbar').count(), 1);
      if (method === 'Cancel') {
        await screenshot('audio-import-progress.png');
        await dialog.getByRole('button', { name: 'Cancel import', exact: true }).click();
        assert.equal(await dialog.isVisible(), true, 'Cancel must keep the library open');
        await dialog.getByLabel('Choose song file', { exact: true }).evaluate((input) => {
          if (document.activeElement !== input) throw Error('Cancel must return focus to file selection');
        });
        assert.equal(await dialog.getByRole('progressbar').count(), 0);
      } else {
        if (method === 'Escape') await page.keyboard.press('Escape');
        else await dialog.getByRole('button', { name: 'Close song library', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await openLibrary();
      }
      assert.equal(await dialog.getByLabel('Choose song file', { exact: true }).isEnabled(), true,
        'reopening the library must allow a fresh import');
      await page.evaluate(() => window.pendingAudioDecode.release());
      await page.waitForFunction(() => window.pendingAudioDecode.returned);
      await frames();
      assert.equal(await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).count(), 0,
        'a canceled decode must not repopulate the reopened preview');
      assert.equal(await dialog.getByRole('alert').count(), 0, 'canceling an import must not show a stale error');
      assert.equal(await page.getByRole('heading', { level: 2, name: 'Open Stage', exact: true }).count(), 1,
        'canceling an import must preserve the selected song');
      assert.equal(await page.evaluate(() => window.pendingAudioDecode.sampleReads), 0,
        'a canceled decode must never start sample analysis');
    } finally {
      await page.evaluate(() => {
        window.pendingAudioDecode?.release?.();
        window.restoreAudioDecode?.();
      }).catch(() => {});
    }
  };

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await hydrated();
  await installProbe();
  await openLibrary();
  await cancelDuringDecode('Close');
  await cancelDuringDecode('Escape');
  await cancelDuringDecode('Cancel');
  await upload(silenceFile());
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').innerText(), /silent|silence|quiet|beat|rhythm|onset/i,
    'silent audio must explain why it cannot produce a playable rhythm');
  await upload({ name: 'Broken.flac', mimeType: 'audio/flac', buffer: Buffer.from('fLaCbroken') });
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').innerText(), /decode|audio|valid|read|supported/i);
  assert.equal(await page.getByRole('heading', { level: 2, name: 'Open Stage', exact: true }).count(), 1,
    'audio import errors must preserve the selected set');

  await upload(fixtures.wav);
  await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).waitFor();
  const notes = await dialog.locator('dl dd').allTextContents();
  assert.ok(notes.some((text) => Number.parseInt(text, 10) >= 8), 'the transient fixture must produce a useful playable rhythm');
  assert.deepEqual(await page.evaluate(() => window.cancelledAudioDecodes.map((gate) => gate.sampleReads)), [0, 0, 0],
    'canceled imports must stay unanalysed after a subsequent valid import finishes');
  assert.equal(await page.evaluate(() => window.audioImportProbe.beginCalls), 0, 'preview must not autoplay');
  assert.equal(await page.evaluate(() => window.audioMidi.requests), 0, 'audio analysis must not request MIDI permission');
  await screenshot('audio-import-preview-desktop.png');
  await add('WAV Rehearsal');
  assert.equal(await page.locator('.pad').count(), 1, 'audio rhythm must offer one clear hit lane');
  await assertRhythmControls();
  await page.getByRole('checkbox', { name: 'Strum arrows', exact: true }).check();
  assert.match(await page.locator('#strum-guide-help').innerText(), /not scored or detected from the recording/);
  await beginBacking('WAV Rehearsal');
  await page.waitForFunction(() => window.audioImportProbe.judge?.notes.length > 1);
  await page.evaluate(() => {
    const probe = window.audioImportProbe;
    const first = probe.judge.notes[0];
    probe.time = first.time;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', bubbles: true }));
    if (probe.judge.stats.score <= 0) throw new Error('A key must score the audio rhythm');
    probe.keyboardScore = probe.judge.stats.score;
    probe.time = probe.judge.notes[1].time;
  });
  await page.keyboard.down('Space');
  await page.evaluate(() => {
    const probe = window.audioImportProbe;
    if (probe.judge.stats.score <= probe.keyboardScore) throw new Error('Space must score the rhythm hit');
    if (probe.judge.activeHolds.size) throw new Error('Rhythm hits must stay taps');
    probe.spaceScore = probe.judge.stats.score;
    probe.spaceExtras = probe.judge.stats.extra;
    probe.time = probe.judge.notes[2].time;
  });
  await page.keyboard.down('Space'); // Browser repeat while the key is still held.
  await page.evaluate(() => {
    const probe = window.audioImportProbe;
    if (probe.judge.stats.score !== probe.spaceScore || probe.judge.stats.extra !== probe.spaceExtras || probe.judge.notes[2].state)
      throw new Error('Holding Space must not consume another rhythm note or count an extra press');
  });
  await page.keyboard.up('Space');
  assert.equal(await page.evaluate(() => window.audioImportProbe.releases.some((token) => token.endsWith(':Space'))), true,
    'Space keyup must release its original rhythm input');
  await page.getByRole('button', { name: 'Connect MIDI', exact: true }).click();
  await page.waitForFunction(() => window.audioMidi.requests === 1);
  await frames();
  await page.evaluate(() => {
    const probe = window.audioImportProbe;
    probe.time = probe.judge.notes[2].time;
    window.audioMidi.send(119); // A pitch absent from the generated C4 chart.
    window.audioMidi.send(119, 0);
    if (probe.judge.stats.score <= probe.spaceScore) throw new Error('Any MIDI pitch must score the rhythm hit');
    probe.beforePauseScore = probe.judge.stats.score;
    probe.beforePauseExtras = probe.judge.stats.extra;
    probe.time = 2.1;
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.locator('[data-session-overlay="paused"]').waitFor();
  await page.evaluate(() => {
    const probe = window.audioImportProbe;
    if (probe.judge.stats.score !== probe.beforePauseScore || probe.judge.stats.extra !== probe.beforePauseExtras)
      throw new Error('Space on the Pause button must activate the button without hitting the rhythm lane');
  });
  assert.equal(await page.evaluate(() => window.audioImportProbe.audio.backingSource), null, 'Pause must stop and clear the backing source');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.audioImportProbe.audio?.backingSource));
  await page.evaluate(() => {
    const probe = window.audioImportProbe;
    const resumed = probe.backingStarts.at(-1);
    if (Math.abs(resumed.offset - 2.1) > 0.001) throw new Error('Resume must seek into the original audio');
    if (resumed.source !== probe.audio.backingSource) throw new Error('Resume must create a new live backing source');
  });
  await reset();
  await page.getByRole('combobox', { name: /TEMPO/ }).selectOption('0.75');
  await beginBacking('WAV Rehearsal', 0.75);
  await reset();
  await page.getByRole('combobox', { name: /TEMPO/ }).selectOption('1');

  for (const extension of ['mp3', 'flac']) {
    await openLibrary();
    await upload(fixtures[extension]);
    const name = `${extension.toUpperCase()} Rehearsal`;
    await add(name);
    await beginBacking(name);
    await reset();
  }

  // A failed overwrite must not discard the durable copy of an identical
  // audio import. Keep the real IndexedDB read path and only fail this write.
  await openLibrary();
  await page.evaluate(() => {
    window.originalAudioPut = IDBObjectStore.prototype.put;
    window.audioPutFailures = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'tracks') {
        window.audioPutFailures++;
        throw new DOMException('Fixture storage is full', 'QuotaExceededError');
      }
      return window.originalAudioPut.apply(this, args);
    };
  });
  try {
    await upload(fixtures.flac);
    await add('FLAC Rehearsal');
    assert.equal(await page.evaluate(() => window.audioPutFailures), 1, 'duplicate reimport must attempt the simulated failed write');
  } finally {
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalAudioPut; });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await hydrated();
  await installProbe();
  await page.getByRole('heading', { level: 2, name: 'FLAC Rehearsal', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.audioImportProbe.beginCalls), 0, 'reload must stay ready');
  await beginBacking('FLAC Rehearsal');
  await reset();

  // Removing just the stored audio simulates browser storage eviction while the
  // metadata remains. A fresh document must refuse silent backing playback.
  await page.evaluate(async () => {
    const { deleteAudioAsset, loadAudioAsset } = await import('/src/lib/midi-stage/audio-assets.ts');
    const id = window.audioImportProbe.lastOptions.song.audioAssetId;
    if (!id || !await loadAudioAsset(id)) throw new Error('The original audio must exist in IndexedDB before eviction');
    await deleteAudioAsset(id);
    if (await loadAudioAsset(id)) throw new Error('The missing-asset fixture was not removed');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await hydrated();
  await installProbe();
  await start.click();
  await page.getByRole('status').filter({ hasText: /reimport|import.*again|missing|not.*found|unavailable/i }).waitFor();
  assert.equal(await start.isEnabled(), true, 'missing audio must restore the ready controls');
  assert.equal(await page.evaluate(() => window.audioImportProbe.audio?.running ?? false), false,
    'missing audio must not silently start the scoring clock');

  await page.setViewportSize({ width: 390, height: 844 });
  await openLibrary();
  await upload(fixtures.wav);
  await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Add to setlist', exact: true }).scrollIntoViewIfNeeded();
  await screenshot('audio-import-preview-mobile.png');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await add('WAV Rehearsal');
  await assertRhythmControls();
  await beginBacking('WAV Rehearsal');
  await page.waitForFunction(() => window.audioImportProbe.judge?.notes.length > 1);
  await page.evaluate(() => { window.audioImportProbe.time = window.audioImportProbe.judge.notes[0].time; });
  await page.locator('.pad').tap();
  assert.equal(await page.evaluate(() => window.audioImportProbe.judge.stats.score > 0), true,
    'the full-width mobile rhythm pad must score a real touch');
  await reset();
  assert.deepEqual(errors, []);
  console.log('PASS: decode progress and cancellation without stale sample analysis; real WAV/MP3/FLAC decoding; onset preview; original backing/count-in; keyboard, Space and any-pitch MIDI scoring; Space repeat/release and native buttons; pause/seek/resume; backing tempo; duplicate reimport under quota; IndexedDB reload; missing audio recovery; silence/corruption errors; rhythm guidance and full-width touch pad on mobile');
} catch (error) {
  console.error('Audio import regression failed:', error);
  console.error('Audio import regression state:', await page.locator('body').innerText().catch(() => 'Page unavailable'), { errors, navigations });
  console.error('Canceled audio decodes:', await page.evaluate(() => window.cancelledAudioDecodes?.map((gate) => ({
    returned: gate.returned, sampleReads: gate.sampleReads,
  }))).catch(() => 'Probe unavailable'));
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'audio-import-failure.png'), fullPage: true })
    .catch((diagnosticError) => console.error('Audio import failure screenshot unavailable:', diagnosticError));
  throw error;
} finally {
  await browser.close().catch((cleanupError) => console.error('Browser cleanup failed:', cleanupError));
}
