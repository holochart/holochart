import { expect, test, type Page } from '@playwright/test';
import { callChart, dragBetween, events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * The 2.5D view on `_dev/interaction-view3d` (plan E8.9, E9.10, E20.4): hover, click, box
 * selection and zoom on a tilted, turned plot plane map the pointer onto the plane — or onto the
 * extruded bar under it (front faces, tops, sides) — so values are exact; `dragmode: 'turntable'`
 * drags turn the view and commit `view3d.tilt` / `view3d.rotation`.
 *
 * The example: 640×480 px; bars at x = 0…4 (width 0.8) with heights 2, 5, 3, 6, 4 and depth
 * 40 px; points at (0.5, 7), (1.5, 1), (2.5, 7.5), (3.5, 1.5); tilt 25°, rotation -30° (the left
 * sides of the bars show).
 */
const EXAMPLE = '_dev/interaction-view3d';

/** Page px where data point `(x, y)`, raised `z` px toward the viewer, is drawn. */
async function aim(page: Page, x: number, y: number, z = 0): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([px, py, pz]) => {
      const hook = (
        window as unknown as {
          __interaction: {
            chart: { three: { root: { canvas: HTMLCanvasElement } } };
            toScreen(x: number, y: number, z: number): { x: number; y: number };
          };
        }
      ).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const s = hook.toScreen(px, py, pz);
      return { x: box.left + s.x, y: box.top + s.y };
    },
    [x, y, z] as const,
  );
}

interface Point {
  curveNumber: number;
  pointNumber: number;
  x: unknown;
  y: unknown;
}

const pointsOf = (e: { payload: unknown }): Point[] =>
  ((e.payload as { points?: Point[] }).points ?? []).map(({ curveNumber, pointNumber, x, y }) => ({
    curveNumber,
    pointNumber,
    x,
    y,
  }));

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('a point hovers where the tilted view draws it, with its label there', async ({ page }) => {
  await events(page, true);
  const at = await aim(page, 0.5, 7);
  await page.mouse.move(at.x, at.y);
  const hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)).toEqual([{ curveNumber: 1, pointNumber: 0, x: 0.5, y: 7 }]);
  await expect(labels(page)).toHaveCount(1);
  // The label sits beside the drawn point (its arrow at the point's height).
  const box = await labels(page).first().boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.y + box!.height / 2 - at.y)).toBeLessThan(box!.height);
  expect(Math.min(Math.abs(box!.x - at.x), Math.abs(box!.x + box!.width - at.x))).toBeLessThan(12);
});

test('bars hover on their extruded front faces, tops and sides', async ({ page }) => {
  // Front face of the bar at x = 3 (height 6), halfway up, 40 px toward the viewer.
  await events(page, true);
  let at = await aim(page, 3, 3, 40);
  await page.mouse.move(at.x, at.y);
  let hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)).toEqual([{ curveNumber: 0, pointNumber: 3, x: 3, y: 6 }]);
  // The top of the bar at x = 1 (height 5), halfway along its depth.
  await page.mouse.move(0, 0);
  await events(page, true);
  at = await aim(page, 1, 5, 20);
  await page.mouse.move(at.x, at.y);
  hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)).toEqual([{ curveNumber: 0, pointNumber: 1, x: 1, y: 5 }]);
  // The left side of the bar at x = 4 (from 3.6), low down: on the plane, the pointer would be
  // left of the bar, over the gap to the bar at x = 3.
  await page.mouse.move(0, 0);
  await events(page, true);
  at = await aim(page, 3.6, 1, 30);
  await page.mouse.move(at.x, at.y);
  hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)).toEqual([{ curveNumber: 0, pointNumber: 4, x: 4, y: 4 }]);
});

test('a click reports the bar under the pointer', async ({ page }) => {
  await events(page, true);
  const at = await aim(page, 2, 1.5, 40);
  await page.mouse.click(at.x, at.y);
  const click = await waitForEvent(page, 'click');
  expect(pointsOf(click)).toEqual([{ curveNumber: 0, pointNumber: 2, x: 2, y: 3 }]);
});

