import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';
import { openInteraction } from './helpers.ts';

/**
 * Line decimation (plan E16.2) on `_dev/decimation-compare`: 300,000 points (x = 0 … 299,999)
 * with two gaps in one line, drawn through the min/max level of detail. Each check screenshots the
 * chart decimated, redraws it with every vertex (`line.simplify: false`) and compares where the
 * line is drawn: decimation must be invisible, at the full view, zoomed in, and after streaming
 * points in.
 */
const EXAMPLE = '_dev/decimation-compare';

interface Hook {
  chart: {
    restyle(update: Record<string, unknown>, indices?: number[]): Promise<unknown>;
    relayout(update: Record<string, unknown>): Promise<unknown>;
    extendTraces(
      update: Record<string, unknown>,
      indices: number[],
      maxPoints?: number,
    ): Promise<unknown>;
    getTraceObjects(i: number): { geometry?: { instanceCount?: number } }[];
  };
}

/** Line segments (instances) the trace draws. */
async function segments(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { chart } = (window as unknown as { __interaction: Hook }).__interaction;
    return chart
      .getTraceObjects(0)
      .reduce(
        (n, o) => n + (Number.isFinite(o.geometry?.instanceCount) ? o.geometry!.instanceCount! : 0),
        0,
      );
  });
}

async function simplify(page: Page, on: boolean): Promise<void> {
  await page.evaluate(async (value) => {
    const { chart } = (window as unknown as { __interaction: Hook }).__interaction;
    await chart.restyle({ 'line.simplify': value });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, on);
}

async function shot(page: Page): Promise<PNG> {
  const box = await page.locator('canvas').first().boundingBox();
  return PNG.sync.read(await page.screenshot({ clip: box! }));
}

/** Pixels of the line (blue #2a6fdb; the grid and text are gray). */
function ink(png: PNG): Uint8Array {
  const out = new Uint8Array(png.width * png.height);
  for (let i = 0; i < out.length; i++) {
    out[i] = png.data[4 * i + 2]! - png.data[4 * i]! > 60 ? 1 : 0;
  }
  return out;
}

/** Fraction of `a`'s ink with no ink of `b` within one pixel. */
function uncovered(a: Uint8Array, b: Uint8Array, width: number): number {
  const height = a.length / width;
  let total = 0;
  let missing = 0;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (!a[py * width + px]) continue;
      total++;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1 && !near; dx++) {
          const qx = px + dx;
          const qy = py + dy;
          near = qx >= 0 && qy >= 0 && qx < width && qy < height && b[qy * width + qx] === 1;
        }
      }
      if (!near) missing++;
    }
  }
  return total > 0 ? missing / total : 0;
}

/**
 * Screenshot the line decimated, then with every vertex. Hundreds of overlapping segments per
 * pixel column make the full line's anti-aliased edges denser (a slightly bolder line), so pixels
 * are compared by coverage: the line drawn in one must be within a pixel of the other's, up to a
 * few isolated anti-aliasing pixels (a line with holes, as when decimation columns are not whole
 * pixels, misses 1–4 % of its pixels).
 */
async function compare(
  page: Page,
): Promise<{ missing: number; extra: number; decimated: number; full: number }> {
  await simplify(page, true);
  const a = await shot(page);
  const decimated = await segments(page);
  await simplify(page, false);
  const b = await shot(page);
  const full = await segments(page);
  await simplify(page, true);
  const inkA = ink(a);
  const inkB = ink(b);
  if (process.env['DECIMATION_DUMP']) {
    const dir = process.env['DECIMATION_DUMP'];
    const k = `${Date.now()}`;
    writeFileSync(`${dir}/${k}-a.png`, PNG.sync.write(a));
    writeFileSync(`${dir}/${k}-b.png`, PNG.sync.write(b));
  }
  return {
    missing: uncovered(inkB, inkA, a.width),
    extra: uncovered(inkA, inkB, a.width),
    decimated,
    full,
  };
}

test.beforeEach(async ({ page }) => {
  // Drawing 300k segments with software GL is slow.
  test.setTimeout(240_000);
  await openInteraction(page, EXAMPLE);
  await page.mouse.move(1200, 780);
});

test('a decimated line looks like the full line, at a fraction of the segments', async ({
  page,
}) => {
  const whole = await compare(page);
  expect(whole.full).toBeGreaterThan(290_000);
  expect(whole.decimated).toBeLessThan(whole.full / 20);
  expect(whole.missing).toBeLessThan(0.008);
  expect(whole.extra).toBeLessThan(0.008);

  // Zoomed in to 10 % of the data: only the view and its margins are drawn, still identical.
  await page.evaluate(async () => {
    const { chart } = (window as unknown as { __interaction: Hook }).__interaction;
    await chart.relayout({ 'xaxis.range': [150_000, 180_000], 'yaxis.autorange': true });
  });
  const zoomed = await compare(page);
  expect(zoomed.decimated).toBeLessThan(whole.decimated * 4);
  expect(zoomed.missing).toBeLessThan(0.008);
  expect(zoomed.extra).toBeLessThan(0.008);
});

test('streaming points in keeps the decimated line identical to the full one', async ({ page }) => {
  await page.evaluate(async () => {
    const { chart } = (window as unknown as { __interaction: Hook }).__interaction;
    for (let k = 0; k < 3; k++) {
      const n = 20_000;
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        x[i] = 300_000 + k * n + i;
        y[i] = 400 * Math.sin((k * n + i) / 3000) + ((i * 7919) % 101) - 50;
      }
      await chart.extendTraces({ x: [x], y: [y] }, [0], 300_000);
    }
    await chart.relayout({ 'xaxis.autorange': true, 'yaxis.autorange': true });
  });
  const streamed = await compare(page);
  expect(streamed.decimated).toBeLessThan(streamed.full / 20);
  expect(streamed.missing).toBeLessThan(0.008);
  expect(streamed.extra).toBeLessThan(0.008);
});
