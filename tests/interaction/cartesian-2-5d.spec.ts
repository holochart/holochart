import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Extruded cartesian traces in the 2.5D view on `_dev/interaction-cartesian-2-5d` (plan E8.9):
 * hover and click on a tilted, turned view map the pointer onto the extruded shape under it — the
 * front faces of funnel stages, waterfall steps and area slabs, the tops and sides of heatmap
 * columns — so the values are exact.
 *
 * The example (800×640 px, tilt 25°, rotation -30°): a funnel on `xy` (stages A, B, C at y 0…2,
 * centered on x = 0, depth 30 px), a waterfall on `x2y2` (x = 0…2: +5, -2, total 3; depth 30 px),
 * a 3 × 3 heatmap on `x3y3` (z = 1…9 row by row from the bottom; columns 60 px tall at z = 9) and
 * an area on `x4y4` through (0, 2), (1, 4), (2, 3), (3, 5), (4, 4) (depth 30 px).
 */
const EXAMPLE = '_dev/interaction-cartesian-2-5d';

/** Page px where linear point `(x, y)` of `subplot`, raised `z` px toward the viewer, is drawn. */
async function aim(
  page: Page,
  subplot: string,
  x: number,
  y: number,
  z = 0,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([sp, px, py, pz]) => {
      const hook = (
        window as unknown as {
          __interaction: {
            chart: { three: { root: { canvas: HTMLCanvasElement } } };
            toScreen(sp: string, x: number, y: number, z: number): { x: number; y: number };
          };
        }
      ).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const s = hook.toScreen(sp, px, py, pz);
      return { x: box.left + s.x, y: box.top + s.y };
    },
    [subplot, x, y, z] as const,
  );
}

interface Point {
  curveNumber: number;
  pointNumber: unknown;
  x: unknown;
  y: unknown;
  z?: unknown;
}

const pointsOf = (e: { payload: unknown }): Point[] =>
  (e.payload as { points?: Point[] }).points ?? [];

/** Hover at `at` (after leaving the chart) and return the hovered points. */
async function hoverAt(page: Page, at: { x: number; y: number }): Promise<Point[]> {
  await page.mouse.move(0, 0);
  await events(page, true);
  await page.mouse.move(at.x, at.y);
  return pointsOf(await waitForEvent(page, 'hover'));
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('funnel stages hover on their extruded front faces', async ({ page }) => {
  for (const stage of [0, 1, 2]) {
    const points = await hoverAt(page, await aim(page, 'xy', 0, stage, 30));
    expect(points.map((p) => [p.curveNumber, p.pointNumber])).toEqual([[0, stage]]);
  }
  // The label of the stage under the pointer.
  const [b] = await hoverAt(page, await aim(page, 'xy', 3, 1, 30));
  expect(b).toMatchObject({ curveNumber: 0, pointNumber: 1, x: 20, y: 'B' });
});

test('waterfall steps hover and click on their front faces', async ({ page }) => {
  // The -2 step spans 3…5 at x = 1.
  const points = await hoverAt(page, await aim(page, 'x2y2', 1, 4, 30));
  expect(points.map((p) => [p.curveNumber, p.pointNumber])).toEqual([[1, 1]]);
  await events(page, true);
  const total = await aim(page, 'x2y2', 2, 1.5, 30);
  await page.mouse.click(total.x, total.y);
  const click = await waitForEvent(page, 'click');
  expect(pointsOf(click).map((p) => [p.curveNumber, p.pointNumber])).toEqual([[1, 2]]);
});

test('heatmap columns hover on their tops and sides', async ({ page }) => {
  // Tops: the column at (2, 0) is 60 · 3 / 9 = 20 px tall, the one at (1, 1) 33.3 px.
  let [p] = await hoverAt(page, await aim(page, 'x3y3', 2, 0, 20));
  expect(p).toMatchObject({ curveNumber: 2, x: 2, y: 0, z: 3 });
  [p] = await hoverAt(page, await aim(page, 'x3y3', 1, 1, 100 / 3));
  expect(p).toMatchObject({ curveNumber: 2, x: 1, y: 1, z: 5 });
  // The top side (y = 2.5, the tilt shows it) of the tallest column, (2, 2), halfway up: on the
  // plot plane the pointer would be beyond the heatmap.
  [p] = await hoverAt(page, await aim(page, 'x3y3', 2, 2.5, 30));
  expect(p).toMatchObject({ curveNumber: 2, x: 2, y: 2, z: 9 });
});

test('area points hover on the front face of the slab', async ({ page }) => {
  for (const [i, x, y] of [
    [1, 1, 4],
    [2, 2, 3],
    [3, 3, 5],
  ] as const) {
    const points = await hoverAt(page, await aim(page, 'x4y4', x, y, 30));
    expect(points.map((q) => [q.curveNumber, q.pointNumber, q.x, q.y])).toEqual([[3, i, x, y]]);
  }
});
