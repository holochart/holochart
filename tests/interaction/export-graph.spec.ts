/**
 * Raster export of the graph traces (backlog G10, plan E18.1) in a real browser: `chart.toImage`
 * draws a `graph` (markers with arrows, box nodes with cluster frames, a tree), a `chord` and a
 * `graph3d` as the chart on screen shows them. A force layout that is drawn while it settles
 * (`force.simulate`) is exported settled, not as a frame of the animation.
 *
 * Images are compared with a screenshot of the same chart at the same size, as export.spec.ts
 * does. (There is no SVG export yet: backlog S3.4.)
 */
import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';
import { openInteraction } from './helpers.ts';

const { PNG } = pngjs;
type Png = ReturnType<typeof PNG.sync.read>;

interface Hook {
  __interaction: {
    chart: { toImage(o: object): Promise<string> };
    figure(name: string): { data: Record<string, unknown>[]; config?: Record<string, unknown> };
    toImage(figure: object): Promise<string>;
  };
}

function decodePng(url: string): Png {
  expect(url.startsWith('data:image/png;base64,')).toBe(true);
  return PNG.sync.read(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}

/** `chart.toImage()` of the page's chart at its own size. */
async function exported(page: Page): Promise<Png> {
  return decodePng(
    await page.evaluate(() => (window as unknown as Hook).__interaction.chart.toImage({})),
  );
}

/** A screenshot of the chart's canvas, with the pointer out of the way. */
async function screenshot(page: Page): Promise<Png> {
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width + 150, box.y + box.height + 150);
  return PNG.sync.read(await page.screenshot({ clip: box }));
}

/** The share of pixels that differ between two images of one size. */
function difference(a: Png, b: Png): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  return (
    pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.1 }) /
    (a.width * a.height)
  );
}

/** The share of pixels that are not the color of the top-left corner (the paper). */
function inked(image: Png): number {
  const { data } = image;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2]) count++;
  }
  return count / (data.length / 4);
}

/**
 * SDF text and antialiased edges may differ by a pixel between two contexts (export.spec.ts
 * allows 0.2 %); the thin lines of a graph add a little to that.
 */
const SAME = 0.004;

const GRAPHS = [
  ['network', 'markers, arrowheads and labels at given positions'],
  ['layered', 'box nodes, routed links and cluster frames'],
  ['tree', 'a tidy tree'],
] as const;

for (const [name, what] of GRAPHS) {
  test(`graph: the export matches the chart on screen (${what})`, async ({ page }) => {
    await openInteraction(page, '_dev/keyboard-graph', { graph: name });
    const image = await exported(page);
    expect([image.width, image.height]).toEqual([640, 400]);
    expect(inked(image)).toBeGreaterThan(0.005);
    expect(difference(await screenshot(page), image)).toBeLessThan(SAME);
  });
}

/** The `force` figure of the example exported with `change` applied, and the chart's own export. */
async function forceExports(
  page: Page,
  change: { simulate?: boolean; reducedMotion?: boolean },
): Promise<{ live: Png; figure: Png }> {
  const [live, figure] = await page.evaluate(async (c) => {
    const hook = (window as unknown as Hook).__interaction;
    const own = await hook.chart.toImage({});
    const f = hook.figure('force');
    if (c.simulate !== undefined) {
      (f.data[0]!['force'] as Record<string, unknown>)['simulate'] = c.simulate;
    }
    if (c.reducedMotion !== undefined) {
      f.config = { ...f.config, a11y: { reducedMotion: c.reducedMotion } };
    }
    return [own, await hook.toImage(f)];
  }, change);
  return { live: decodePng(live!), figure: decodePng(figure!) };
}

test('graph: a force layout is exported as the chart shows it once it has settled', async ({
  page,
}) => {
  await openInteraction(page, '_dev/keyboard-graph', { graph: 'force' });
  // The figure with `simulate` off is drawn settled.
  const settled = (await forceExports(page, { simulate: false })).figure;
  expect(inked(settled)).toBeGreaterThan(0.005);
  // The chart on screen, which is drawn while it settles, ends there.
  await expect
    .poll(async () => difference(await screenshot(page), settled), { timeout: 15_000 })
    .toBeLessThan(SAME);
  // Without motion a figure with `simulate` on is exported settled too.
  const still = (await forceExports(page, { reducedMotion: true })).figure;
  expect(difference(still, settled)).toBeLessThan(SAME);
});

// The offscreen chart of an export is static (`staticPlot`), and a static chart moves nothing:
// the graph view draws the settled layout at once (`motionAllowed` in
// packages/traces-graph/src/graph/plot.ts), so the image is not an early frame of the animation.
test('graph: a force layout with simulate on is exported settled', async ({ page }) => {
  await openInteraction(page, '_dev/keyboard-graph', { graph: 'force' });
  // Exported at once, while the chart on screen is still settling.
  const { live, figure: settled } = await forceExports(page, { simulate: false });
  expect(difference(live, settled)).toBeLessThan(SAME);
});

test('chord: the export matches the chart on screen', async ({ page }) => {
  await openInteraction(page, '_dev/interaction-chord');
  const image = await exported(page);
  expect([image.width, image.height]).toEqual([480, 480]);
  expect(inked(image)).toBeGreaterThan(0.1);
  expect(difference(await screenshot(page), image)).toBeLessThan(SAME);
});

test('graph3d: the export matches the chart on screen', async ({ page }) => {
  await openInteraction(page, '_dev/interaction-graph3d');
  const image = await exported(page);
  expect([image.width, image.height]).toEqual([640, 400]);
  expect(inked(image)).toBeGreaterThan(0.005);
  expect(difference(await screenshot(page), image)).toBeLessThan(SAME);
});
