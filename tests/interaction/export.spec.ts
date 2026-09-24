/**
 * Raster export (plan E18.1) in a real browser: `chart.toImage` renders the figure offscreen at the
 * requested size and scale — the same pixels as the chart on screen, without the modebar — in PNG,
 * JPEG and WebP, with an alpha channel for `transparent`, without touching the live chart; the
 * modebar camera button downloads with `config.toImageButtonOptions`.
 */
import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';
import { openInteraction } from './helpers.ts';

const { PNG } = pngjs;
const EXAMPLE = '_dev/export-image';
/** Width × height of the example's chart. */
const W = 640;
const H = 400;
/** The default look's paper color, `#0a0a0f`. */
const PAPER = [0x0a, 0x0a, 0x0f] as const;

interface ExportOptions {
  format?: 'png' | 'jpeg' | 'webp';
  width?: number;
  height?: number;
  scale?: number;
  transparent?: boolean;
}

/** `chart.toImage(options)` in the page. */
function toImage(page: Page, options: ExportOptions = {}): Promise<string> {
  return page.evaluate(
    (opts) =>
      (
        window as unknown as {
          __interaction: { chart: { toImage(o: object): Promise<string> } };
        }
      ).__interaction.chart.toImage(opts),
    options,
  );
}

function decodePng(url: string) {
  expect(url.startsWith('data:image/png;base64,')).toBe(true);
  return PNG.sync.read(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}

/** Decode any data URL in the page: its pixel size. */
function imageSize(page: Page, url: string): Promise<{ width: number; height: number }> {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  }, url);
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
  await page.mouse.move(W + 200, H + 200);
});

test('matches a screenshot of the same chart at the same size', async ({ page }) => {
  // The modebar is DOM over the canvas: never in an export, so keep it out of the screenshot too.
  await page.addStyleTag({ content: '.hc-modebar{display:none!important}' });
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).toMatchObject({ width: W, height: H });
  const shot = PNG.sync.read(await page.screenshot({ clip: box! }));
  const image = decodePng(await toImage(page, { width: W, height: H }));
  expect([image.width, image.height]).toEqual([W, H]);
  const diff = pixelmatch(shot.data, image.data, undefined, W, H, { threshold: 0.1 });
  // SDF text and MSAA edges may differ by a pixel between two contexts; everything else is equal.
  expect(diff / (W * H)).toBeLessThan(0.002);
});

test('renders at the requested size and scale, laid out again (not scaled)', async ({ page }) => {
  const big = decodePng(await toImage(page, { scale: 2 }));
  expect([big.width, big.height]).toEqual([2 * W, 2 * H]);
  const small = decodePng(await toImage(page, { width: 320, height: 200, scale: 1.5 }));
  expect([small.width, small.height]).toEqual([480, 300]);
  // The live chart is untouched: same size, one canvas, no leftover offscreen hosts.
  const live = await page.evaluate(() => {
    const hook = (
      window as unknown as { __interaction: { chart: { size: { width: number; height: number } } } }
    ).__interaction;
    return { size: hook.chart.size, canvases: document.querySelectorAll('canvas').length };
  });
  expect(live).toEqual({ size: { width: W, height: H }, canvases: 1 });
});

test('drops the background with transparent', async ({ page }) => {
  const opaque = decodePng(await toImage(page));
  expect([...opaque.data.subarray(0, 4)]).toEqual([...PAPER, 255]);
  const clear = decodePng(await toImage(page, { transparent: true }));
  // The paper and the plot area (most of the image) are fully transparent; traces, text and
  // grid lines are not.
  expect(clear.data[3]).toBe(0);
  let transparent = 0;
  let opaquePixels = 0;
  for (let i = 3; i < clear.data.length; i += 4) {
    if (clear.data[i] === 0) transparent++;
    else if (clear.data[i] === 255) opaquePixels++;
  }
  expect(transparent / (W * H)).toBeGreaterThan(0.5);
  expect(opaquePixels).toBeGreaterThan(1000);
});

test('encodes JPEG and WebP', async ({ page }) => {
  for (const format of ['jpeg', 'webp'] as const) {
    const url = await toImage(page, { format, width: 300, height: 200, scale: 2 });
    expect(url.startsWith(`data:image/${format};base64,`)).toBe(true);
    expect(await imageSize(page, url)).toEqual({ width: 600, height: 400 });
  }
});

test('the modebar camera downloads with toImageButtonOptions', async ({ page }) => {
  const canvas = page.locator('canvas').first();
  await canvas.hover({ position: { x: 20, y: 20 } });
  const downloading = page.waitForEvent('download');
  await page.locator('.hc-modebar [data-button="toImage"]').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('holochart-export.png');
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const png = PNG.sync.read(Buffer.concat(chunks));
  // `scale: 2` from the options; no modebar in the image (it would be drawn top right).
  expect([png.width, png.height]).toEqual([2 * W, 2 * H]);
});
