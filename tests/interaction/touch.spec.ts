import { expect, test, type Page } from '@playwright/test';
import {
  callChart,
  events,
  openInteraction,
  ranges,
  toPage,
  touchGesture,
  waitForEvent,
} from './helpers.ts';
import { at, level } from './hierarchy.ts';

/**
 * Touch input (plan E6.6, E20.4) through Chromium's real touch pipeline (CDP touch events in a
 * `hasTouch` context, so `touch-action` applies): tap to hover and click, tap elsewhere to hide,
 * double-tap reset, pinch zoom and two-finger pan, one-finger drags per `dragmode`, page scrolling
 * over the chart, and views that take touch drags or taps (sankey node drag, treemap drill).
 *
 * `_dev/interaction-scatter`: x in [-1, 10], y in [-10, 100]; points (i, 10·i + 3·k), k = 0..2.
 */
test.use({ hasTouch: true });

const SCATTER = '_dev/interaction-scatter';

const label = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

async function touchAction(page: Page): Promise<string> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
      }
    ).__interaction;
    return getComputedStyle(hook.chart.three.root.canvas).touchAction;
  });
}

const names = async (page: Page): Promise<string[]> => (await events(page)).map((e) => e.name);

/** Wait until `window.scrollY` has stayed the same for ~0.5 s (a touch fling has ended). */
async function scrollSettled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = window.scrollY;
        let still = 0;
        const tick = (): void => {
          const y = window.scrollY;
          still = y === last ? still + 1 : 0;
          last = y;
          if (still >= 30) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

test.describe('cartesian', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, SCATTER);
    await events(page, true);
  });

  test('a tap hovers and clicks; a tap on empty space or off the chart hides the hover', async ({
    page,
  }) => {
    const p = await toPage(page, 4, 43);
    await page.touchscreen.tap(p.x, p.y);
    const hover = await waitForEvent(page, 'hover');
    expect(hover.payload.points?.[0]).toMatchObject({ curveNumber: 1, pointNumber: 4 });
    const click = await waitForEvent(page, 'click');
    expect(click.payload.points?.[0]).toMatchObject({ curveNumber: 1, pointNumber: 4 });
    await expect(label(page)).toHaveCount(1);
    await expect(label(page)).toContainText('p1-4');
    // Lifting the finger keeps it.
    await page.waitForTimeout(400);
    await expect(label(page)).toHaveCount(1);
    expect(await names(page)).toEqual(['hover', 'click']);

    const empty = await toPage(page, 8, 10);
    await page.touchscreen.tap(empty.x, empty.y);
    await waitForEvent(page, 'unhover');
    await expect(label(page)).toHaveCount(0);

    await page.touchscreen.tap(p.x, p.y);
    await expect(label(page)).toHaveCount(1);
    // Off the chart (the page below it).
    await page.touchscreen.tap(5, 790);
    await expect(label(page)).toHaveCount(0);
  });

  test('a double tap resets the zoom', async ({ page }) => {
    await callChart(page, 'relayout', { 'xaxis.range': [2, 4], 'yaxis.range': [20, 40] });
    await events(page, true);
    const p = await toPage(page, 3, 25);
    await page.touchscreen.tap(p.x, p.y);
    await page.touchscreen.tap(p.x + 6, p.y + 4);
    await waitForEvent(page, 'doubleclick');
    await expect.poll(async () => (await ranges(page)).x).toEqual([-1, 10]);
  });

  test('pinch zooms around the fingers’ midpoint and commits one relayout', async ({ page }) => {
    // Fingers 2 units apart around (4, 40), spread to 4 units: half the span around 4 and 40.
    const a = await toPage(page, 3, 40);
    const b = await toPage(page, 5, 40);
    const a2 = await toPage(page, 2, 40);
    const b2 = await toPage(page, 6, 40);
    await touchGesture(page, [
      [a, a2],
      [b, b2],
    ]);
    const relayout = await waitForEvent(page, 'relayout');
    const e = relayout.payload as Record<string, number>;
    expect(e['xaxis.range[0]']).toBeCloseTo(1.5, 1);
    expect(e['xaxis.range[1]']).toBeCloseTo(7, 1);
    expect(e['yaxis.range[0]']).toBeCloseTo(15, 0);
    expect(e['yaxis.range[1]']).toBeCloseTo(70, 0);
    const all = await names(page);
    expect(all).toContain('relayouting');
    expect(all.filter((n) => n === 'relayout')).toHaveLength(1);
    expect(all).not.toContain('click');
  });

  test('two fingers moving together pan', async ({ page }) => {
    const a = await toPage(page, 3, 30);
    const b = await toPage(page, 5, 50);
    const a2 = await toPage(page, 4, 40);
    const b2 = await toPage(page, 6, 60);
    await touchGesture(page, [
      [a, a2],
      [b, b2],
    ]);
    await waitForEvent(page, 'relayout');
    const r = await ranges(page);
    expect(r.x[0]).toBeCloseTo(-2, 1);
    expect(r.x[1]).toBeCloseTo(9, 1);
    expect(r.y[0]).toBeCloseTo(-20, 0);
    expect(r.y[1]).toBeCloseTo(90, 0);
  });

  test('lifting one finger of a pinch ends it; the other finger does nothing', async ({ page }) => {
    const a = await toPage(page, 3, 40);
    const b = await toPage(page, 5, 40);
    const a2 = await toPage(page, 2, 40);
    const b2 = await toPage(page, 6, 40);
    await touchGesture(
      page,
      [
        [a, a2],
        [b, b2],
      ],
      { liftOneByOne: true },
    );
    await waitForEvent(page, 'relayout');
    expect((await names(page)).filter((n) => n === 'relayout' || n === 'click')).toEqual([
      'relayout',
    ]);
  });

  test('zoom mode: a sideways swipe draws the zoom box, a vertical one is left to the page', async ({
    page,
  }) => {
    expect(await touchAction(page)).toBe('pan-y');
    // Starts vertically: the browser takes it (page scroll), no zoom.
    const v0 = await toPage(page, 2, 20);
    await touchGesture(page, [[v0, { x: v0.x + 4, y: v0.y - 60 }, await toPage(page, 6, 80)]]);
    await page.waitForTimeout(300);
    expect(await names(page)).not.toContain('relayout');
    // Starts sideways: a zoom box, even though it then goes up.
    const h0 = await toPage(page, 2, 20);
    await touchGesture(page, [[h0, { x: h0.x + 60, y: h0.y - 4 }, await toPage(page, 6, 80)]]);
    const relayout = await waitForEvent(page, 'relayout');
    const e = relayout.payload as Record<string, number>;
    expect(e['xaxis.range[0]']).toBeCloseTo(2, 1);
    expect(e['xaxis.range[1]']).toBeCloseTo(6, 1);
    expect(e['yaxis.range[0]']).toBeCloseTo(20, 0);
    expect(e['yaxis.range[1]']).toBeCloseTo(80, 0);
  });

  test('the page scrolls over the chart in zoom mode, not in pan mode', async ({ page }) => {
    await page.evaluate(() => {
      document.body.style.minHeight = '3000px';
    });
    const p = await toPage(page, 4, 40);
    const swipeUp = () => touchGesture(page, [[p, { x: p.x, y: p.y - 150 }]], { steps: 10 });
    await swipeUp();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await names(page)).toEqual([]);

    // Let the fling settle (the scroll position unchanged for ~0.5 s: a fling can pause between
    // frames on a loaded machine and then carry on), then back to the top and still there.
    await scrollSettled(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await scrollSettled(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await callChart(page, 'setDragmode', 'pan');
    expect(await touchAction(page)).toBe('none');
    // The compositor picks the new touch-action up with the next frame.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const q = await toPage(page, 4, 40);
    await touchGesture(page, [[q, { x: q.x, y: q.y - 150 }]], { steps: 10 });
    await waitForEvent(page, 'relayout');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // Panned: the data follows the finger up, so lower values come into view.
    const r = await ranges(page);
    expect(r.y[0]).toBeLessThan(-10);
  });

  test('touch-action follows the dragmode', async ({ page }) => {
    expect(await touchAction(page)).toBe('pan-y');
    await callChart(page, 'setDragmode', 'select');
    expect(await touchAction(page)).toBe('none');
    await callChart(page, 'relayout', { dragmode: false });
    expect(await touchAction(page)).toBe('manipulation');
  });

  test('select mode: a one-finger drag selects', async ({ page }) => {
    await callChart(page, 'setDragmode', 'select');
    await events(page, true);
    const from = await toPage(page, 1.5, 0);
    const to = await toPage(page, 4.5, 50);
    await touchGesture(page, [[from, to]]);
    const selected = await waitForEvent(page, 'selected');
    const points = selected.payload.points ?? [];
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((pt) => (pt.x as number) >= 2 && (pt.x as number) <= 4)).toBe(true);
  });
});

test('sankey: a node drags with one finger that starts sideways', async ({ page }) => {
  await openInteraction(page, '_dev/sankey-drag');
  await events(page, true);
  // Node A (x 60–80, y 60–228) to the bottom of its column (see sankey.spec.ts).
  const p0 = await at(page, 70, 144);
  const p1 = await at(page, 100, 146);
  const p2 = await at(page, 150, 300);
  await touchGesture(page, [[p0, p1, p2]]);
  const restyled = await waitForEvent(page, 'restyle');
  expect(Object.keys((restyled.payload as { update: object }).update)).toEqual([
    'node.x',
    'node.y',
  ]);
});

test('treemap: a tap drills into a tile', async ({ page }) => {
  await openInteraction(page, '_dev/interaction-treemap');
  await events(page, true);
  // Seth's header (see treemap.spec.ts).
  const p = await at(page, 240, 50);
  await page.touchscreen.tap(p.x, p.y);
  const drill = await waitForEvent(page, 'treemapclick');
  expect(drill.payload).toMatchObject({ nextLevel: 'Seth' });
  await expect.poll(() => level(page)).toBe('Seth');
});
