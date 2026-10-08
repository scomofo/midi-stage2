#!/usr/bin/env node
// Actual Canvas2D rendering across chart types, sizes and accessibility modes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { checkGraphicsAudio } from './graphics-audio.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8082';
const output = process.env.SESSION_SCREENSHOT_DIR ? resolve(process.env.SESSION_SCREENSHOT_DIR) : null;
if (output) {
  assert.ok(output.startsWith('/workspace/screenshots/'));
  await mkdir(output, { recursive: true });
}
// Exact pixel comparisons need one raster backend for the fixture and its
// cached material canvases. Chromium can otherwise change backends on readback,
// producing one-channel rounding differences even for identical first frames.
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-accelerated-2d-canvas'] });
try {
  const audio = await checkGraphicsAudio(browser, url);
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

  // Drive the real HUD and scoring judge across an unplayed note's late edge.
  // The built-in guitar part contains an upstroke followed by a downstroke.
  await page.getByRole('button', { name: 'Reset set', exact: true }).click();
  await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    window.originalCueSongAt = AudioEngine.prototype.songAt;
    window.cueClock = -1;
    AudioEngine.prototype.songAt = function () { return window.cueClock; };
  });
  await page.getByRole('button', { name: 'Start set', exact: true }).first().click();
  await page.waitForFunction(() => window.liveGraphics.state.status === 'playing' && !window.liveGraphics.state.demo);
  await page.evaluate(async () => {
    const { suggestedStrum } = await import('/src/lib/midi-stage/strum-guide.ts');
    const { KEYS } = await import('/src/lib/midi-stage/engine.ts');
    const { song, judges } = window.liveGraphics.state;
    const judge = judges.get('guitar');
    const index = judge.notes.findIndex((note, i, notes) => notes[i + 1] && notes[i + 1].time > note.time &&
      suggestedStrum(song, note.time) !== suggestedStrum(song, notes[i + 1].time));
    if (index < 0) throw Error('Strum boundary fixture needs consecutive opposite directions');
    const note = judge.notes[index], next = judge.notes[index + 1];
    window.cueBoundary = { judge, note, next, keys: KEYS.guitar,
      current: suggestedStrum(song, note.time).toUpperCase(), following: suggestedStrum(song, next.time).toUpperCase() };
    window.cueClock = note.time + 0.05;
  });
  const assertCue = async (which) => {
    await page.waitForFunction(() => window.liveGraphics.state.t === window.cueClock);
    await page.waitForTimeout(200); // Allow the existing 80 ms HUD cadence to publish.
    const expected = await page.evaluate((key) => window.cueBoundary[key], which);
    assert.match(await page.getByLabel('Next suggested strum', { exact: true }).innerText(), new RegExp(expected));
  };
  await assertCue('current');
  assert.equal(await page.evaluate(() => window.cueBoundary.note.state), 0);
  await page.evaluate(() => { window.cueClock = window.cueBoundary.note.time + window.cueBoundary.judge.windows[2]; });
  await assertCue('current');
  assert.equal(await page.evaluate(() => window.cueBoundary.note.state), 0, 'exact late boundary must remain playable');
  await page.evaluate(() => { window.cueClock += 0.001; });
  await assertCue('following');
  assert.equal(await page.evaluate(() => window.cueBoundary.note.state), 2, 'cue must advance when the judge marks a miss');
  await page.evaluate(() => {
    const { next, keys } = window.cueBoundary;
    window.cueClock = next.time;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: keys[next.lane], bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code: keys[next.lane], bubbles: true }));
    if (next.state !== 1) throw Error('The next cue must still accept real keyboard scoring');
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/lib/midi-stage/audio.ts');
    AudioEngine.prototype.songAt = window.originalCueSongAt;
  });

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
    await renderer.bandAtlas.ready;
    await renderer.drummerRig.ready;
    if (!renderer.drummerRig.image) throw Error("Drummer rig must decode for acceptance");
    if (!renderer.bandAtlas.image) throw Error('Illustrated band atlas must decode for graphics acceptance');
    const atlasImage = renderer.bandAtlas.image;
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = atlasCanvas.height = atlasImage.naturalWidth;
    const atlasContext = atlasCanvas.getContext('2d');
    atlasContext.drawImage(atlasImage, 0, 0);
    const cell = atlasCanvas.width / 2;
    for (const [column, row] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const pixels = atlasContext.getImageData(column * cell, row * cell, cell, cell).data;
      let opaque = 0;
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const alpha = pixels[(y * cell + x) * 4 + 3];
        if (alpha > 128) opaque++;
        if ((x < 4 || y < 4 || x >= cell - 4 || y >= cell - 4) && alpha > 32) {
          throw Error('Band atlas must have transparent margins around every performer');
        }
      }
      if (opaque < cell * cell * 0.05) throw Error('Atlas quadrant has no readable performer');
    }
    const baseline = globalThis.__graphicsBaselineModule
      ? new (await import(globalThis.__graphicsBaselineModule)).StageRenderer(canvas) : null;
    window.drummerDetails = () => {
      const detail = document.createElement('canvas');
      detail.width = detail.height = 520;
      const closeup = new StageRenderer(detail, renderer.bandAtlas, renderer.drummerRig);
      closeup.w = 1100;
      closeup.h = 600;
      const song = makeOpenStage('expert');
      const players = defaultPlayers().map((p) => ({ ...p, enabled: p.id === 'drums' }));
      const drums = players.find((p) => p.id === 'drums');
      const judge = new Judge(makeChart(song, drums), { speed: 1, difficulty: 'standard', drums: true, onJudge() {} });
      const state = { song, players, judges: new Map([['drums', judge]]), status: 'playing', demo: false,
        speed: 1, t: 0, now: 10, energy: 0.72, trauma: 0, bloom: 0, combo: 0,
        particles: [], flashes: [], callouts: [], pressed: new Map(), reduced: false, feel: withPreset('house') };
      const paint = () => {
        closeup.ctx.setTransform(1, 0, 0, 1, 0, 0);
        closeup.ctx.clearRect(0, 0, 520, 520);
        closeup.ctx.setTransform(4, 0, 0, 4, -(1100 * 0.45 - 52) * 4 + 52, -600 * 0.065 * 4 + 40);
        closeup.paintBand(state);
        return detail.toDataURL('image/png');
      };
      const captures = {};
      for (const [name, lane] of [['snare', 1], ['cymbal', 2]]) {
        const attack = judge.notes.find((note) => note.lane === lane);
        if (!attack) throw Error('Drummer closeup needs snare and cymbal attacks');
        state.t = attack.time - 0.001;
        captures[`${name}-raised`] = paint();
        state.t = attack.time + 0.11;
        captures[`${name}-strike`] = paint();
        if (captures[`${name}-raised`] === captures[`${name}-strike`]) throw Error(`${name} stroke must be visible`);
        state.status = 'paused';
        const paused = paint();
        state.now += 100;
        if (paint() !== paused) throw Error('Drummer pause must ignore advancing wall time');
        state.status = 'playing';
      }
      for (const mode of ['reduced', 'calm', 'disabled']) {
        state.reduced = mode === 'reduced';
        state.feel = withPreset(mode === 'calm' ? 'calm' : 'house');
        drums.enabled = mode !== 'disabled';
        const still = paint();
        state.t += 0.11;
        state.now += 100;
        if (paint() !== still) throw Error(`${mode} drummer must remain still`);
      }
      return captures;
    };
    window.renderGraphics = (width, height, mode, reduced = false) => {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      renderer.resize();
      const song = makeOpenStage('expert');
      if (mode === 'rhythm' || mode === 'strum-rhythm') song.matching = 'rhythm';
      const players = defaultPlayers().map((p) => ({ ...p, enabled: mode.startsWith('drummer-') || mode === 'band' || mode === 'miss-band' || mode === 'strum-band' || p.id === (mode === 'strum-guitar' ? 'guitar' : 'keys') }));
      const judges = new Map(players.filter((p) => p.enabled).map((p) => [p.id,
        new Judge(makeChart(song, p), { speed: 1, difficulty: 'standard', drums: p.type === 'drums', onJudge() {} })]));
      const state = { song, players, judges, status: 'playing', demo: false,
        speed: 1, t: 21.8, now: 10, energy: 0.72, trauma: 0, bloom: 0, combo: 12,
        particles: [], flashes: [], callouts: [], pressed: new Map(), reduced,
        feel: withPreset(mode === 'calm' ? 'calm' : 'house'), strumGuide: mode.startsWith('strum-') };
      if (mode.startsWith('drummer-')) {
        const attack = judges.get('drums').notes.find((note) => mode === 'drummer-snare' ? note.lane === 1 : note.lane === 2);
        if (!attack) throw Error('Drummer fixture needs a hand-played attack');
        state.t = mode === 'drummer-rest' ? attack.time - 0.001 : attack.time + 0.11;
      }
      if (mode === 'band') {
        const bank = { image: null, ready: Promise.resolve() };
        const delayed = new StageRenderer(canvas, bank, { image: null, ready: Promise.resolve() });
        delayed.resize();
        const calls = [];
        const originalDrawImage = delayed.ctx.drawImage;
        delayed.ctx.drawImage = function (art, ...args) {
          calls.push({ atlas: art === atlasImage, args });
          return originalDrawImage.call(this, art, ...args);
        };
        try {
          delayed.paintBand(state);
          if (calls.length !== 4 || calls.some((call) => call.atlas)) throw Error('Pending artwork must draw all four fallback performers');
          calls.length = 0;
          bank.image = atlasImage;
          delayed.paintBand(state);
          if (calls.length !== 4 || calls.some((call) => !call.atlas || call.args.length !== 8)) throw Error('Decoded artwork must replace cached fallback on the next frame');
          const sources = calls.map((call) => call.args.slice(0, 4));
          if (JSON.stringify(sources) !== JSON.stringify([[0, 0, cell, cell], [cell, 0, cell, cell], [0, cell, cell, cell], [cell, cell, cell, cell]])) throw Error('Performer crop order is incorrect');
        } finally {
          delayed.ctx.drawImage = originalDrawImage;
        }
      }
      if (mode === 'sustain') {
        const judge = judges.get('keys');
        const note = judge.notes.find((note) => note.duration >= 1);
        if (!note) throw Error('Sustain fixture needs a long note');
        judge.hit(note.time, note.lane, 'graphics-hold');
        // Advance beyond the candidate look-behind to exercise the separate
        // active-hold path while the sustain is still sounding.
        state.t = note.time + 0.7;
        if (!judge.activeHolds.has(note)) throw Error('Sustain fixture must use a real held note');
      }
      renderer.draw(state);
      if (width === 366 && (mode === 'band' || mode === 'strum-band')) {
        const drawImage = renderer.ctx.drawImage;
        let compactNotes = 0;
        renderer.ctx.drawImage = function (art, ...args) {
          if ([...renderer.noteArt.values()].includes(art) && args[2] < 24) {
            compactNotes++;
            if (args[3] > Math.max(9, args[2] * 1.1)) throw Error('Compact note heads must not stretch into tall columns');
          }
          return drawImage.call(this, art, ...args);
        };
        try { renderer.draw(state); } finally { renderer.ctx.drawImage = drawImage; }
        if (!compactNotes) throw Error('Compact band fixture must draw note heads');
      }
      if (reduced && mode === 'chords') {
        // Changes in hit brightness may remain; stage geometry must stay still.
        for (const method of ['paintCrowd', 'paintSpots']) {
          const commands = ['arc', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'translate', 'rotate', 'scale'];
          const originals = Object.fromEntries(commands.map((key) => [key, renderer.ctx[key]]));
          let trace = [];
          for (const key of commands) renderer.ctx[key] = function (...args) {
            trace.push([key, ...args]);
            return originals[key].apply(this, args);
          };
          try {
            renderer[method]({ ...state, bloom: 0 });
            const idle = JSON.stringify(trace);
            trace = [];
            renderer[method]({ ...state, bloom: 1 });
            if (JSON.stringify(trace) !== idle) throw Error(`${method} moves with hit bloom under reduced motion`);
          } finally {
            for (const key of commands) renderer.ctx[key] = originals[key];
          }
        }
        renderer.draw(state);
      }
      if (mode === 'miss-band') {
        const before = renderer.ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        state.flashes.push({ player: 'keys', lane: 0, until: 10.3, kind: 'press' });
        state.flashes.push({ player: 'keys', lane: 0, until: 10.3, kind: 'miss' });
        state.callouts.push({ player: 'keys', grade: 'miss', text: 'miss', delta: 0, until: 10.7 });
        renderer.draw(state);
        const after = renderer.ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let changed = 0;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (before[i] === after[i] && before[i + 1] === after[i + 1] && before[i + 2] === after[i + 2]) continue;
          changed++;
          if (y < canvas.height * 0.7 || x < canvas.width * 0.25 - 2 || x > canvas.width * 0.5 + 2) {
            throw Error('One player miss must not tint the incoming notes or another player highway');
          }
        }
        if (!changed) throw Error('A miss needs visible local feedback');
      }
      if (mode === 'chords' && !reduced) {
        const original = canvas.toDataURL();
        renderer.draw({ ...state, now: 1234 });
        if (canvas.toDataURL() !== original) throw Error('Stage choreography drifted away from the song clock');
        renderer.draw({ ...state, music: { level: 1, bass: 1 } });
        if (canvas.toDataURL() === original) throw Error('Backing audio energy did not affect lighting');
        renderer.draw(state);
        // Keep command-order inspection after the native pixel comparisons.
        const events = [];
        let path = [];
        const ctx = renderer.ctx;
        const originals = Object.fromEntries(['beginPath', 'moveTo', 'lineTo', 'stroke', 'drawImage'].map((key) => [key, ctx[key]]));
        ctx.beginPath = function () { path = []; return originals.beginPath.call(this); };
        for (const key of ['moveTo', 'lineTo']) ctx[key] = function (x, y) {
          path.push([x, y]);
          return originals[key].call(this, x, y);
        };
        ctx.stroke = function (...args) {
          if (String(this.strokeStyle).replace(/\s/g, '') === 'rgba(239,232,220,0.55)' &&
              path.length > 1 && path.every((point) => point[1] === path[0][1])) events.push('bridge');
          return originals.stroke.apply(this, args);
        };
        ctx.drawImage = function (art, ...args) {
          if ([...renderer.noteArt.values()].includes(art)) events.push('head');
          return originals.drawImage.call(this, art, ...args);
        };
        try { renderer.draw(state); } finally {
          for (const [key, value] of Object.entries(originals)) ctx[key] = value;
        }
        if (!events.includes('bridge') || !events.includes('head') || events.lastIndexOf('bridge') > events.indexOf('head')) {
          throw Error('Chord bridges must draw behind every note face');
        }
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
        const gradePositions = [];
        const text = renderer.ctx.fillText;
        renderer.ctx.fillText = function (label, ...args) {
          labels.push(label);
          if (label === 'PERFECT') {
            const point = this.getTransform().transformPoint({ x: args[0], y: args[1] });
            gradePositions.push(point.y / renderer.dpr);
          }
          return text.call(this, label, ...args);
        };
        try { renderer.draw(state); } finally { renderer.ctx.fillText = text; }
        if (labels.filter((label) => label === 'PERFECT').length !== 1 || labels.includes('GREAT') || !labels.includes('25 STREAK')) {
          throw Error('Chord judgments overlap or hide the streak milestone');
        }
        if (gradePositions.some((y) => y <= g.hit + 24 || y >= height - 20)) {
          throw Error('Hit feedback must stay below the note path and above the footer');
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
      if (reduced && mode !== 'miss-band') {
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
  const details = await page.evaluate(() => window.drummerDetails());
  if (output) for (const [name, png] of Object.entries(details)) {
    await writeFile(`${output}/drummer-detail-${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
  }
  const results = [];
  for (const [width, height] of [[1100, 600], [366, 420]]) {
    await page.setViewportSize({ width: Math.max(390, width), height: Math.max(844, height) });
    for (const mode of ['drummer-rest', 'drummer-strike', 'drummer-snare', 'chords', 'rhythm', 'band', 'miss-band', 'hit', 'sustain', 'calm', 'strum-guitar', 'strum-rhythm', 'strum-band']) {
      results.push(await page.evaluate(([w, h, m]) => window.renderGraphics(w, h, m), [width, height, mode]));
      if (output) {
        // Export the fixed fixture canvas itself; it is independent of the
        // live page's scrolling/focus animations and needs no stability wait.
        const png = await page.locator('#graphics-acceptance').evaluate((canvas) => canvas.toDataURL('image/png'));
        await writeFile(`${output}/${mode}-${width}.png`, Buffer.from(png.split(',')[1], 'base64'));
      }
    }
    results.push(await page.evaluate(([w, h]) => window.renderGraphics(w, h, 'chords', true), [width, height]));
    results.push(await page.evaluate(([w, h]) => window.renderGraphics(w, h, 'sustain', true), [width, height]));
    results.push(await page.evaluate(([w, h]) => window.renderGraphics(w, h, 'miss-band', true), [width, height]));
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, audio, results }, null, 2));
} finally {
  await browser.close();
}
