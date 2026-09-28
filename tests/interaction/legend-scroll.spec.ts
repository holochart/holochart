import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { events, openInteraction, ranges, touchGesture, waitForEvent } from './helpers.ts';

const { PNG } = pngjs;

/**
 * Multiple legends and scrolling legends (plan E5.2) on `_dev/interaction-legend-scroll`: clicks in
 * each legend act on its own traces (isolation stays within the legend), and the second legend's
 * 20 items scroll inside `maxheight: 120` px by wheel (never zooming the plot, although
 * `scrollZoom` is on), scrollbar drag, finger drag and keyboard focus; items are hit where they are
 * drawn after scrolling, and the scroll position survives the redraw a click causes.
 *
 * Traces: 0–2 "A", "B", "C" in `legend`; 3–22 "s01"… "s20" in `legend2` (title "Sensors"). Items
 * are found through the legends' keyboard toolbars, whose buttons sit over the drawn items (items
 * scrolled out of the box wait at its edge).
 */
const EXAMPLE = '_dev/interaction-legend-scroll';
const FIRST = 'Legend';
const SECOND = 'Legend 2: Sensors';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The page box of an item's key target (where the item is drawn). */
async function item(page: Page, legend: string, name: string): Promise<Box> {
  const button = page
    .getByRole('toolbar', { name: legend, exact: true })
    .getByRole('button', { name, exact: true });
  await expect(button).toHaveCount(1);
  const box = await button.boundingBox();
  if (!box) throw new Error(`no box for legend item ${name}`);
  return box;
}

const center = (b: Box) => ({ x: b.x + 20, y: b.y + b.height / 2 });

/** `visible` of every trace (input data, `true` when unset). */
async function visibility(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as { __interaction: { chart: { data: { visible?: unknown }[] } } }
    ).__interaction;
    return hook.chart.data.map((t) => t.visible ?? true);
  });
}

/** Center of the scrollbar (`#808BA4` pixels), page px. */
async function scrollbar(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
      }
    ).__interaction;
    const r = hook.chart.three.root.canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const clip = {
    x: Math.ceil(box.left),
    y: Math.ceil(box.top),
    width: Math.floor(box.width),
    height: Math.floor(box.height),
  };
  const png = PNG.sync.read(await page.screenshot({ clip }));
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const rgb = [png.data[i], png.data[i + 1], png.data[i + 2]] as number[];
      if ([0x80, 0x8b, 0xa4].every((c, k) => Math.abs((rgb[k] ?? -1) - c) <= 6)) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n < 20) throw new Error('no scrollbar found');
  return { x: clip.x + sx / n, y: clip.y + sy / n };
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
  await page.mouse.move(2, 2);
});

test('clicks act on their own legend: isolating in one leaves the other alone', async ({
  page,
}) => {
  await events(page, true);
  const b = await item(page, FIRST, 'B');
  await page.mouse.click(center(b).x, center(b).y);
  const restyle = await waitForEvent(page, 'restyle');
  expect(restyle.payload).toEqual({ update: { visible: ['legendonly'] }, traces: [1] });

  await events(page, true);
  const s03 = await item(page, SECOND, 's03');
  await page.mouse.dblclick(center(s03).x, center(s03).y);
  await waitForEvent(page, 'restyle');
  const v = await visibility(page);
  // The first legend keeps its state; the second shows s03 only.
  expect(v.slice(0, 3)).toEqual([true, 'legendonly', true]);
  expect(v.slice(3)).toEqual(Array.from({ length: 20 }, (_, i) => (i === 2 ? true : 'legendonly')));

  // Isolating in the first legend leaves the second as it is.
  await events(page, true);
  const a = await item(page, FIRST, 'A');
  await page.mouse.dblclick(center(a).x, center(a).y);
  await waitForEvent(page, 'restyle');
  const w = await visibility(page);
  expect(w.slice(0, 3)).toEqual([true, 'legendonly', 'legendonly']);
  expect(w.slice(3)).toEqual(v.slice(3));
});

test('the wheel scrolls the legend, not the plot; items are hit where they are drawn', async ({
  page,
}) => {
  const before = await ranges(page);
  const s03 = await item(page, SECOND, 's03');
  await events(page, true);
  await page.mouse.move(center(s03).x, center(s03).y);
  await page.mouse.wheel(0, 38);
  // Two rows up: s05 is where s03 was.
  await expect
    .poll(async () => Math.round((await item(page, SECOND, 's05')).y))
    .toBe(Math.round(s03.y));
  expect(await ranges(page)).toEqual(before);
  expect((await events(page)).map((e) => e.name)).not.toContain('relayout');

  // A click where s03 was drawn now toggles s05 (trace 7), and the scroll position survives the
  // redraw.
  await page.mouse.click(center(s03).x, center(s03).y);
  const restyle = await waitForEvent(page, 'restyle');
  expect(restyle.payload).toEqual({ update: { visible: ['legendonly'] }, traces: [7] });
  expect(Math.round((await item(page, SECOND, 's05')).y)).toBe(Math.round(s03.y));
});

test('dragging the scrollbar scrolls the content faster than the bar moves', async ({ page }) => {
  const before = await ranges(page);
  const s02 = await item(page, SECOND, 's02');
  const bar = await scrollbar(page);
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(bar.x, bar.y + 10, { steps: 4 });
  await page.mouse.up();
  // The content moved up by more than the bar moved down (20 items in a 120 px box).
  await expect
    .poll(async () => (await item(page, SECOND, 's06')).y)
    .toBeLessThan(s02.y + 4 * 19 - 10);
  expect(await ranges(page)).toEqual(before);
});

test('keyboard focus scrolls the focused item into view', async ({ page }) => {
  const first = page
    .getByRole('toolbar', { name: SECOND, exact: true })
    .getByRole('button', { name: 's01', exact: true });
  await first.focus();
  await page.keyboard.press('End');
  const last = page
    .getByRole('toolbar', { name: SECOND, exact: true })
    .getByRole('button', { name: 's20', exact: true });
  await expect(last).toBeFocused();
  // Scrolled to the end: s20 is drawn (and hit) where its key target is.
  const s20 = await item(page, SECOND, 's20');
  await events(page, true);
  await page.mouse.click(center(s20).x, center(s20).y);
  const restyle = await waitForEvent(page, 'restyle');
  expect(restyle.payload).toEqual({ update: { visible: ['legendonly'] }, traces: [22] });
  // Home brings s01 back in view (the click moved the focus to the plot).
  await last.focus();
  await page.keyboard.press('Home');
  const s01 = await item(page, SECOND, 's01');
  await expect.poll(async () => (await item(page, SECOND, 's02')).y).toBeGreaterThan(s01.y);
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('a finger dragged over the items scrolls them along, without toggling', async ({ page }) => {
    const before = await ranges(page);
    const s04 = await item(page, SECOND, 's04');
    const from = center(s04);
    await events(page, true);
    await touchGesture(page, [[from, { x: from.x, y: from.y - 38 }]]);
    await expect
      .poll(async () => Math.round((await item(page, SECOND, 's06')).y))
      .toBe(Math.round(s04.y));
    expect(await ranges(page)).toEqual(before);
    expect((await events(page)).map((e) => e.name)).toEqual([]);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
