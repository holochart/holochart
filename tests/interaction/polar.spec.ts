import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { dragBetween, events, openInteraction, waitForEvent } from './helpers.ts';

const { PNG } = pngjs;

/**
 * Polar pointer scenarios on `_dev/interaction-polar` (plan E11.4, E20.4): hover labels and events,
 * the radial drag (re-ranges the radial axis), the angular drag (rotates the angular axis), the
 * radial zoom box, double-click reset and legend toggling.
 *
 * The example: 640×400 px, 20 px margins, one polar subplot over the whole plot area, so the circle
 * has radius 180 px around container (320, 200); `radialaxis.range: [0, 10]` along 0°, angles
 * counterclockwise from 3 o'clock. Trace A (red, markers) has points (r, θ) = (5, 45°), (8, 135°),
 * (3, 225°), (6, 300°); trace B (blue) (7, 90°), (2, 180°).
 */
const EXAMPLE = '_dev/interaction-polar';
const RADIUS = 180;
const RED = [0xea, 0x2a, 0x37] as const;
const BLUE = [0x5e, 0x74, 0xd5] as const;

interface Pt {
  x: number;
  y: number;
}

/** Canvas origin in page px. */
async function origin(page: Page): Promise<Pt> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
      }
    ).__interaction;
    const box = hook.chart.three.root.canvas.getBoundingClientRect();
    return { x: box.left, y: box.top };
  });
}

/** Page point at polar pixel radius `rpx` and angle `deg` (counterclockwise from 3 o'clock). */
function at(o: Pt, rpx: number, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  return { x: o.x + 320 + rpx * Math.cos(a), y: o.y + 200 - rpx * Math.sin(a) };
}

/** Page point of data (r, θ) with the example's initial view. */
function point(o: Pt, r: number, deg: number): Pt {
  return at(o, (r / 10) * RADIUS, deg);
}

/** The subplot's defaulted radial range and rotation. */
async function view(page: Page): Promise<{ range: number[]; rotation: number; angle: number }> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { fullLayout: Record<string, unknown> | undefined } };
      }
    ).__interaction;
    const polar = hook.chart.fullLayout?.['polar'] as {
      radialaxis: { range: number[]; angle: number };
      angularaxis: { rotation: number };
    };
    return {
      range: [...polar.radialaxis.range],
      rotation: polar.angularaxis.rotation,
      angle: polar.radialaxis.angle,
    };
  });
}

/** The pixel color at a page point. */
async function pixel(page: Page, p: Pt): Promise<number[]> {
  const png = PNG.sync.read(
    await page.screenshot({
      clip: { x: Math.round(p.x), y: Math.round(p.y), width: 1, height: 1 },
    }),
  );
  return [png.data[0]!, png.data[1]!, png.data[2]!];
}

function near(c: number[], rgb: readonly number[]): boolean {
  return rgb.every((v, k) => Math.abs((c[k] ?? -1) - v) <= 10);
}

const visibleLabel = (page: Page) =>
  page.locator('.holochart-hoverlabel').filter({ visible: true });

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const hook = (window as unknown as { __interaction: { chart: { ready: Promise<unknown> } } })
      .__interaction;
    await hook.chart.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('the markers are where the polar geometry puts them', async ({ page }) => {
  const o = await origin(page);
  expect(near(await pixel(page, point(o, 5, 45)), RED)).toBe(true);
  expect(near(await pixel(page, point(o, 7, 90)), BLUE)).toBe(true);
});

test('hovering a point shows r and θ and emits hover', async ({ page }) => {
  const o = await origin(page);
  await events(page, true);
  const p = point(o, 8, 135);
  await page.mouse.move(p.x + 2, p.y + 1);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toHaveLength(1);
  expect(hover.payload.points?.[0]).toMatchObject({
    curveNumber: 0,
    pointNumber: 1,
    r: 8,
    theta: 135,
  });
  const label = visibleLabel(page);
  await expect(label).toHaveCount(1);
  await expect(label).toContainText('r: 8');
  await expect(label).toContainText('θ: 135°');

  // The other trace's point.
  const q = point(o, 2, 180);
  await page.mouse.move(q.x, q.y);
  await expect
    .poll(async () => {
      const hovers = (await events(page)).filter((e) => e.name === 'hover');
      return hovers.at(-1)?.payload.points?.[0];
    })
    .toMatchObject({ curveNumber: 1, pointNumber: 1, r: 2, theta: 180 });
});

