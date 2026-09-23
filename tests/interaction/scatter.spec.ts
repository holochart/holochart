import { expect, test } from '@playwright/test';
import {
  callChart,
  dragBetween,
  events,
  openInteraction,
  ranges,
  toPage,
  waitForEvent,
} from './helpers.ts';

/**
 * Pointer scenarios on `_dev/interaction-scatter` (plan E20.4, E6.1–E6.4, E5.7): three traces of
 * ten points, trace k at (v, 10·v + 3·k), x in [-1, 10], y in [-10, 100].
 */
const EXAMPLE = '_dev/interaction-scatter';

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('hover shows the hovertemplate label and emits hover with the point', async ({ page }) => {
  const p = await toPage(page, 5, 53);
  await page.mouse.move(p.x + 2, p.y - 1);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toEqual([
    { curveNumber: 1, pointNumber: 5, x: 5, y: 53, customdata: 'p1-5' },
  ]);
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toHaveCount(1);
  await expect(label).toContainText('x=5 y=53.0 p1-5');
  await expect(label.locator('.holochart-hoverlabel-name')).toHaveText('mid');

  // Leaving the points: unhover, label gone.
  const empty = await toPage(page, 5, 90);
  await page.mouse.move(empty.x, empty.y);
  await waitForEvent(page, 'unhover');
  await expect(page.locator('.holochart-hoverlabel').filter({ visible: true })).toHaveCount(0);
});

test("hovermode 'x unified' lists every trace at the hovered x", async ({ page }) => {
  await callChart(page, 'setHovermode', 'x unified');
  const p = await toPage(page, 3, 60);
  await page.mouse.move(p.x, p.y);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points?.map((pt) => pt.curveNumber).sort()).toEqual([0, 1, 2]);
  const box = page.locator('.holochart-hoverlabel-unified');
  await expect(box).toBeVisible();
  await expect(box.locator('.holochart-hoverlabel-row')).toHaveCount(3);
});

test('box zoom sets both ranges with one relayout', async ({ page }) => {
  await events(page, true);
  await dragBetween(page, await toPage(page, 2, 70), await toPage(page, 6, 20));
  const relayout = await waitForEvent(page, 'relayout');
  expect(relayout.payload['xaxis.range[0]']).toBeCloseTo(2, 1);
  expect(relayout.payload['xaxis.range[1]']).toBeCloseTo(6, 1);
  expect(relayout.payload['yaxis.range[0]']).toBeCloseTo(20, 0);
  expect(relayout.payload['yaxis.range[1]']).toBeCloseTo(70, 0);
  const r = await ranges(page);
  expect(r.x[0]).toBeCloseTo(2, 1);
  expect(r.y[1]).toBeCloseTo(70, 0);
});

test('a thin horizontal drag zooms x only', async ({ page }) => {
  const from = await toPage(page, 1, 50);
  const to = await toPage(page, 8, 50);
  await dragBetween(page, from, { x: to.x, y: to.y + 3 });
  await waitForEvent(page, 'relayout');
  const r = await ranges(page);
  expect(r.x[0]).toBeCloseTo(1, 1);
  expect(r.x[1]).toBeCloseTo(8, 1);
  expect(r.y).toEqual([-10, 100]);
});

test('pan emits relayouting during the drag and relayout at the end', async ({ page }) => {
  await callChart(page, 'setDragmode', 'pan');
  await events(page, true);
  const from = await toPage(page, 4, 50);
  const to = await toPage(page, 6, 50);
  await dragBetween(page, from, to, 12);
  const relayout = await waitForEvent(page, 'relayout');
  const all = await events(page);
  expect(all.filter((e) => e.name === 'relayouting').length).toBeGreaterThan(0);
  // Content follows the pointer: x shifts left by 2.
  expect(relayout.payload['xaxis.range[0]']).toBeCloseTo(-3, 1);
  expect(relayout.payload['xaxis.range[1]']).toBeCloseTo(8, 1);
  expect((await ranges(page)).x[0]).toBeCloseTo(-3, 1);
});

test('lasso selects the points inside the outline', async ({ page }) => {
  await callChart(page, 'setDragmode', 'lasso');
  await events(page, true);
  const outline = [
    [1.5, 15],
    [4.5, 15],
    [4.5, 48],
    [1.5, 48],
    [1.5, 16],
  ] as const;
  const first = await toPage(page, outline[0][0], outline[0][1]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const [x, y] of outline.slice(1)) {
    const p = await toPage(page, x, y);
    await page.mouse.move(p.x, p.y, { steps: 6 });
  }
  await page.mouse.up();
  const selected = await waitForEvent(page, 'selected');
  // v = 2, 3, 4 on all three traces.
  expect(selected.payload.points).toHaveLength(9);
  expect(selected.payload['lassoPoints']).toBeDefined();
  expect((await events(page)).some((e) => e.name === 'selecting')).toBe(true);

  // Double-click clears the selection.
  const empty = await toPage(page, 8, 10);
  await page.mouse.dblclick(empty.x, empty.y);
  await waitForEvent(page, 'deselect');
});

test('click emits the clicked point', async ({ page }) => {
  await events(page, true);
  const p = await toPage(page, 7, 76);
  await page.mouse.click(p.x, p.y);
  const click = await waitForEvent(page, 'click');
  expect(click.payload.points).toEqual([
    { curveNumber: 2, pointNumber: 7, x: 7, y: 76, customdata: 'p2-7' },
  ]);
});

test('double-click resets a zoom to the initial ranges', async ({ page }) => {
  await callChart(page, 'relayout', { 'xaxis.range': [2, 3], 'yaxis.range': [0, 10] });
  await events(page, true);
  const p = await toPage(page, 2.5, 5);
  await page.mouse.dblclick(p.x, p.y);
  await waitForEvent(page, 'doubleclick');
  await expect.poll(async () => (await ranges(page)).x).toEqual([-1, 10]);
  expect((await ranges(page)).y).toEqual([-10, 100]);
});

test('scroll zoom zooms around the cursor, then commits one relayout', async ({ page }) => {
  await events(page, true);
  const p = await toPage(page, 5, 50);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -100);
  const relayout = await waitForEvent(page, 'relayout');
  const x0 = Number(relayout.payload['xaxis.range[0]']);
  const x1 = Number(relayout.payload['xaxis.range[1]']);
  expect(x1 - x0).toBeLessThan(11);
  // The value under the cursor stays put.
  expect((5 - x0) / (x1 - x0)).toBeCloseTo(6 / 11, 2);
});
