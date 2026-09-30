import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { events, openInteraction, waitForEvent, type LoggedEvent } from './helpers.ts';

/**
 * `surface` hover and highlight lines on `surface/interaction` (plan E14.3, E20.4): hovering snaps
 * to the nearest grid point, whose `x`, `y` and `z` the label shows and the `hover` event reports
 * (`pointNumber: [row, column]`); a `hovertemplate` gets `%{surfacecolor}`; the highlight lines
 * (pure green in the example) go through the hovered point, follow the pointer, and go when the
 * pointer leaves the surface.
 *
 * The example: 640×400 px, two scenes side by side (the left one's surface is the tilted plane
 * `z = (x + 2y) / 5` on a 21 × 21 grid with green highlights; the right one colors
 * `z = (x − y) / 5` by `surfacecolor = 10x + y`).
 */
const EXAMPLE = 'surface/interaction';

type Point = { x: number; y: number };

/** Page px of grid point `(i, j)` of trace `trace` for the current camera. */
async function pointAt(page: Page, trace: number, i: number, j: number): Promise<Point> {
  return page.evaluate(
    ([t, a, b]) => {
      const hook = (
        window as unknown as {
          __interaction: {
            chart: { three: { root: { canvas: HTMLCanvasElement } } };
            project(trace: number, i: number, j: number): { x: number; y: number };
          };
        }
      ).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const p = hook.project(t, a, b);
      return { x: box.left + p.x, y: box.top + p.y };
    },
    [trace, i, j] as const,
  );
}

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

type EventPoint = {
  curveNumber: number;
  pointNumber: unknown;
  x: unknown;
  y: unknown;
  z: unknown;
  surfacecolor?: unknown;
};

function firstPoint(e: LoggedEvent): EventPoint {
  return (e.payload['points'] as EventPoint[])[0]!;
}

/** Move near a grid point (a little off it: hover snaps) and wait for its hover. */
async function hoverAt(page: Page, trace: number, i: number, j: number): Promise<LoggedEvent> {
  const p = await pointAt(page, trace, i, j);
  await events(page, true);
  await page.mouse.move(p.x + 6, p.y + 6);
  await page.mouse.move(p.x + 1.5, p.y - 1, { steps: 3 });
  await expect
    .poll(async () => (await events(page)).some((e) => e.name === 'hover'), { timeout: 10_000 })
    .toBe(true);
  return (await events(page)).filter((e) => e.name === 'hover').at(-1)!;
}

/** Pure green pixels (the highlight lines) in the page, and how many lie near `near`. */
async function greenPixels(page: Page, near?: Point, radius = 6): Promise<[number, number]> {
  const png = pngjs.PNG.sync.read(await page.screenshot());
  let all = 0;
  let close = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const k = (y * png.width + x) * 4;
      const r = png.data[k]!;
      const g = png.data[k + 1]!;
      const b = png.data[k + 2]!;
      if (!(g > 180 && r < 90 && b < 90)) continue;
      all++;
      if (near && Math.hypot(x - near.x, y - near.y) <= radius) close++;
    }
  }
  return [all, close];
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('hover snaps to the nearest grid point and labels its x, y and z', async ({ page }) => {
  const hover = await hoverAt(page, 0, 5, 7);
  const point = firstPoint(hover);
  expect(point).toMatchObject({ curveNumber: 0, pointNumber: [7, 5], x: 5, y: 7 });
  expect(point.z).toBeCloseTo((5 + 2 * 7) / 5, 9);
  await expect(labels(page)).toHaveCount(1);
  const text = await labels(page).first().innerText();
  expect(text).toContain('x: 5');
  expect(text).toContain('y: 7');
  expect(text).toContain('z: 3.8');
});

test('a hovertemplate gets %{surfacecolor}', async ({ page }) => {
  const hover = await hoverAt(page, 1, 12, 3);
  const point = firstPoint(hover);
  expect(point).toMatchObject({ curveNumber: 1, pointNumber: [3, 12], surfacecolor: 123 });
  await expect(labels(page)).toHaveCount(1);
  await expect(labels(page).first()).toHaveText('c=123 at 12, 3');
});

test('highlight lines go through the hovered point, follow it and go on leave', async ({
  page,
}) => {
  expect((await greenPixels(page))[0]).toBe(0);
  await hoverAt(page, 0, 5, 5);
  const a = await pointAt(page, 0, 5, 5);
  await expect.poll(async () => (await greenPixels(page, a))[1]).toBeGreaterThan(5);
  // To another point: the lines move there (none near the first point any more).
  await hoverAt(page, 0, 15, 12);
  const b = await pointAt(page, 0, 15, 12);
  await expect.poll(async () => (await greenPixels(page, b))[1]).toBeGreaterThan(5);
  expect((await greenPixels(page, a, 4))[1]).toBe(0);
  // Off the surface (empty space in the scene), then off the chart: no lines.
  await page.mouse.move(a.x, 30);
  await expect.poll(async () => (await greenPixels(page))[0]).toBe(0);
  await hoverAt(page, 0, 10, 10);
  await expect.poll(async () => (await greenPixels(page))[0]).toBeGreaterThan(0);
  await page.mouse.move(700, 450);
  await expect.poll(async () => (await greenPixels(page))[0]).toBe(0);
  await waitForEvent(page, 'unhover');
});
