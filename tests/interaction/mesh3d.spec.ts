import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * `mesh3d` hover on `_dev/interaction-mesh3d` (plan E14.4, E20.4), after plotly.js
 * `mesh3d/convert.js`: with per-vertex colors the label shows the hovered triangle's vertex
 * nearest to the pointer (`x`, `y`, `z`, its `text`) and events carry its index and values (and
 * `intensity`); with per-triangle intensity the triangle (its index, centroid and intensity, here
 * through `hovertemplate`). `contour.show` draws the level set through the hovered vertex.
 *
 * The example: 800×400 px, a square pyramid (base 0–3 on z = 0, apex 4 at (2, 2, 3)) in `scene`
 * (left half, vertex intensity 0, 1, 2, 3, 10) and in `scene2` (right half, cell intensity).
 */
const EXAMPLE = '_dev/interaction-mesh3d';

type P3 = [number, number, number];
const V: P3[] = [
  [0, 0, 0],
  [4, 0, 0],
  [4, 4, 0],
  [0, 4, 0],
  [2, 2, 3],
];

/** Page position of the data point `p` of trace `trace`. */
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

/** A point on triangle (a, b, c), mostly at a. */
const near = (a: P3, b: P3, c: P3, w = 0.9): P3 =>
  [0, 1, 2].map((k) => w * a[k]! + ((1 - w) / 2) * (b[k]! + c[k]!)) as P3;

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

/** Instances drawn by trace 0's contour line (0 without one). */
async function contourSegments(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: {
          chart: {
            getTraceObjects(i: number): {
              material?: { name?: string };
              geometry?: { instanceCount?: number };
            }[];
          };
        };
      }
    ).__interaction;
    const line = hook.chart.getTraceObjects(0).find((o) => o.material?.name === 'holochart:line3d');
    return line?.geometry?.instanceCount ?? 0;
  });
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('hovering a triangle labels its nearest vertex: x, y, z and text', async ({ page }) => {
  await events(page, true);
  // On the x = 4 face (vertices 1, 2, 4), close to vertex 1.
  const at = await aim(page, 0, near(V[1]!, V[2]!, V[4]!));
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  const text = await labels(page).first().innerText();
  for (const part of ['x: 4', 'y: 0', 'z: 0', 'b']) expect(text).toContain(part);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toEqual([
    { curveNumber: 0, pointNumber: 1, x: 4, y: 0, z: 0, intensity: 1 },
  ]);
  // Near the apex on the same face: the apex.
  const apex = await aim(page, 0, near(V[4]!, V[1]!, V[2]!));
  await page.mouse.move(apex.x, apex.y);
  await expect(labels(page).first()).toContainText('apex');
  await expect(labels(page).first()).toContainText('z: 3');
});

test('with cell intensity, hover reports the triangle', async ({ page }) => {
  await events(page, true);
  // The centroid of triangle 2 (vertices 2, 3, 4: the y = 4 face).
  const c = [0, 1, 2].map((k) => (V[2]![k]! + V[3]![k]! + V[4]![k]!) / 3) as P3;
  const at = await aim(page, 1, c);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  await expect(labels(page).first()).toHaveText('cell 2: 3');
  const hover = await waitForEvent(page, 'hover');
  const [point] = hover.payload.points as unknown as Record<string, number>[];
  expect(point).toMatchObject({ curveNumber: 1, pointNumber: 2, intensity: 3 });
  expect(point!['x']).toBeCloseTo(2, 9);
  expect(point!['y']).toBeCloseTo(10 / 3, 9);
  expect(point!['z']).toBeCloseTo(1, 9);
});

test('contour.show draws the level set through the hovered vertex while hovering', async ({
  page,
}) => {
  expect(await contourSegments(page)).toBe(0);
  const at = await aim(page, 0, near(V[1]!, V[2]!, V[4]!));
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  // Level 1 (vertex 1's intensity) crosses the four side faces.
  await expect.poll(() => contourSegments(page)).toBeGreaterThan(2);
  await page.mouse.move(5, 5);
  await expect(labels(page)).toHaveCount(0);
  await expect.poll(() => contourSegments(page)).toBe(0);
});
