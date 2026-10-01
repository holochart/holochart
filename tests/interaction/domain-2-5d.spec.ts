import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';
import { at as onPage, clickUntil, level } from './hierarchy.ts';

/**
 * Domain traces in 2.5D on `_dev/interaction-domain-2-5d` (plan E8.9, E9.12, E20.4): the pointer
 * on a tilted, extruded pie or treemap is mapped onto the flat trace through the prism under it —
 * a slice's top or front wall, a tile's top — so hover and click report what is drawn there, hover
 * labels sit where the tilted trace draws their anchors, and a click on a tile drills down.
 *
 * The example (see its comment): the pie is centered at (155, 200) with radius 135, slices A–D
 * clockwise from 12 o'clock (A 0–144°, B 144–252°, C 252–324°, D 324–360°), 30 px deep, tilted
 * 45°; the treemap's Seth tile spans x 350–485, its header y 40–60 (top 24 px up), Enos below it
 * at x 350–440 (top 36 px up).
 */
const EXAMPLE = '_dev/interaction-domain-2-5d';

const PIE = { cx: 155, cy: 200, r: 135, depth: 30 };

/** Page px where trace `trace` draws its flat container point `(x, y)` raised `z` px. */
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

/** The flat pie's container point at `angle` degrees clockwise from 12 o'clock, `f` radii out. */
function polar(angle: number, f: number): [number, number] {
  const a = (angle * Math.PI) / 180;
  return [PIE.cx + Math.sin(a) * PIE.r * f, PIE.cy - Math.cos(a) * PIE.r * f];
}

interface Point {
  curveNumber: number;
  pointNumber: number;
  label?: unknown;
}

const pointsOf = (e: { payload: unknown }): Point[] =>
  ((e.payload as { points?: Point[] }).points ?? []).map(({ curveNumber, pointNumber, label }) => ({
    curveNumber,
    pointNumber,
    label,
  }));

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('a slice hovers on its tilted top, with its label where the slice is drawn', async ({
  page,
}) => {
  await events(page, true);
  // Slice B (144–252°) halfway out, on its top.
  const at = await aim(page, 0, ...polar(198, 0.6), PIE.depth);
  await page.mouse.move(at.x, at.y);
  const hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)).toEqual([{ curveNumber: 0, pointNumber: 1, label: 'B' }]);
  await expect(labels(page)).toHaveCount(1);
  // The tilt moves the slice well away from where the flat pie draws it…
  const flat = await onPage(page, ...polar(198, 0.6));
  expect(Math.abs(flat.y - at.y)).toBeGreaterThan(20);
  // …and the label goes with it: beside the drawn slice, its arrow at the anchor's height (the
  // anchor is on the bisector, a little further in than the pointer).
  const box = (await labels(page).first().boundingBox())!;
  expect(Math.abs(box.y + box.height / 2 - at.y)).toBeLessThan(box.height + 20);
  expect(Math.abs(box.y + box.height / 2 - flat.y)).toBeGreaterThan(10);
});

test('a slice hovers on its front wall, below where the flat pie ends', async ({ page }) => {
  await events(page, true);
  // Slice B's wall at 6 o'clock, halfway up: on the plane, the pointer is outside the pie.
  const at = await aim(page, 0, ...polar(180, 1), PIE.depth / 2);
  const plane = await aim(page, 0, ...polar(180, 1), 0);
  expect(at.y).toBeLessThan(plane.y);
  await page.mouse.move(at.x, at.y);
  const hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)).toEqual([{ curveNumber: 0, pointNumber: 1, label: 'B' }]);
  // Below the wall's bottom edge: nothing.
  await events(page, true);
  await page.mouse.move(plane.x, plane.y + 8);
  await expect.poll(async () => (await events(page)).some((e) => e.name === 'unhover')).toBe(true);
});

test('a click on a tilted slice reports that slice', async ({ page }) => {
  await events(page, true);
  // Slice C (252–324°): toward the back left, on its top.
  const at = await aim(page, 0, ...polar(288, 0.7), PIE.depth);
  await page.mouse.click(at.x, at.y);
  const click = await waitForEvent(page, 'click');
  expect(pointsOf(click)).toEqual([{ curveNumber: 0, pointNumber: 2, label: 'C' }]);
});

test('treemap tiles hover on their terraces; a click drills down', async ({ page }) => {
  await events(page, true);
  // Enos, on its top (36 px up).
  let at = await aim(page, 1, 395, 200, 36);
  await page.mouse.move(at.x, at.y);
  const hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)).toEqual([{ curveNumber: 1, pointNumber: 5, label: 'Enos' }]);
  // Seth's header band (24 px up), near its back edge (the raised tiles in front of it cover its
  // front part): a click drills into Seth.
  await events(page, true);
  at = await aim(page, 1, 420, 43, 24);
  await page.mouse.click(at.x, at.y);
  const click = await waitForEvent(page, 'treemapclick');
  expect(click.payload['nextLevel']).toBe('Seth');
  expect(pointsOf(click)).toEqual([{ curveNumber: 1, pointNumber: 1, label: 'Seth' }]);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __interaction: { chart: { data: { level?: unknown }[] } } })
            .__interaction.chart.data[1]?.level,
      ),
    )
    .toBe('Seth');
  // Drilled in, Seth fills the domain below the path bar: a click on its header (y 38–58 below the
  // 18 px path bar, 12 px up) goes back up.
  await events(page, true);
  at = await aim(page, 1, 480, 41, 12);
  await clickUntil(page, at, async () => (await level(page)) !== 'Seth');
});
