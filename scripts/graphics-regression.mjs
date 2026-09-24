#!/usr/bin/env node
// Actual Canvas2D rendering across chart types, sizes and accessibility modes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const output = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
if (output) {
  assert.ok(output.startsWith('/workspace/screenshots/'));
  await mkdir(output, { recursive: true });
}
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  if (process.env.GRAPHICS_BASELINE_MODULE) await page.addInitScript((value) => { window.__graphicsBaselineModule = value; }, process.env.GRAPHICS_BASELINE_MODULE);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.pad').first().waitFor();
  await page.getByRole('button', { name: 'Guitar OFF', exact: true }).click();
  await page.getByRole('button', { name: 'Keys ON', exact: true }).click();
  const strum = page.getByRole('checkbox', { name: 'Strum arrows', exact: true });
  assert.equal(await strum.isChecked(), false);
  await strum.check();
  assert.match(await page.locator('#strum-guide-help').innerText(), /Suggested.*not scored/);
  await page.reload();
  await page.locator('.pad').first().waitFor();
  assert.equal(await strum.isChecked(), true, 'strum preference must survive reload');
  await page.evaluate(async () => {
    const { StageRenderer } = await import('/src/lib/midi-stage/renderer.ts');
    const draw = StageRenderer.prototype.draw;
    StageRenderer.prototype.draw = function (state) {
      window.liveGraphics = { renderer: this, state };
      return draw.call(this, state);
    };
  });
  // A real Web Audio sine verifies the analysis tap, not mocked FFT samples.
  await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    const audio = new AudioEngine();
    await audio.init();
    const ctx = audio.ctx;
    const tone = ctx.createOscillator();
    const gain = ctx.createGain();
    tone.frequency.value = 90;
    gain.gain.value = 0.08;
    tone.connect(gain);
    gain.connect(audio.buses.backing);
    audio.running = true;
    tone.start();
    const wait = () => new Promise((done) => setTimeout(done, 80));
    try {
      let found = false;
      for (let i = 0; i < 20; i++) {
        await wait();
        const energy = audio.readStageEnergy();
        if (energy.level > 0.1 && energy.bass > 0.01) { found = true; break; }
      }
      if (!found) throw Error('Backing signal does not reach stage lighting analysis');
      audio.setVolume(0);
      await wait();
      if (audio.readStageEnergy().level < 0.1) throw Error('Master volume must not alter the light choreography');
      gain.disconnect(audio.buses.backing);
      gain.connect(audio.buses.monitor);
      await wait(); await wait();
      if (audio.readStageEnergy().level > 0.02) throw Error('Live monitor sound leaked into backing lighting');
      gain.disconnect(audio.buses.monitor);
      gain.connect(audio.buses.backing);
      audio.running = false;
      const paused = audio.readStageEnergy();
      if (paused.level !== 0 || paused.bass !== 0) throw Error('Stopped audio must report no live stage energy');
    } finally {
      tone.stop(); gain.disconnect(); tone.disconnect();
      await ctx.close();
    }
  });
  await page.getByRole('button', { name: 'Watch the house', exact: true }).click();
  await page.getByRole('button', { name: 'Focus stage', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => window.liveGraphics?.state.strumGuide === true);
  await page.waitForFunction(() => document.querySelector('[aria-label="Next suggested strum"]')?.textContent.includes('NEXT STRUM'));
  await page.evaluate(() => { window.strumJudge = window.liveGraphics.state.judges.get('guitar'); });
  await strum.uncheck();
  await page.waitForFunction(() => window.liveGraphics.state.strumGuide === false);
  await strum.check();
  await page.waitForFunction(() => window.liveGraphics.state.strumGuide === true);
  assert.equal(await page.evaluate(() => window.liveGraphics.state.judges.get('guitar') === window.strumJudge), true,
    'toggling arrows during play must not rebuild the scoring session');
  if (output) await page.screenshot({ path: `${output}/concert-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (output) await page.screenshot({ path: `${output}/concert-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(200);
  const pausedCue = await page.getByLabel('Next suggested strum', { exact: true }).innerText();
  await page.waitForTimeout(200);
  assert.equal(await page.getByLabel('Next suggested strum', { exact: true }).innerText(), pausedCue,
    'next strum must not advance while paused');

  // Fixed song positions make dense chords, rhythm notes and hit effects
  // reviewable without replacing the renderer, its Judge, or real Canvas APIs.
  await page.evaluate(async () => {
    const { StageRenderer, spawnHitJuice } = await import('/src/lib/midi-stage/renderer.ts');
    const { makeOpenStage } = await import('/src/lib/midi-stage/songs.ts');
    const { defaultPlayers, makeChart, Judge } = await import('/src/lib/midi-stage/engine.ts');
    const { withPreset } = await import('/src/lib/midi-stage/feel.ts');
    const canvas = document.createElement('canvas');
    canvas.id = 'graphics-acceptance';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:9999';
    document.body.append(canvas);
    const renderer = new StageRenderer(canvas);
    const baseline = globalThis.__graphicsBaselineModule
      ? new (await import(globalThis.__graphicsBaselineModule)).StageRenderer(canvas) : null;
    window.renderGraphics = (width, height, mode, reduced = false) => {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      renderer.resize();
      const song = makeOpenStage('expert');
      if (mode === 'rhythm' || mode === 'strum-rhythm') song.matching = 'rhythm';
      const players = defaultPlayers().map((p) => ({ ...p, enabled: mode === 'band' || p.id === (mode === 'strum-guitar' ? 'guitar' : 'keys') }));
      const judges = new Map(players.filter((p) => p.enabled).map((p) => [p.id,
        new Judge(makeChart(song, p), { speed: 1, difficulty: 'standard', drums: p.type === 'drums', onJudge() {} })]));
      const state = { song, players, judges, status: 'playing', demo: false,
        speed: 1, t: 21.8, now: 10, energy: 0.72, trauma: 0, bloom: 0, combo: 12,
        particles: [], flashes: [], callouts: [], pressed: new Map(), reduced,
        feel: withPreset(mode === 'calm' ? 'calm' : 'house'), strumGuide: mode.startsWith('strum-') };
      renderer.draw(state);
      if (mode === 'chords' && !reduced) {
        const original = canvas.toDataURL();
        renderer.draw({ ...state, now: 1234 });
        if (canvas.toDataURL() !== original) throw Error('Stage choreography drifted away from the song clock');
        renderer.draw({ ...state, music: { level: 1, bass: 1 } });
        if (canvas.toDataURL() === original) throw Error('Backing audio energy did not affect lighting');
        renderer.draw(state);
      }
      for (const p of players.filter((p) => p.enabled)) {
        const g = renderer.geom.get(p.id);
        for (let lane = 0; lane < g.n; lane++) {
          const point = g.point(lane + 0.5, 1);
          const target = renderer.hitTest(point.x, point.y);
          if (target?.player.id !== p.id || target?.lane !== lane) throw Error('Visual target no longer matches lane hit testing');
        }
      }
      // Hit feedback uses the real spawn path and stays anchored after resize.
      const g = renderer.geom.get(mode === 'strum-guitar' ? 'guitar' : 'keys');
      const point = g.point(0.5, 1);
      if (mode === 'hit') {
        spawnHitJuice(state.particles, 'perfect', point.x, point.y, '#8fd4c4', reduced, 'keys', 0, 100);
        state.particles.forEach((p) => { p.life = p.max * 0.18; });
        state.flashes.push({ player: 'keys', lane: 0, until: 10.2, kind: 'hit' });
      }
      if (mode === 'hit') {
        state.callouts.push(
          { player: 'keys', grade: 'great', text: 'great', delta: 18, until: 10.5 },
          { player: 'keys', grade: 'perfect', text: 'perfect', delta: 0, until: 10.7 },
          { player: 'keys', grade: 'perfect', text: '25 STREAK', delta: 0, until: 10.9 });
        const labels = [];
        const text = renderer.ctx.fillText;
        renderer.ctx.fillText = function (label, ...args) { labels.push(label); return text.call(this, label, ...args); };
        try { renderer.draw(state); } finally { renderer.ctx.fillText = text; }
        if (labels.filter((label) => label === 'PERFECT').length !== 1 || labels.includes('GREAT') || !labels.includes('25 STREAK')) {
          throw Error('Chord judgments overlap or hide the streak milestone');
        }
      }
      const club = renderer.clubArt;
      renderer.resize();
      if (renderer.clubArt !== club) throw Error('Unchanged viewport rebuilt scenery cache');
      if (state.strumGuide && ![...renderer.noteArt.keys()].some((key) => key.endsWith(':down'))) {
        throw Error('Strum-enabled chart must draw arrow note materials');
      }
      const timings = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        renderer.draw(state);
        // Force raster completion; this is software-browser profiling, not a
        // hardware FPS claim. It includes more than JS command submission.
        renderer.ctx.getImageData(0, 0, 1, 1);
        if (i > 1) timings.push(performance.now() - start);
      }
      timings.sort((a, b) => a - b);
      if (reduced) {
        const before = canvas.toDataURL();
        renderer.draw({ ...state, now: 123 });
        if (canvas.toDataURL() !== before) throw Error('Ambient motion continues under reduced motion');
      }
      const pixels = renderer.ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 140) lit++;
      if (lit < width * height * 0.005) throw Error('Blank or unreadably dark canvas');
      let previousMedianMs = null;
      if (baseline) {
        baseline.resize();
        const old = [];
        for (let i = 0; i < 10; i++) {
          const start = performance.now();
          baseline.draw(state);
          baseline.ctx.getImageData(0, 0, 1, 1);
          if (i > 1) old.push(performance.now() - start);
        }
        old.sort((a, b) => a - b);
        previousMedianMs = old[4];
        renderer.draw(state);
      }
      return { width, height, mode, reduced, medianMs: timings[4], p95Ms: timings[7], previousMedianMs };
    };
  });
  const results = [];
  for (const [width, height] of [[1100, 600], [366, 500]]) {
    await page.setViewportSize({ width: Math.max(390, width), height: Math.max(844, height) });
    for (const mode of ['chords', 'rhythm', 'band', 'hit', 'calm', 'strum-guitar', 'strum-rhythm']) {
      results.push(await page.evaluate(([w, h, m]) => window.renderGraphics(w, h, m), [width, height, mode]));
      if (output) {
        // Export the fixed fixture canvas itself; it is independent of the
        // live page's scrolling/focus animations and needs no stability wait.
        const png = await page.locator('#graphics-acceptance').evaluate((canvas) => canvas.toDataURL('image/png'));
        await writeFile(`${output}/${mode}-${width}.png`, Buffer.from(png.split(',')[1], 'base64'));
      }
    }
    results.push(await page.evaluate(([w, h]) => window.renderGraphics(w, h, 'chords', true), [width, height]));
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  await browser.close();
}
