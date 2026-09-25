#!/usr/bin/env node
// Refresh the docs-facing concert screenshots with current visuals.
// Writes screenshots/concert-graphics.jpg and screenshots/concert-lighting.jpg.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'screenshots');
await mkdir(outDir, { recursive: true });

const url = process.argv[2] || 'http://127.0.0.1:8082';
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByRole('button', { name: /Start set/, exact: false }).first().click();
  await page.locator('.pad').first().waitFor({ timeout: 30000 });
  await page.evaluate(async () => {
    const { StageRenderer } = await import('/src/lib/midi-stage/renderer.ts');
    const draw = StageRenderer.prototype.draw;
    StageRenderer.prototype.draw = function (state) {
      window.liveGraphics = { renderer: this, state };
      return draw.call(this, state);
    };
  });
  await page.getByRole('button', { name: 'Focus stage', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => window.liveGraphics?.state.status === 'playing', null, { timeout: 20000 });

  // Graphics shot: steady stage with rim-lit band + top-center chord label.
  await page.screenshot({ path: join(outDir, 'concert-graphics.jpg'), quality: 90 });

  // Lighting shot: wait for a beat-energy peak so the rig reads.
  await page.waitForFunction(() => {
    const s = window.liveGraphics?.state;
    const e = s?.energy;
    const level = typeof e === 'number' ? e : e?.level;
    return (level ?? 0) > 0.3;
  }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(outDir, 'concert-lighting.jpg'), quality: 90 });

  console.log('page errors:', errors.length ? errors : 'none');
} finally {
  await browser.close();
}
