import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * `cone` hover on `_dev/interaction-cone` (plan E14.5, E20.4), after plotly.js `cone/convert.js`
 * and `gl3d/scene.js`: the label shows the cone's position and, per `hoverinfo` (default
 * `x+y+z+norm+text+name`), its vector `u`, `v`, `w` and `norm` (3 significant digits), in
 * Plotly's order; `hovertemplate` gets `%{u}`, `%{v}`, `%{w}`, `%{norm}`; events carry `norm`.
 *
 * The example: 900×400 px, three scenes side by side, each with cones at x = 0, 2, 4 (y = z = 0)
 * whose middles sit on their positions (`anchor: 'center'`), vectors (1, 0, 0), (0, 2, 0),
 * (0, 0, 3).
 */
const EXAMPLE = '_dev/interaction-cone';

async function aim(page: Page, trace: number, x: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([t, px]) => {
      const hook = (
        window as unknown as {
          __interaction: {
            chart: { three: { root: { canvas: HTMLCanvasElement } } };
            toScreen(t: number, x: number, y: number, z: number): { x: number; y: number };
          };
        }
      ).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const s = hook.toScreen(t, px, 0, 0);
      return { x: box.left + s.x, y: box.top + s.y };
    },
    [trace, x] as const,
  );
}

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('the default label shows the position and the norm; events carry the vector and norm', async ({
  page,
}) => {
  await events(page, true);
  const at = await aim(page, 0, 2);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  const text = await labels(page).first().innerText();
  // The trace name is in the label's side box.
  expect(text.split('\n')).toEqual(['x: 2', 'y: 0', 'z: 0', 'norm: 2.00', 'default']);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toEqual([
    { curveNumber: 0, pointNumber: 1, x: 2, y: 0, z: 0, u: 0, v: 2, w: 0, norm: 2 },
  ]);
});

test("hoverinfo 'all' adds u, v, w before the norm, then the text", async ({ page }) => {
  const at = await aim(page, 1, 4);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  const text = await labels(page).first().innerText();
  expect(text.split('\n')).toEqual([
    'x: 4',
    'y: 0',
    'z: 0',
    'u: 0',
    'v: 0',
    'w: 3',
    'norm: 3.00',
    'third',
    'all',
  ]);
});

test('hovertemplate reads u, v, w and norm', async ({ page }) => {
  const at = await aim(page, 2, 0);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  await expect(labels(page).first()).toHaveText('1/0/0 |1.00| 0');
});
