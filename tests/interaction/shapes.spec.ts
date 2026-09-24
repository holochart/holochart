import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { dragBetween, events, openInteraction, ranges, toPage, waitForEvent } from './helpers.ts';

const { PNG } = pngjs;

/**
 * Shape editing on `_dev/shapes-interactive` (plan E5.5): with `edits.shapePosition`, dragging a
 * shape commits one `relayout` with Plotly's attribute strings (`shapes[i].x0`, …): the inside of a
 * rect moves it, its edge resizes it, a line's end moves that end, and a path is translated
 * (rewritten with absolute commands). Drawn positions are checked by sampling the shapes' flat
 * colors.
 *
 * The example: x in [0, 10], y in [0, 100], with shapes
 *   0 rect   x 1–3, y 60–80, red
 *   1 line   (5, 20) → (8, 50), blue, 6 px
 *   2 circle x 6–8, y 70–90, green
 *   3 path   'M 1 10 L 3 10 L 2 30 Z', purple
 */
const EXAMPLE = '_dev/shapes-interactive';

type RGB = readonly [number, number, number];
const RED: RGB = [0xea, 0x2a, 0x37];
const BLUE: RGB = [0x5e, 0x74, 0xd5];
const PURPLE: RGB = [0x99, 0x62, 0xc0];

/** Whether the pixel at a page position has (nearly) the given color. */
async function isColor(page: Page, p: { x: number; y: number }, rgb: RGB): Promise<boolean> {
  const shot = await page.screenshot({
    clip: { x: Math.round(p.x) - 1, y: Math.round(p.y) - 1, width: 3, height: 3 },
  });
  const png = PNG.sync.read(shot);
  const i = (png.width + 1) * 4;
  return rgb.every((c, k) => Math.abs((png.data[i + k] ?? -1) - c) <= 8);
}

async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

/** `chart.layout.shapes[i]` (the input shape, after relayouts). */
async function inputShape(page: Page, i: number): Promise<Record<string, unknown>> {
  return page.evaluate((index) => {
    const hook = (
      window as unknown as { __interaction: { chart: { layout: Record<string, unknown> } } }
    ).__interaction;
    const list = hook.chart.layout['shapes'] as Record<string, unknown>[];
    return JSON.parse(JSON.stringify(list[index])) as Record<string, unknown>;
  }, i);
}

