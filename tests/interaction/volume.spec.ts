import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * `volume` hover on `_dev/interaction-volume` (plan E14.7, E20.4): a ray-marched volume hovers
 * through a CPU ray cast (the first sample where the ray's accumulated opacity reaches 10 %), a
 * stacked one (Plotly's isosurfaces) through the scene's GPU pick; both snap to the nearest grid
 * point and label it like isosurfaces (`x`, `y`, `z`, `value: …`).
 *
 * The example: 800×400 px, an opaque ball (distance from the origin up to 0.45, grid spacing 0.2
 * over [-1, 1]³) seen from +x, ray-marched in `scene` (left half) and as isosurfaces in `scene2`
 * (right half). The ray through the ball's center meets it at x = 0.45: grid point (0.4, 0, 0).
 */
const EXAMPLE = '_dev/interaction-volume';

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

for (const [trace, name] of [
  [0, 'raymarch'],
  [1, 'isosurfaces'],
] as const) {
  test(`${name}: the front of the ball, snapped to the grid`, async ({ page }) => {
    await events(page, true);
    const at = await aim(page, trace, [0, 0, 0]);
    await page.mouse.move(at.x, at.y);
    await expect(labels(page)).toHaveCount(1);
    const text = await labels(page).first().innerText();
    expect(text.split('\n')).toEqual(['x: 0.4', 'y: 0', 'z: 0', 'value: 0.4', name]);
    const hover = await waitForEvent(page, 'hover');
    // Column index of (0.4, 0, 0): i = 7, j = k = 5, x fastest on 11 points.
    expect(hover.payload.points).toEqual([
      { curveNumber: trace, pointNumber: 7 + 5 * 11 + 5 * 121, x: 0.4, y: 0, z: 0, value: 0.4 },
    ]);
  });
}

test('raymarch: off the ball, no label; hover comes back on it', async ({ page }) => {
  // Beside the ball (y = 0.8): the ray only meets values above the range.
  const off = await aim(page, 0, [0, 0.8, 0]);
  await page.mouse.move(off.x, off.y);
  await expect(labels(page)).toHaveCount(0);
  const on = await aim(page, 0, [0, 0.2, 0.2]);
  await page.mouse.move(on.x, on.y);
  await expect(labels(page)).toHaveCount(1);
  await expect(labels(page).first()).toContainText('y: 0.2');
});
