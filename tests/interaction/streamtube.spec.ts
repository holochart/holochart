import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * `streamtube` hover on `_dev/interaction-streamtube` (plan E14.6, E20.4), after plotly.js
 * `streamtube/convert.js` and `gl3d/scene.js`: the label shows the hovered tube sample's position
 * and, per `hoverinfo` (default `x+y+z+norm+text+name`), the field's vector there (`u`, `v`, `w`),
 * its `norm` and the `divergence` (3 significant digits), then the text, in Plotly's order;
 * `hovertemplate` gets `%{tubeu}`, `%{norm}`, `%{divergence}`; events carry Plotly's `tubex` …
 * `tubew`, `norm` and `divergence`.
 *
 * The example: 900×400 px, three scenes side by side, each with one straight tube along x from
 * the origin through `(u, v, w) = (1 + x / 2, 0, 0)` (norm `1 + x / 2`, divergence 0.5).
 */
const EXAMPLE = '_dev/interaction-streamtube';

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

test('the default label shows the sample position and the norm; events carry the tube fields', async ({
  page,
}) => {
  await events(page, true);
  const at = await aim(page, 0, 2);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  const hover = await waitForEvent(page, 'hover');
  const point = hover.payload.points![0] as unknown as Record<string, number>;
  expect(point['curveNumber']).toBe(0);
  // The sample nearest to the pointer (samples are ~0.13 apart along x).
  expect(Math.abs(point['tubex']! - 2)).toBeLessThan(0.2);
  expect([point['tubey'], point['tubez'], point['tubev'], point['tubew']]).toEqual([0, 0, 0, 0]);
  expect(point['tubeu']).toBeCloseTo(1 + point['tubex']! / 2, 9);
  expect(point['norm']).toBeCloseTo(1 + point['tubex']! / 2, 9);
  expect(point['divergence']).toBeCloseTo(0.5, 9);
  const text = await labels(page).first().innerText();
  const lines = text.split('\n');
  // The trace name is in the label's side box.
  expect(lines).toHaveLength(5);
  expect(lines[0]).toMatch(/^x: \d\.\d+$/);
  expect(lines.slice(1, 3)).toEqual(['y: 0', 'z: 0']);
  expect(lines[3]).toBe(`norm: ${point['norm']!.toPrecision(3)}`);
  expect(lines[4]).toBe('default');
});

test("hoverinfo 'all' adds u, v, w, norm and divergence, then the text", async ({ page }) => {
  await events(page, true);
  const at = await aim(page, 1, 3);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  const hover = await waitForEvent(page, 'hover');
  const point = hover.payload.points![0] as unknown as Record<string, number>;
  expect(point['curveNumber']).toBe(1);
  const lines = (await labels(page).first().innerText()).split('\n');
  expect(lines[0]).toMatch(/^x: \d\.\d+$/);
  expect(lines).toHaveLength(10);
  expect(lines.slice(1, 3)).toEqual(['y: 0', 'z: 0']);
  // u like the x axis' hover values.
  expect(lines[3]).toMatch(/^u: \d\.\d+$/);
  expect(Number(lines[3]!.slice(3))).toBeCloseTo(point['tubeu']!, 2);
  expect(lines.slice(4)).toEqual([
    'v: 0',
    'w: 0',
    `norm: ${point['norm']!.toPrecision(3)}`,
    'divergence: 0.500',
    'flow',
    'all',
  ]);
});

test('hovertemplate reads tubeu, norm and divergence', async ({ page }) => {
  await events(page, true);
  const at = await aim(page, 2, 1);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  const hover = await waitForEvent(page, 'hover');
  const point = hover.payload.points![0] as unknown as Record<string, number>;
  const u = point['tubeu']!.toFixed(2);
  await expect(labels(page).first()).toHaveText(`${u}|${u}|0.50`);
});