test('box selection selects what lies inside the box on the plot plane', async ({ page }) => {
  await callChart(page, 'setDragmode', 'select');
  await events(page, true);
  // A box over the plane from (0.2, 6.5) to (2.8, 7.9): the points at (0.5, 7) and (2.5, 7.5).
  await dragBetween(page, await aim(page, 0.2, 6.5), await aim(page, 2.8, 7.9));
  const selected = await waitForEvent(page, 'selected');
  expect(pointsOf(selected)).toEqual([
    { curveNumber: 1, pointNumber: 0, x: 0.5, y: 7 },
    { curveNumber: 1, pointNumber: 2, x: 2.5, y: 7.5 },
  ]);
});

test('a zoom box zooms to its data range on the plot plane', async ({ page }) => {
  await events(page, true);
  // Corners above the bars (a pointer over a bar maps onto the bar).
  await dragBetween(page, await aim(page, 0.5, 6.6), await aim(page, 3.5, 7.8));
  const relayout = await waitForEvent(page, 'relayout');
  const r = relayout.payload as Record<string, number>;
  expect(r['xaxis.range[0]']).toBeCloseTo(0.5, 1);
  expect(r['xaxis.range[1]']).toBeCloseTo(3.5, 1);
  expect(r['yaxis.range[0]']).toBeCloseTo(6.6, 1);
  expect(r['yaxis.range[1]']).toBeCloseTo(7.8, 1);
});

test('turntable drags turn the view; hover stays exact afterwards', async ({ page }) => {
  await callChart(page, 'setDragmode', 'turntable');
  await events(page, true);
  const from = await aim(page, 2, 4);
  await dragBetween(page, from, { x: from.x + 60, y: from.y + 40 });
  const relayout = await waitForEvent(page, 'relayout');
  const r = relayout.payload as Record<string, number>;
  expect(r['view3d.tilt']).toBeCloseTo(25 + 40 * 0.35, 5);
  expect(r['view3d.rotation']).toBeCloseTo(-30 - 60 * 0.35, 5);
  // No click from the drag.
  expect((await events(page)).some((e) => e.name === 'click')).toBe(false);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __interaction: { chart: { fullLayout: { view3d: { tilt: number } } } };
            }
          ).__interaction.chart.fullLayout.view3d.tilt,
      ),
    )
    .toBeCloseTo(39, 5);
  await events(page, true);
  const at = await aim(page, 2.5, 7.5);
  await page.mouse.move(at.x, at.y);
  const hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)).toEqual([{ curveNumber: 1, pointNumber: 2, x: 2.5, y: 7.5 }]);
});

test('turning the view off and on again animates through the flat view', async ({ page }) => {
  const tilts = await page.evaluate(async () => {
    interface Projector {
      angles: { tilt: number };
    }
    const chart = (
      window as unknown as {
        __interaction: {
          chart: {
            animate(frame: unknown, options: unknown): Promise<unknown>;
            subplots: Map<string, { viewport: { projector?: Projector | null } }>;
          };
        };
      }
    ).__interaction.chart;
    const vp = chart.subplots.get('xy')!.viewport;
    const options = {
      frame: { duration: 800, redraw: false },
      transition: { duration: 800, easing: 'linear' },
    };
    const sample = async (view3d: Record<string, unknown>) => {
      const done = chart.animate({ layout: { view3d } }, options);
      await new Promise((r) => setTimeout(r, 400));
      const mid = vp.projector?.angles.tilt;
      await done;
      return { mid, end: vp.projector ? vp.projector.angles.tilt : null };
    };
    return [
      await sample({ enabled: false }),
      await sample({ enabled: true, tilt: 25, rotation: -30 }),
    ];
  });
  // Off: from 25° toward the flat view, then flat (no projector). On: from flat toward 25°.
  // Mid-way (software GL frames are slow: anywhere strictly between).
  for (const { mid } of tilts) {
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(25);
  }
  expect(tilts[0]!.end).toBeNull();
  expect(tilts[1]!.end).toBe(25);
});
