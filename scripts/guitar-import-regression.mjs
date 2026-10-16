#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const output = resolve(process.env.SESSION_SCREENSHOT_DIR || '/workspace/screenshots/guitar-import');
assert.ok(output === '/workspace/screenshots' || output.startsWith('/workspace/screenshots/'));
await mkdir(output, { recursive: true });
const xml = await readFile(new URL('../public/examples/open-string-study.musicxml', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let phase = 'loading';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const input = Object.assign(new EventTarget(), { id: 'import-guitar-qa', name: 'Import guitar QA', state: 'connected' });
    const access = Object.assign(new EventTarget(), { inputs: new Map([[input.id, input]]) });
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
    window.sendImportMidi = (pitch, velocity = 100, channel = 0) => {
      const event = new Event('midimessage');
      Object.defineProperty(event, 'data', { value: new Uint8Array([0x90 + channel, pitch, velocity]) });
      input.dispatchEvent(event);
    };
  });
  const installProbe = () => page.evaluate(async () => {
    const { StageRenderer } = await import('/src/lib/midi-stage/renderer.ts');
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const probe = window.importProbe = { time: -1, live: null };
    AudioEngine.prototype.songAt = function () { return probe.time; };
    const draw = StageRenderer.prototype.draw;
    StageRenderer.prototype.draw = function (state) { probe.live = state; return draw.call(this, state); };
  });
  const settle = () => page.waitForTimeout(180);
  const library = page.getByRole('dialog', { name: 'Your songs', exact: true });
  const file = library.getByLabel('Choose song file', { exact: true });
  const add = library.getByRole('button', { name: 'Add to setlist', exact: true });
  const apply = library.getByRole('button', { name: 'Apply corrections', exact: true });
  const transport = page.getByRole('group', { name: 'Playback controls', exact: true });
  const open = async () => {
    const button = page.getByRole('button', { name: 'Import songs', exact: true });
    if (await button.isVisible()) await button.click();
    else {
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog', { name: 'Stage finder', exact: true }).waitFor();
      await page.getByRole('dialog', { name: 'Stage finder', exact: true }).locator('[data-command-id="import"]').click();
    }
    await library.waitFor();
  };
  const upload = (name, contents) => file.setInputFiles({ name, mimeType: name.endsWith('json') ? 'application/json' : 'application/xml', buffer: Buffer.from(contents) });
  const capture = async (name) => page.screenshot({ path: `${output}/${name}.png` });
  const setTime = async (time) => { await page.evaluate((t) => { window.importProbe.time = t; }, time); await settle(); };
  const reset = () => page.getByRole('button', { name: 'Reset set', exact: true }).click();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.pad').first().waitFor();
  await installProbe();
  await page.waitForFunction(() => window.importProbe.live);

  phase = 'MusicXML preview and correction';
  await open();
  await upload('study.musicxml', xml);
  await library.getByRole('heading', { name: 'Review the guitar arrangement', exact: true }).waitFor();
  assert.equal(await library.locator('tbody tr').count(), 16);
  assert.equal(await add.isEnabled(), true);
  assert.match(await library.innerText(), /E2 · A2 · D3 · G3 · B3 · E4/);
  await library.getByLabel('Note 1 fret', { exact: true }).fill('1');
  assert.equal(await add.isDisabled(), true, 'unapplied edits cannot be added');
  assert.equal(await library.getByRole('button', { name: 'Download chart', exact: true }).isDisabled(), true);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.importProbe.live.status), 'ready', 'editor input cannot start the stage');
  await library.getByLabel('Note 1 length', { exact: true }).fill('1');
  await apply.click();
  await library.getByRole('alert').filter({ hasText: /overlapping/ }).waitFor();
  assert.equal(await add.isDisabled(), true, 'invalid overlapping holds cannot be saved');
  await library.getByLabel('Note 1 length', { exact: true }).fill('0.3125');
  await library.getByLabel('Chart tempo', { exact: true }).fill('48');
  await apply.click();
  await library.getByText(/Corrections applied/).waitFor();
  assert.equal(await library.getByLabel('Note 2 time', { exact: true }).inputValue(), '0.625');
  assert.equal(await library.locator('tbody tr').first().locator('.guitar-review-pitch').innerText(), 'F2');
  await library.locator('.guitar-import-review').scrollIntoViewIfNeeded();
  await capture('guitar-import-reviewed-desktop');
  const downloadPromise = page.waitForEvent('download');
  await library.getByRole('button', { name: 'Download chart', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = `${output}/reviewed.midistage.json`;
  await download.saveAs(downloadPath);
  const exported = JSON.parse(await readFile(downloadPath, 'utf8'));
  assert.equal(exported.version, 4);
  assert.equal(exported.bpm, 48);
  assert.equal(exported.parts[2].notes[0].pitch, 41);
  assert.deepEqual(exported.parts[2].notes[0].guitarPosition, { string: 6, fret: 1 });
  assert.equal(exported.parts[2].notes.filter((n) => n.time === 10 && n.pitch === 64).length, 2);
  await add.click();
  await library.waitFor({ state: 'hidden' });
  await settle();
  const initialId = await page.evaluate(() => window.importProbe.live.song.id);
  assert.match(initialId, /^import:/);
  assert.equal(await page.evaluate(() => window.importProbe.live.song.guitarMode), 'strings');
  assert.equal(await page.locator('.guitar-string-guide-strings li').count(), 6);
  assert.equal(await page.evaluate(() => window.importProbe.live.players.filter((p) => p.enabled).map((p) => p.id).join()), 'guitar');
  assert.equal(await transport.getByRole('button', { name: 'Start set', exact: true }).count(), 0, 'scored play requires guitar MIDI');

  phase = 'imported arrangement play-along and exact MIDI scoring';
  await page.locator('.session-actions').getByRole('button', { name: 'Play along', exact: true }).click();
  await page.waitForFunction(() => window.importProbe.live.status === 'playing' && window.importProbe.live.demo);
  await reset();
  await page.getByRole('button', { name: 'Connect MIDI', exact: true }).click();
  await transport.getByRole('button', { name: 'Start set', exact: true }).waitFor();
  await transport.getByRole('button', { name: 'Start set', exact: true }).click();
  await page.waitForFunction(() => window.importProbe.live.status === 'playing' && !window.importProbe.live.demo);
  await setTime(0);
  await page.evaluate(() => window.sendImportMidi(40));
  assert.equal(await page.evaluate(() => window.importProbe.live.judges.get('guitar').notes[0].state), 0, 'unedited E2 must not match corrected F2');
  await page.evaluate(() => window.sendImportMidi(41));
  assert.equal(await page.evaluate(() => window.importProbe.live.judges.get('guitar').notes[0].grade), 'perfect');
  await setTime(0.625);
  await page.evaluate(() => window.sendImportMidi(41, 0));
  await setTime(10);
  await page.evaluate(() => { window.sendImportMidi(64, 100, 0); window.sendImportMidi(64, 100, 1); });
  assert.deepEqual(await page.evaluate(() => window.importProbe.live.judges.get('guitar').notes
    .filter((n) => n.time === 10).map((n) => n.hold)), ['held', 'held'], 'unison notes on separate strings retain independent targets');
  await page.locator('.stage-viewport').scrollIntoViewIfNeeded();
  await capture('guitar-import-live-desktop');
  await setTime(12.5);
  await page.evaluate(() => { window.sendImportMidi(64, 0, 0); window.sendImportMidi(64, 0, 1); });
  assert.deepEqual(await page.evaluate(() => window.importProbe.live.judges.get('guitar').notes
    .filter((n) => n.time === 10).map((n) => n.hold)), ['complete', 'complete']);
  await transport.getByRole('button', { name: 'Pause', exact: true }).click();
  await capture('guitar-import-highway-desktop');
  await reset();

  phase = 'saved guitar identity, duplicate export and reload';
  await open();
  await upload('reviewed.midistage.json', JSON.stringify(exported));
  await library.getByRole('heading', { name: 'Review the guitar arrangement', exact: true }).waitFor();
  await add.click();
  await library.waitFor({ state: 'hidden' });
  await settle();
  assert.equal(await page.evaluate(() => window.importProbe.live.song.id), initialId);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('region', { name: 'Real guitar guide', exact: true }).waitFor();
  await installProbe();
  await page.waitForFunction(() => window.importProbe.live);
  assert.equal(await page.evaluate(() => window.importProbe.live.song.id), initialId);
  assert.equal(await page.evaluate(() => window.importProbe.live.status), 'ready');
  assert.equal(await page.evaluate(() => window.importProbe.live.judges.get('guitar').lanes.length), 6);
  assert.equal(await page.evaluate(() => window.importProbe.live.judges.get('guitar').notes[0].pitch), 41);

  phase = 'invalid import and unsaved correction isolation';
  await open();
  assert.equal(await library.getByRole('button', { name: 'Play Open-string Study', exact: true }).count(), 1);
  await upload('invalid.musicxml', xml.replace('<sound tempo="96"/>', '<sound tempo="96"/><sound tempo="100"/>'));
  await library.getByRole('alert').filter({ hasText: /Tempo changes/ }).waitFor();
  assert.equal(await page.evaluate(() => window.importProbe.live.song.id), initialId);
  await upload('fresh.musicxml', xml);
  await library.getByRole('heading', { name: 'Review the guitar arrangement', exact: true }).waitFor();
  await library.getByLabel('Note 1 fret', { exact: true }).fill('4');
  await library.getByRole('button', { name: 'Restore original', exact: true }).click();
  assert.equal(await library.getByLabel('Note 1 fret', { exact: true }).inputValue(), '0');
  assert.equal(await add.isEnabled(), true);
  await library.getByRole('button', { name: 'Remove note 1', exact: true }).click();
  await apply.click();
  assert.equal(await library.locator('tbody tr').count(), 15);
  await library.getByRole('button', { name: 'Add note', exact: true }).click();
  await apply.click();
  assert.equal(await library.locator('tbody tr').count(), 16);
  await library.getByRole('button', { name: 'Close song library', exact: true }).click();
  assert.equal(await page.evaluate(() => window.importProbe.live.song.id), initialId, 'closing an edited preview never replaces the selected chart');
  phase = 'custom tuning reaches the guide and highway';
  await open();
  const dropD = xml.replace('Open-string Study', 'Drop-D Study')
    .replace('<tuning-step>E</tuning-step><tuning-octave>2', '<tuning-step>D</tuning-step><tuning-octave>2')
    .replaceAll('<step>E</step><octave>2', '<step>D</step><octave>2')
    .replace('<step>G</step><octave>2', '<step>F</step><octave>2');
  await upload('drop-d.musicxml', dropD);
  await library.getByRole('heading', { name: 'Review the guitar arrangement', exact: true }).waitFor();
  assert.match(await library.locator('.guitar-review-setup').innerText(), /D2 · A2 · D3 · G3 · B3 · E4/);
  await add.click();
  await library.waitFor({ state: 'hidden' });
  await settle();
  assert.equal(await page.evaluate(() => window.importProbe.live.song.guitarTuning[0]), 38);
  assert.equal(await page.evaluate(() => window.importProbe.live.judges.get('guitar').notes[0].pitch), 38);
  assert.match(await page.locator('.guitar-string-guide-caption').innerText(), /low D at bottom/);
  assert.match(await page.locator('.guitar-string-guide-help').innerText(), /Tuning · D2 A2 D3 G3 B3 E4/);
  await page.locator('.guitar-string-guide').scrollIntoViewIfNeeded();
  await capture('guitar-import-drop-d-desktop');

  phase = 'silent cues are excluded without shifting scored targets';
  await open();
  const cueStaff = '<note><cue/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><staff>2</staff><notations><technical><string>1</string><fret>0</fret></technical></notations></note><backup><duration>2</duration></backup>';
  const cued = xml.replace(/<note>[\s\S]*?<\/note>/, (note) => note
    .replace('<note>', '<note><cue/>').replace(/<notations>[\s\S]*?<\/notations>/, ''))
    .replace('<note>', `${cueStaff}<note>`);
  await upload('silent-cue.musicxml', cued);
  await library.getByText('Silent cue notes are omitted; their written timing is preserved.', { exact: true }).waitFor();
  assert.equal(await library.locator('tbody tr').count(), 15);
  assert.equal(await library.getByLabel('Note 1 time', { exact: true }).inputValue(), '0.3125');
  assert.equal(await library.locator('tbody tr').first().locator('.guitar-review-pitch').innerText(), 'G2');
  const cueDownloadPromise = page.waitForEvent('download');
  await library.getByRole('button', { name: 'Download chart', exact: true }).click();
  const cueDownload = await cueDownloadPromise;
  const cuePath = `${output}/silent-cue.midistage.json`;
  await cueDownload.saveAs(cuePath);
  const cueChart = JSON.parse(await readFile(cuePath, 'utf8'));
  assert.equal(cueChart.parts[2].notes.length, 15);
  assert.equal(cueChart.parts[2].notes[0].time, 0.3125);
  await capture('guitar-import-cue-desktop');

  phase = 'direction and sound offsets use playback timing';
  const metronome = '<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>96</per-minute></metronome></direction-type>';
  for (const [index, direction] of [
    `<direction>${metronome}<offset>4</offset><sound tempo="96"/></direction>`,
    `<direction>${metronome}<offset sound="yes">4</offset><sound tempo="96"><offset>0</offset></sound></direction>`,
  ].entries()) {
    const filename = `offset-${index + 1}.musicxml`;
    await upload(filename, xml.replace(/<direction>[\s\S]*?<\/direction>/, direction));
    await library.getByText(filename, { exact: true }).waitFor();
    await library.getByRole('heading', { name: 'Review the guitar arrangement', exact: true }).waitFor();
    assert.equal(await library.locator('tbody tr').count(), 16);
    assert.equal(await library.getByLabel('Note 1 time', { exact: true }).inputValue(), '0');
    assert.equal(await library.getByLabel('Chart tempo', { exact: true }).inputValue(), '96');
  }
  await capture('guitar-import-offset-desktop');
  await upload('delayed-tempo.musicxml', xml.replace(/<direction>[\s\S]*?<\/direction>/, '<sound tempo="96"><offset>4</offset></sound>'));
  await library.getByRole('alert').filter({ hasText: /initial tempo at the start/ }).waitFor();
  assert.equal(await add.count(), 0, 'a delayed initial tempo cannot create a chart at the wrong speed');
  assert.deepEqual(errors, []);
  console.log('PASS: MusicXML preview, correction validation, tempo scaling, export, six-string MIDI scoring, independent unisons/holds, playback gate, persistence, duplicate identity, restore/add/remove, cancelled-edit isolation, silent cue omission/timing and playback offsets. Desktop only.');
} catch (error) {
  console.error(`Guitar import phase: ${phase}`);
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: `${output}/guitar-import-failure.png` }).catch(() => {});
    console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
  }
  throw error;
} finally {
  await browser.close();
}
