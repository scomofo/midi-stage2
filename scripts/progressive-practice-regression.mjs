import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const output = resolve(process.env.SESSION_SCREENSHOT_DIR || '/workspace/screenshots/progressive-practice');
assert.ok(output.startsWith('/workspace/screenshots/'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
// Retain desktop CSS dimensions at a smaller backing resolution for software
// Canvas2D on CI; this keeps native MIDI delivery inside real judgment windows.
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 0.5, reducedMotion: 'reduce' });
page.setDefaultTimeout(45000);
const errors = [], evidence = {};
page.on('pageerror', error => errors.push(error.message));
let phase = 'load';
const fixture = guitar => ({
  name: `${guitar ? 'Manual' : 'Scored'} Tempo.midistage.json`, mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({ schema: 'midi-stage-chart', version: guitar ? 4 : 1,
    id: guitar ? 'manual-tempo' : 'scored-tempo', title: guitar ? 'Manual Tempo' : 'Scored Tempo', bpm: 240, duration: 2.8,
    ...(guitar ? { guitarMode: 'strings', guitarTuning: [40, 45, 50, 55, 59, 64] } : {}),
    sections: [{ time: 0, name: 'Riff' }, { time: 1.4, name: 'Outro' }],
    parts: ['keys', 'drums', 'guitar', 'bass'].map(type => ({ type, notes: type === (guitar ? 'guitar' : 'keys')
      ? [0.24, 0.52, 0.78, 1.04, 1.7].map(time => ({ time, duration: 0.08, pitch: guitar ? 40 : 60, velocity: 100,
        ...(guitar ? { guitarPosition: { string: 6, fret: 0 } } : {}) })) : [] })) })),
});
try {
  await page.addInitScript(() => {
    const port = Object.assign(new EventTarget(), { id: 'tempo-midi', name: 'Tempo keyboard', state: 'connected' });
    const access = Object.assign(new EventTarget(), { inputs: new Map([[port.id, port]]) });
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
    const driver = window.tempoDriver = { enabled: false, take: 0, starts: [], pending: [], sent: [], observed: [] };
    const send = (status, pitch) => {
      const event = new Event('midimessage');
      Object.defineProperty(event, 'data', { value: new Uint8Array([status, pitch, status === 0x90 ? 100 : 0]) });
      port.dispatchEvent(event);
    };
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        const create = this.createOscillator.bind(this);
        const createGain = this.createGain.bind(this);
        this.createGain = () => {
          const gain = createGain(), set = gain.gain.setValueAtTime.bind(gain.gain);
          gain.tempoValues = [];
          gain.gain.setValueAtTime = (...args) => { gain.tempoValues.push(args[0]); return set(...args); };
          return gain;
        };
        this.createOscillator = () => {
          const node = create(), start = node.start.bind(node), connect = node.connect.bind(node);
          let destination;
          node.connect = (...args) => { destination = args[0]; return connect(...args); };
          node.start = (...args) => {
            const ctx = node.context;
            if (driver.observed.length < 50) driver.observed.push({ hz: node.frequency.value, gain: destination?.tempoValues, at: args[0] });
            // Count-in clicks start at gain .15; hit SFX use .08. Some clicks
            // can arrive late on a software-rendered CI frame. Recover the
            // intended origin from any future-scheduled count-in beat.
            if (destination?.tempoValues?.[0] === 0.15 && [1000, 1400].includes(node.frequency.value)) {
              const speed = Number([...document.querySelectorAll('select')].find(select => select.closest('label')?.textContent.includes('TEMPO'))?.value ?? 1);
              if (node.frequency.value === 1400) {
                driver.current = { origin: args[0] + 1 / speed, speed, take: driver.take, beat: 0, precise: false, queued: false };
                driver.starts.push(driver.current);
              }
              const current = driver.current;
              if (current && current.beat < 4) {
                current.beat++;
                if (args[0] > ctx.currentTime + 0.005 || !current.precise) {
                  current.origin = args[0] + (5 - current.beat) * 0.25 / speed;
                  current.precise = args[0] > ctx.currentTime + 0.005;
                }
              }
              if (driver.enabled && current?.beat === 4 && !current.queued) {
                current.queued = true;
                const origin = current.origin;
                const weak = driver.take === 2;
                [0.24, 0.52, 0.78, 1.04].forEach((time, index) => {
                  if (weak && index === 3) return;
                  driver.pending.push({ ctx, at: origin + time / speed, status: 0x90 }, { ctx, at: origin + time / speed + 0.06, status: 0x80 });
                });
                driver.take++;
              }
            }
            return start(...args);
          };
          return node;
        };
      }
    };
    // Deliver actual MIDI events against the native audible clock. No Judge,
    // game clock, result, saved progress or PCM is mocked or seeded.
    setInterval(() => {
      const remaining = [];
      for (const item of driver.pending) {
        const stamp = item.ctx.getOutputTimestamp?.();
        const heard = stamp?.contextTime > 0 && stamp?.performanceTime > 0
          ? stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000
          : item.ctx.currentTime - (item.ctx.outputLatency || item.ctx.baseLatency || 0);
        if (heard >= item.at - (item.status === 0x90 ? 0.04 : 0)) { send(item.status, 60); driver.sent.push({ at: heard, target: item.at, status: item.status }); }
        else remaining.push(item);
      }
      driver.pending = remaining;
    }, 3);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.pad').first().waitFor();
  const library = page.getByRole('dialog', { name: 'Your songs', exact: true });
  const section = page.getByRole('combobox', { name: 'Practice section', exact: true });
  const panel = page.getByRole('region', { name: 'BUILD UP TEMPO', exact: true });
  const transport = page.getByRole('group', { name: 'Playback controls', exact: true });
  const importChart = async guitar => {
    await page.getByRole('button', { name: 'Import songs', exact: true }).click();
    await library.getByLabel('Choose song file', { exact: true }).setInputFiles(fixture(guitar));
    await library.getByRole('button', { name: 'Add to setlist', exact: true }).click();
    await library.waitFor({ state: 'hidden' });
    await section.selectOption('section:0');
    await panel.waitFor();
  };
  const goal = async () => {
    await panel.getByLabel('Starting practice tempo', { exact: true }).selectOption('0.75');
    await panel.getByLabel('Target practice tempo', { exact: true }).selectOption('0.8');
    await panel.getByRole('button', { name: /^(Enable tempo progression|Start a new tempo goal)$/ }).click();
  };
  const plans = () => page.evaluate(() => JSON.parse(localStorage.getItem('midi-stage/tempo-plans')).plans);
  const reset = () => page.getByRole('button', { name: 'Reset set', exact: true }).click();
  const start = () => transport.getByRole('button', { name: 'Start set', exact: true }).click();
  await importChart(false);
  await page.getByRole('combobox', { name: 'DIFFICULTY', exact: true }).selectOption('chill');
  await page.getByRole('button', { name: 'Connect MIDI', exact: true }).first().click();
  await goal();
  phase = 'autoplay cannot earn progress';
  await page.getByRole('button', { name: 'Watch the house', exact: true }).click();
  await page.locator('[data-session-overlay="results"]').waitFor();
  assert.ok(await page.evaluate(() => window.tempoDriver.starts.length > 0), JSON.stringify(await page.evaluate(() => window.tempoDriver.observed)));
  assert.equal(Object.values(await plans())[0].takes, 0);
  await reset();
  phase = 'real MIDI, two strong takes, a difficult take, target completion';
  await page.evaluate(() => { Object.assign(window.tempoDriver, { take: 0, current: null, pending: [], starts: [], sent: [], enabled: true }); });
  await start();
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('midi-stage/tempo-plans')).plans).some(p => p.complete), null, { timeout: 90000 });
  await page.locator('[data-session-overlay="results"]').waitFor();
  await page.evaluate(() => { window.tempoDriver.enabled = false; });
  const scoredPlans = await plans(), key = Object.keys(scoredPlans)[0], scored = scoredPlans[key];
  assert.ok(scored.takes >= 5);
  assert.ok(scored.history.some(t => !t.strong), 'the deliberately omitted MIDI note produces a difficult take');
  assert.ok(scored.history.slice(-2).every(t => t.strong && t.speed === 0.8));
  for (let i = 1; i < scored.history.length; i++) {
    if (!scored.history[i - 1].strong) assert.equal(scored.history[i].speed, scored.history[i - 1].speed, 'a difficult take holds the tempo');
    if (scored.history[i].speed !== scored.history[i - 1].speed && i > 1) assert.ok(scored.history.slice(i - 2, i).every(t => t.strong));
  }
  assert.equal(scored.bestClean, 0.8); assert.equal(scored.current, 0.8);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('midi-stage/rehearsal-bookmark')).setup.speed), 0.8, 'the saved rehearsal keeps the successfully started step');
  assert.equal(await page.getByRole('combobox', { name: 'TEMPO', exact: true }).inputValue(), '0.8');
  evidence.scored = scored;
  evidence.nativeSchedule = await page.evaluate(() => window.tempoDriver.starts);
  assert.ok(evidence.nativeSchedule.length >= 4);
  assert.ok(evidence.nativeSchedule.every(s => s.speed === 0.75 || s.speed === 0.8));
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('midi-stage-best/'))), false);
  await panel.locator('summary').click();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/tempo-scored-desktop.png` });
  console.log(`Native MIDI completed ${scored.takes} takes, advanced 75% to 80% and stopped at the target.`);
  phase = 'reload, isolation and explicit resume';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 2, name: 'Scored Tempo', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Continue rehearsal: Riff', exact: true }).click();
  await panel.getByText('Target reached', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.tempoDriver.starts.length), 0, 'restoring a saved rehearsal never starts audio');
  assert.deepEqual((await plans())[key], scored);
  await section.selectOption('section:1.4');
  assert.equal(await panel.getByText('Target reached', { exact: true }).count(), 0);
  await section.selectOption('section:0');
  await panel.getByText('Target reached', { exact: true }).waitFor();
  phase = 'repeat-off records advancement without restarting';
  // Web MIDI access is deliberately not restored by saved preferences.
  await page.getByRole('button', { name: 'Connect MIDI', exact: true }).first().click();
  await goal();
  await page.getByRole('checkbox', { name: 'Repeat section', exact: true }).uncheck();
  await page.evaluate(() => { Object.assign(window.tempoDriver, { take: 0, current: null, pending: [], starts: [], sent: [], enabled: true }); });
  let stoppedTakes = 0;
  while ((await plans())[key].current < 0.8 && stoppedTakes < 8) {
    await start();
    await page.locator('[data-session-overlay="results"]').waitFor();
    stoppedTakes++;
  }
  assert.equal((await plans())[key].current, 0.8);
  assert.equal(await page.getByRole('combobox', { name: 'TEMPO', exact: true }).inputValue(), '0.75');
  assert.equal((await plans())[key].takes, stoppedTakes, 'repeat-off completes exactly the requested takes');
  assert.equal(await transport.getByRole('button', { name: 'Start set', exact: true }).isEnabled(), true, 'repeat-off leaves playback stopped');
  await page.evaluate(() => { window.tempoDriver.enabled = false; });
  await panel.getByRole('button', { name: /Resume progression at/ }).click();
  assert.equal(await page.getByRole('combobox', { name: 'TEMPO', exact: true }).inputValue(), '0.8');
  assert.equal(await transport.getByRole('button', { name: 'Start set', exact: true }).isEnabled(), true, 'resume config never autoplays');
  console.log('Repeat-off holds playback; saved progression resumes its earned 80% configuration without audio.');
  await reset();
  phase = 'manual guitar progress is self-reported, not scored';
  await importChart(true); await goal();
  assert.equal(await panel.getByRole('button', { name: 'Ready for faster', exact: true }).count(), 0);
  await transport.getByRole('button', { name: 'Play along', exact: true }).click();
  await panel.getByRole('button', { name: 'Ready for faster', exact: true }).waitFor();
  const manualKey = Object.keys(await plans()).find(k => !Object.keys(scoredPlans).includes(k));
  assert.ok(manualKey);
  let manual = (await plans())[manualKey];
  assert.equal(manual.takes, 1); assert.equal(manual.current, 0.75); assert.equal(manual.bestClean, null);
  await panel.getByRole('button', { name: 'Ready for faster', exact: true }).click();
  manual = (await plans())[manualKey];
  assert.equal(manual.current, 0.8); assert.equal(manual.bestClean, null); assert.equal(manual.history[0].confirmed, true);
  assert.equal(await panel.getByRole('button', { name: 'Ready for faster', exact: true }).count(), 0);
  await transport.getByRole('button', { name: 'Play along', exact: true }).click();
  await panel.getByRole('button', { name: 'Confirm target tempo', exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Confirm target tempo', exact: true }).click();
  evidence.manual = (await plans())[manualKey];
  assert.equal(evidence.manual.complete, true); assert.equal(evidence.manual.bestClean, null);
  assert.ok(evidence.manual.history.every(t => t.mode === 'manual' && t.accuracy === null));
  await panel.locator('summary').click(); await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/tempo-manual-desktop.png` });
  phase = 'storage failure stays playable and visible';
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === 'midi-stage/tempo-plans') throw Error('quota fixture'); return save.call(this, key, value); };
  });
  await panel.getByRole('button', { name: 'Start a new tempo goal', exact: true }).click();
  await panel.getByText(/Tempo progress is kept for this visit/).waitFor();
  assert.equal(await transport.getByRole('button', { name: 'Play along', exact: true }).isEnabled(), true);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/tempo-practice-desktop.png` });
  assert.deepEqual(errors, []); evidence.browserErrors = errors;
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log('PASS: native-clock scored progression and difficult-take hold, target cap/stop, autoplay exclusion, reload/isolation, explicit resume, manual guitar confirmation, storage failure and desktop render.');
} catch (error) {
  console.error(`Progressive practice failed during ${phase}:`, error);
  evidence.driver = await page.evaluate(() => ({ starts: window.tempoDriver?.starts, sent: window.tempoDriver?.sent, plans: localStorage.getItem('midi-stage/tempo-plans') })).catch(() => null);
  await writeFile(`${output}/result.json`, JSON.stringify({ ...evidence, failedPhase: phase, error: String(error) }, null, 2));
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
  console.error('Native driver:', await page.evaluate(() => ({ starts: window.tempoDriver?.starts, sent: window.tempoDriver?.sent, plans: localStorage.getItem('midi-stage/tempo-plans') })).catch(() => null));
  throw error;
} finally { await browser.close(); }