async function count(page: Page, name: string): Promise<number> {
  return (await events(page)).filter((e) => e.name === name).length;
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('dragging inside a rect moves it with one relayout', async ({ page }) => {
  const from = await toPage(page, 2, 70);
  const to = await toPage(page, 4, 50);
  await parkPointer(page);
  expect(await isColor(page, from, RED)).toBe(true);

  await events(page, true);
  await dragBetween(page, from, to);
  const relayout = await waitForEvent(page, 'relayout');
  expect(Object.keys(relayout.payload).sort()).toEqual([
    'shapes[0].x0',
    'shapes[0].x1',
    'shapes[0].y0',
    'shapes[0].y1',
  ]);
  expect(relayout.payload['shapes[0].x0']).toBeCloseTo(3, 1);
  expect(relayout.payload['shapes[0].x1']).toBeCloseTo(5, 1);
  expect(relayout.payload['shapes[0].y0']).toBeCloseTo(40, 0);
  expect(relayout.payload['shapes[0].y1']).toBeCloseTo(60, 0);

  await page.waitForTimeout(300);
  expect(await count(page, 'relayout')).toBe(1);
  expect(await count(page, 'click')).toBe(0);
  // The drag moved the shape, not the view.
  expect(await ranges(page)).toEqual({ x: [0, 10], y: [0, 100] });
  const input = await inputShape(page, 0);
  expect(input['x0']).toBeCloseTo(3, 1);
  expect(input['y1']).toBeCloseTo(60, 0);

  await parkPointer(page);
  await expect.poll(() => isColor(page, to, RED)).toBe(true);
  expect(await isColor(page, from, RED)).toBe(false);
});

test("dragging a rect's right edge resizes it", async ({ page }) => {
  const edge = await toPage(page, 3, 70);
  const to = await toPage(page, 5, 70);
  await events(page, true);
  await dragBetween(page, { x: edge.x - 2, y: edge.y }, { x: to.x - 2, y: to.y });
  const relayout = await waitForEvent(page, 'relayout');
  expect(Object.keys(relayout.payload)).toEqual(['shapes[0].x1']);
  expect(relayout.payload['shapes[0].x1']).toBeCloseTo(5, 1);

  await parkPointer(page);
  // The left part stays, the rect now reaches x = 5.
  await expect.poll(async () => isColor(page, await toPage(page, 4.5, 70), RED)).toBe(true);
  expect(await isColor(page, await toPage(page, 1.5, 70), RED)).toBe(true);
});

test("dragging a line's end moves only that end", async ({ page }) => {
  const end = await toPage(page, 8, 50);
  const to = await toPage(page, 9, 30);
  await events(page, true);
  await dragBetween(page, end, to);
  const relayout = await waitForEvent(page, 'relayout');
  expect(Object.keys(relayout.payload).sort()).toEqual(['shapes[1].x1', 'shapes[1].y1']);
  expect(relayout.payload['shapes[1].x1']).toBeCloseTo(9, 1);
  expect(relayout.payload['shapes[1].y1']).toBeCloseTo(30, 0);
  const input = await inputShape(page, 1);
  expect(input['x0']).toBe(5);
  expect(input['y0']).toBe(20);

  await parkPointer(page);
  // Midpoint of the new line.
  await expect.poll(async () => isColor(page, await toPage(page, 7, 25), BLUE)).toBe(true);
});

test('dragging a path translates it', async ({ page }) => {
  const inside = await toPage(page, 2, 15);
  const to = await toPage(page, 5, 25);
  await parkPointer(page);
  expect(await isColor(page, inside, PURPLE)).toBe(true);
  await events(page, true);
  await dragBetween(page, inside, to);
  const relayout = await waitForEvent(page, 'relayout');
  expect(Object.keys(relayout.payload)).toEqual(['shapes[3].path']);
  const path = String(relayout.payload['shapes[3].path']);
  const nums = (path.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  // M 4,20 L 6,20 L 5,40 Z (within rounding of the pointer position).
  [4, 20, 6, 20, 5, 40].forEach((v, i) => expect(nums[i]).toBeCloseTo(v, 0));
  expect(path.startsWith('M')).toBe(true);
  expect(path.endsWith('Z')).toBe(true);

  await parkPointer(page);
  await expect.poll(async () => isColor(page, await toPage(page, 5, 25), PURPLE)).toBe(true);
  expect(await isColor(page, inside, PURPLE)).toBe(false);
});

test('dragging outside every shape still zooms, and shapes follow the zoom', async ({ page }) => {
  const from = await toPage(page, 0.5, 95);
  const to = await toPage(page, 4.5, 45);
  await events(page, true);
  await dragBetween(page, from, to);
  const relayout = await waitForEvent(page, 'relayout');
  expect(Object.keys(relayout.payload).some((k) => k.startsWith('xaxis.range'))).toBe(true);
  expect(Object.keys(relayout.payload).some((k) => k.startsWith('shapes'))).toBe(false);
  const r = await ranges(page);
  expect(r.x[0]).toBeCloseTo(0.5, 0);
  expect(r.x[1]).toBeCloseTo(4.5, 0);

  await parkPointer(page);
  // The rect (x 1–3, y 60–80) is drawn at its data position in the zoomed view.
  await expect.poll(async () => isColor(page, await toPage(page, 2.9, 61), RED)).toBe(true);
  expect(await isColor(page, await toPage(page, 3.1, 61), RED)).toBe(false);
  expect(await isColor(page, await toPage(page, 2.9, 58), RED)).toBe(false);
});