test('dragging the radial handle along the axis changes the radial range', async ({ page }) => {
  const o = await origin(page);
  await events(page, true);
  // The handle sits 25 px past the end of the radial axis (at 0°).
  const handle = at(o, RADIUS + 25, 0);
  await dragBetween(page, handle, { x: handle.x + 48, y: handle.y }, 8);
  const relayout = await waitForEvent(page, 'relayout');
  // Plotly: 0.75 × (range span) / radius per px outwards, from the end being dragged.
  const expected = 10 - (0.75 * 10 * 48) / RADIUS;
  expect(relayout.payload['polar.radialaxis.range[1]']).toBeCloseTo(expected, 6);
  expect((await events(page)).some((e) => e.name === 'relayouting')).toBe(true);
  await settle(page);
  const v = await view(page);
  expect(v.range[0]).toBeCloseTo(0, 9);
  expect(v.range[1]).toBeCloseTo(expected, 6);
  // The point at r = 5 moved outwards with the zoom.
  expect(near(await pixel(page, at(o, (5 / expected) * RADIUS, 45)), RED)).toBe(true);
});

test('dragging across the radial handle rotates the radial axis', async ({ page }) => {
  const o = await origin(page);
  await events(page, true);
  const handle = at(o, RADIUS + 25, 0);
  // Mostly perpendicular to the axis: a rotation to the pointer's angle.
  const to = at(o, RADIUS + 25, 20);
  await dragBetween(page, handle, to, 10);
  const relayout = await waitForEvent(page, 'relayout');
  expect(relayout.payload['polar.radialaxis.angle']).toBeCloseTo(20, 0);
  await settle(page);
  expect((await view(page)).angle).toBeCloseTo(20, 0);
});

test('dragging just outside the circle rotates the angular axis', async ({ page }) => {
  const o = await origin(page);
  await events(page, true);
  const from = at(o, RADIUS + 12, 225);
  const to = at(o, RADIUS + 12, 255);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) {
    const p = at(o, RADIUS + 12, 225 + 3 * k);
    await page.mouse.move(p.x, p.y);
  }
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  const relayout = await waitForEvent(page, 'relayout');
  expect(relayout.payload['polar.angularaxis.rotation']).toBeCloseTo(30, 0);
  await settle(page);
  expect((await view(page)).rotation).toBeCloseTo(30, 0);
  // The point at (5, 45°) is drawn at 75° now.
  expect(near(await pixel(page, point(o, 5, 75)), RED)).toBe(true);
});

test('a zoom box drag in the plot area sets the radial range; double-click resets', async ({
  page,
}) => {
  const o = await origin(page);
  await events(page, true);
  // From 60 px to 150 px from the center (along 200°, clear of the points).
  await dragBetween(page, at(o, 60, 200), at(o, 150, 200), 10);
  const relayout = await waitForEvent(page, 'relayout');
  const range = relayout.payload['polar.radialaxis.range'] as number[];
  expect(range[0]).toBeCloseTo((60 / RADIUS) * 10, 1);
  expect(range[1]).toBeCloseTo((150 / RADIUS) * 10, 1);
  await settle(page);
  expect((await view(page)).range[1]).toBeCloseTo((150 / RADIUS) * 10, 1);

  await events(page, true);
  const c = at(o, 100, 330);
  await page.mouse.dblclick(c.x, c.y);
  await waitForEvent(page, 'doubleclick');
  await expect.poll(async () => (await view(page)).range).toEqual([0, 10]);
  expect(near(await pixel(page, point(o, 5, 45)), RED)).toBe(true);
});

test('clicking a legend item hides its trace; the subplot stays', async ({ page }) => {
  const o = await origin(page);
  // The legend is in the top-right corner: find trace B's glyph by its color.
  const clip = { x: Math.round(o.x + 520), y: Math.round(o.y), width: 120, height: 80 };
  const png = PNG.sync.read(await page.screenshot({ clip }));
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      if (near([png.data[i]!, png.data[i + 1]!, png.data[i + 2]!], BLUE)) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  expect(n).toBeGreaterThan(8);
  await events(page, true);
  await page.mouse.click(clip.x + sx / n, clip.y + sy / n);
  await waitForEvent(page, 'legendclick');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __interaction: { chart: { fullData: readonly { visible: unknown }[] } };
            }
          ).__interaction.chart.fullData[1]?.visible,
      ),
    )
    .toBe('legendonly');
  await settle(page);
  expect(near(await pixel(page, point(o, 7, 90)), BLUE)).toBe(false);
  expect(near(await pixel(page, point(o, 5, 45)), RED)).toBe(true);
  // Hovering where B's point was finds nothing of B.
  await events(page, true);
  const q = point(o, 7, 90);
  await page.mouse.move(q.x, q.y);
  await page.waitForTimeout(300);
  const hovers = (await events(page)).filter((e) => e.name === 'hover');
  expect(hovers.every((h) => h.payload.points?.every((p) => p.curveNumber !== 1))).toBe(true);
});
