import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { events, openInteraction, waitForEvent } from './helpers.ts';

const { PNG } = pngjs;

/**
 * Legend groups on `_dev/interaction-legendgroup` (plan E5.2, plotly.js `legend/handle_click.js`):
 * a click toggles every trace of the item's `legendgroup`, including the `showlegend: false`
 * projection that has no item of its own; a double-click isolates the group, and a second one
 * brings everything back.
 *
 * Traces: 0 "fit" (red, group `fit`), 1 projection (group `fit`, no legend item), 2 "other"
 * (blue). The legend has no DOM, so items are found by their glyph colors outside the plot.
 */
const EXAMPLE = '_dev/interaction-legendgroup';

type RGB = readonly [number, number, number];
const RED: RGB = [0xea, 0x2a, 0x37];
const BLUE: RGB = [0x5e, 0x74, 0xd5];

interface Pt {
  x: number;
  y: number;
}

/**
 * Center of the pixels of color `rgb` outside the plot area: that trace's legend glyph (the
 * traces inside the plot area share the colors).
 */
async function legendGlyph(page: Page, rgb: RGB): Promise<Pt> {
  const box = await page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: {
          chart: {
            three: { root: { canvas: HTMLCanvasElement } };
            subplots: Map<
              string,
              { rect: { x: number; y: number; width: number; height: number } }
            >;
          };
        };
      }
    ).__interaction;
    const r = hook.chart.three.root.canvas.getBoundingClientRect();
    const rect = hook.chart.subplots.get('xy')?.rect;
    if (!rect) throw new Error('no xy subplot');
    return { left: r.left, top: r.top, width: r.width, height: r.height, plot: rect };
  });
  const clip = {
    x: Math.ceil(box.left),
    y: Math.ceil(box.top),
    width: Math.floor(box.width),
    height: Math.floor(box.height),
  };
  const png = PNG.sync.read(await page.screenshot({ clip }));
  const p = box.plot;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (x >= p.x - 2 && x <= p.x + p.width + 2 && y >= p.y - 2 && y <= p.y + p.height + 2) {
        continue;
      }
      const i = (y * png.width + x) * 4;
      if (rgb.every((c, k) => Math.abs((png.data[i + k] ?? -1) - c) <= 8)) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n < 9) throw new Error(`no legend glyph of color rgb(${rgb.join(', ')}) found`);
  return { x: clip.x + sx / n, y: clip.y + sy / n };
}

/** `visible` of every trace (input data, `true` when unset). */
async function visibility(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as { __interaction: { chart: { data: { visible?: unknown }[] } } }
    ).__interaction;
    return hook.chart.data.map((t) => t.visible ?? true);
  });
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
  await page.mouse.move(2, 2);
});

test('a click toggles the whole legendgroup, showlegend:false members included', async ({
  page,
}) => {
  const fit = await legendGlyph(page, RED);
  await events(page, true);
  await page.mouse.click(fit.x, fit.y);
  const restyle = await waitForEvent(page, 'restyle');
  expect(restyle.payload).toEqual({
    update: { visible: ['legendonly', 'legendonly'] },
    traces: [0, 1],
  });
  expect(await visibility(page)).toEqual(['legendonly', 'legendonly', true]);

  await events(page, true);
  await page.mouse.click(fit.x, fit.y);
  await waitForEvent(page, 'restyle');
  expect(await visibility(page)).toEqual([true, true, true]);
});

test('a double-click isolates the item with its group; a second one restores all', async ({
  page,
}) => {
  const other = await legendGlyph(page, BLUE);
  await events(page, true);
  await page.mouse.dblclick(other.x, other.y);
  await waitForEvent(page, 'restyle');
  expect(await visibility(page)).toEqual(['legendonly', 'legendonly', true]);
  // Only the double-click acted (no single click toggled the item first).
  expect((await events(page)).map((e) => e.name)).toEqual(['legenddoubleclick', 'restyle']);

  await events(page, true);
  await page.mouse.dblclick(other.x, other.y);
  await waitForEvent(page, 'restyle');
  expect(await visibility(page)).toEqual([true, true, true]);
});
