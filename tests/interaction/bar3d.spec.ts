import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * `bar3d` hover on `_dev/interaction-bar3d` (plan E14.9, E20.4): per bar, the label shows the
 * position (categories by name), the bar's own height `z` and, for a bar with a `base` or on a
 * stack, where it starts (`base: …`); `hovertemplate` gets `%{base}` and `%{top}`; events carry
 * `base` and `top`. Also a `scatter3d` tube line (`line.render: 'tube'`, E14.10): a hit on the
 * mesh hovers the data point it was built around.
 *
 * The example: 800×640 px, four cube scenes in a 2 × 2 grid; bars at x = a, b, c (linear 0, 1,
 * 2), y = p (0), heights 3, 4, 5. The pointer aims at the middle of bars' front faces (y = −0.4).
 */
const EXAMPLE = '_dev/interaction-bar3d';

/** Page px of a linear scene position of trace `trace`. */
async function aim(
  page: Page,
  trace: number,
  x: number,
  y: number,
  z: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([t, px, py, pz]) => {
      const hook = (
        window as unknown as {
          __interaction: {
            chart: { three: { root: { canvas: HTMLCanvasElement } } };
            toScreen(t: number, x: number, y: number, z: number): { x: number; y: number };
          };
        }
      ).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const s = hook.toScreen(t, px, py, pz);
      return { x: box.left + s.x, y: box.top + s.y };
    },
    [trace, x, y, z] as const,
  );
}

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('a bar shows its position and height, and its base when it has one', async ({ page }) => {
  await events(page, true);
  // The middle bar, on base 2: its front face at mid height.
  let at = await aim(page, 0, 1, -0.4, 4);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  expect((await labels(page).first().innerText()).split('\n')).toEqual([
    'x: b',
    'y: p',
    'z: 4',
    'base: 2',
    'bars',
  ]);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toEqual([
    { curveNumber: 0, pointNumber: 1, x: 'b', y: 'p', z: 4, base: 2, top: 6 },
  ]);
  // A bar on the default base shows no base line.
  at = await aim(page, 0, 2, -0.4, 2.5);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page).first()).toContainText('x: c');
  expect((await labels(page).first().innerText()).split('\n')).toEqual([
    'x: c',
    'y: p',
    'z: 5',
    'bars',
  ]);
});

test('stacked bars start on the bar below; hoverinfo all adds the text', async ({ page }) => {
  // The upper block at c: 3 on top of 5.
  let at = await aim(page, 2, 2, -0.4, 6.5);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  expect((await labels(page).first().innerText()).split('\n')).toEqual([
    'x: c',
    'y: p',
    'z: 3',
    'base: 5',
    'upper',
  ]);
  // The lower block at a.
  at = await aim(page, 1, 0, -0.4, 1.5);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page).first()).toContainText('lower');
  expect((await labels(page).first().innerText()).split('\n')).toEqual([
    'x: a',
    'y: p',
    'z: 3',
    'one',
    'lower',
  ]);
});

test('hovertemplate reads base and top', async ({ page }) => {
  const at = await aim(page, 3, 0, -0.4, 2.5);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  await expect(labels(page).first()).toHaveText('a/p: 3 from 1 to 4');
});

test('a tube line hovers the point it was built around', async ({ page }) => {
  await events(page, true);
  const at = await aim(page, 4, 1.9, 0, 0);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toMatchObject([{ curveNumber: 4, pointNumber: 2, x: 2 }]);
});
