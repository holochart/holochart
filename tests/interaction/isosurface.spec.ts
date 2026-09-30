import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * `isosurface` hover on `_dev/interaction-isosurface` (plan E14.8, E20.4), after plotly.js
 * `isosurface/convert.js` and `gl3d/scene.js`: the scene's GPU pick finds the surface under the
 * pointer, hover snaps to the nearest grid point and the label shows its `x`, `y`, `z`, then
 * `value: …` and its `text`; `hovertemplate` gets `%{value}`; events carry the grid point's index
 * in the columns (`pointNumber`) and its `value`.
 *
 * The example: 800×400 px, `value = z` on a 5³ grid (0–4 on each axis, x fastest) with its
 * isosurface at 2 (the plane z = 2), with text `p<x><y><z>` in `scene` (left half), and a
 * template in `scene2` (right half).
 */
const EXAMPLE = '_dev/interaction-isosurface';

type P3 = [number, number, number];

async function aim(page: Page, trace: number, p: P3): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([t, q]) => {
      const hook = (
        window as unknown as {
          __interaction: {
            chart: { three: { root: { canvas: HTMLCanvasElement } } };
            toScreen(t: number, x: number, y: number, z: number): { x: number; y: number };
          };
        }
      ).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const s = hook.toScreen(t, q[0], q[1], q[2]);
      return { x: box.left + s.x, y: box.top + s.y };
    },
    [trace, p] as const,
  );
}

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('the label shows the nearest grid point, its value and text', async ({ page }) => {
  await events(page, true);
  // Near grid point (1, 3, 2) on the plane.
  const at = await aim(page, 0, [1.15, 2.9, 2]);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  const text = await labels(page).first().innerText();
  expect(text.split('\n')).toEqual(['x: 1', 'y: 3', 'z: 2', 'value: 2', 'p132', 'plane']);
  const hover = await waitForEvent(page, 'hover');
  // Column index: x + 5 y + 25 z.
  expect(hover.payload.points).toEqual([
    { curveNumber: 0, pointNumber: 1 + 15 + 50, x: 1, y: 3, z: 2, value: 2 },
  ]);
});

test('hover follows the pointer across the surface', async ({ page }) => {
  const a = await aim(page, 0, [3, 1, 2]);
  await page.mouse.move(a.x, a.y);
  await expect(labels(page).first()).toContainText('p312');
  const b = await aim(page, 0, [0.1, 0.2, 2]);
  await page.mouse.move(b.x, b.y);
  await expect(labels(page).first()).toContainText('p002');
  // Off the surface: no label.
  await page.mouse.move(5, 5);
  await expect(labels(page)).toHaveCount(0);
});

test('hovertemplate reads the value', async ({ page }) => {
  const at = await aim(page, 1, [2, 2, 2]);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  await expect(labels(page).first()).toHaveText('v=2 at 2,2,2');
});
