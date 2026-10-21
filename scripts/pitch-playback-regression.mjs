import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { drumWav } from './fixtures/drum-draft.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const output = resolve(process.env.SESSION_SCREENSHOT_DIR || '/workspace/screenshots/pitch-playback');
assert.ok(output.startsWith('/workspace/screenshots/'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(45000);
const errors = [], evidence = { tempos: [] };
page.on('pageerror', error => errors.push(error.message));
let phase = 'load';
try {
  await page.addInitScript(() => {
    window.pitchAudio = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        const capture = { context: this, starts: [], analyser: null };
        window.pitchAudio.push(capture);
        const create = this.createBufferSource.bind(this);
        this.createBufferSource = () => {
          const source = create(), start = source.start.bind(source);
          source.start = (...args) => {
            // The only buffer-backed SFX is two-second noise. Keep the actual
            // recording/chunk PCM and native schedule, without changing either.
            if (source.buffer && source.buffer.duration !== 2) capture.starts.push({ at: args[0], buffer: source.buffer, rate: source.playbackRate.value });
            return start(...args);
          };
          return source;
        };
        const compressor = this.createDynamicsCompressor.bind(this);
        this.createDynamicsCompressor = () => {
          const node = compressor(); capture.analyser = this.createAnalyser();
          capture.analyser.fftSize = 16384; node.connect(capture.analyser); return node;
        };
      }
    };
    window.outputPitch = () => {
      const capture = window.pitchAudio.find(c => c.analyser && c.starts.length);
      if (!capture) return 0;
      const bins = new Float32Array(capture.analyser.frequencyBinCount);
      capture.analyser.getFloatFrequencyData(bins);
      let peak = 0;
      for (let i = 10; i < bins.length; i++) if (bins[i] > bins[peak]) peak = i;
      return bins[peak] > -70 ? peak * capture.context.sampleRate / capture.analyser.fftSize : 0;
    };
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.pad').first().waitFor();
  await page.getByRole('button', { name: 'Import songs', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Your songs', exact: true });
  await library.getByRole('button', { name: 'Rhythm', exact: true }).click();
  const rate = 44100;
  const samples = Float32Array.from({ length: rate * 24 }, (_, i) => {
    const time = i / rate, beat = time % 0.5;
    return (0.16 + 0.5 * Math.exp(-beat * 70)) * Math.sin(2 * Math.PI * (time < 12 ? 440 : 880) * time);
  });
  await library.getByLabel('Choose song file', { exact: true }).setInputFiles({ name: 'Pitch Practice.wav', mimeType: 'audio/wav',
    buffer: drumWav({ sampleRate: rate, getChannelData: () => samples }) });
  await library.getByRole('button', { name: 'Add to setlist', exact: true }).click();
  await library.waitFor({ state: 'hidden' });
  const tempo = page.getByRole('combobox', { name: 'TEMPO', exact: true });
  const transport = page.getByRole('group', { name: 'Playback controls', exact: true });
  const reset = () => page.getByRole('button', { name: 'Reset set', exact: true }).click();
  const start = async () => {
    await transport.getByRole('button', { name: /^(Start set|Start practice|Resume)$/ }).click();
    await transport.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  };
  const clear = () => page.evaluate(() => window.pitchAudio.forEach(c => { c.starts = []; }));
  const waitPitch = hz => page.waitForFunction(hz => Math.abs(window.outputPitch() - hz) < 5, hz);
  for (const speed of [1, 0.75, 0.5, 1.25]) {
    phase = `native output at ${speed * 100}%`;
    await tempo.selectOption(String(speed)); await clear(); await start(); await waitPitch(440);
    const result = await page.evaluate(() => {
      const capture = window.pitchAudio.find(c => c.starts.length), starts = capture.starts;
      return { hz: window.outputPitch(), chunks: starts.length, rates: [...new Set(starts.map(s => s.rate))],
        maxBufferSeconds: Math.max(...starts.map(s => s.buffer.duration)),
        schedule: starts.map(s => ({ at: s.at, seconds: s.buffer.duration })) };
    });
    assert.deepEqual(result.rates, [1]);
    assert.ok(speed === 1 ? result.maxBufferSeconds === 24 : result.maxBufferSeconds <= 0.201);
    if (speed !== 1) for (let i = 1; i < result.schedule.length; i++) {
      assert.ok(Math.abs(result.schedule[i].at - result.schedule[i - 1].at - result.schedule[i - 1].seconds) < 1e-7, 'chunks join on the sample clock');
    }
    evidence.tempos.push({ speed, ...result });
    console.log(`Native output at ${speed * 100}%: ${result.hz.toFixed(2)} Hz.`);
    await transport.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForFunction(() => window.outputPitch() === 0);
    await clear(); await start(); await waitPitch(440);
    evidence.tempos.at(-1).resumeHz = await page.evaluate(() => window.outputPitch());
    await reset();
  }
  phase = 'nonzero practice passage and repeat';
  console.log('Checking a nonzero passage, repeat and cancelled startup.');
  await tempo.selectOption('0.75');
  const section = page.getByRole('combobox', { name: 'Practice section', exact: true });
  const options = await section.locator('option').evaluateAll(items => items.map(item => item.value).filter(Boolean));
  const later = options.find(value => Number(value.split(':')[1]) > 12);
  assert.ok(later, 'fixture offers a passage wholly inside its 880 Hz region');
  await section.selectOption(later);
  await page.getByRole('checkbox', { name: 'Repeat section', exact: true }).check();
  await clear(); await start(); await waitPitch(880);
  await page.waitForFunction(() => window.pitchAudio.some(c => c.starts.some((s, i, all) => i > 0 && s.at - all[i - 1].at - all[i - 1].buffer.duration > 0.5)));
  await page.getByText('Take 2', { exact: true }).waitFor();
  await waitPitch(880);
  const passageSchedule = await page.evaluate(() => window.pitchAudio.flatMap(c => c.starts).map(s => ({ at: s.at, seconds: s.buffer.duration })));
  const gaps = passageSchedule.slice(1).map((s, i) => s.at - passageSchedule[i].at - passageSchedule[i].seconds).filter(gap => Math.abs(gap) > 1e-7);
  assert.equal(gaps.length, 1, 'the repeat count-in must be the only gap between chunks');
  assert.ok(gaps[0] > 0.5);
  evidence.passage = { sourceStart: Number(later.split(':')[1]), speed: 0.75, repeatedHz: await page.evaluate(() => window.outputPitch()), chunkCount: passageSchedule.length, gaps };
  await transport.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForFunction(() => window.outputPitch() === 0);
  await reset();
  phase = 'cancel startup and reload';
  await clear();
  await transport.evaluate(region => {
    [...region.querySelectorAll('button')].find(b => /Start (set|practice)/.test(b.textContent)).click();
    region.querySelector('button[aria-label="Reset set"]').click();
  });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.pitchAudio.flatMap(c => c.starts).length), 0, 'cancelled startup cannot schedule stale audio');
  await page.reload({ waitUntil: 'domcontentloaded' });
  // The server-rendered default set appears before saved preferences hydrate.
  await page.getByRole('heading', { level: 2, name: 'Pitch Practice', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('select')].some(select => select.closest('label')?.textContent.includes('TEMPO') && select.value === '0.75'));
  assert.equal(await tempo.inputValue(), '0.75');
  await page.getByText('Recordings and stems keep their original pitch at every tempo.', { exact: false }).waitFor();
  await tempo.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/pitch-practice-desktop.png` });
  assert.deepEqual(errors, []);
  evidence.browserErrors = errors;
  await writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log('PASS: real imported recording; native 440 Hz output at 50/75/100/125%; sample-contiguous bounded chunks; pause/resume silence; 880 Hz nonzero passage and repeat; startup cancellation; saved tempo; desktop render.');
} catch (error) {
  console.error(`Pitch playback failed during ${phase}:`, error);
  await writeFile(`${output}/result.json`, JSON.stringify({ ...evidence, failedPhase: phase, error: String(error) }, null, 2));
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
  throw error;
} finally { await browser.close(); }
