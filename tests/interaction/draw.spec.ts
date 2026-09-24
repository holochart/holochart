import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { callChart, events, openInteraction, toPage, waitForEvent } from './helpers.ts';

const { PNG } = pngjs;

/**
 * Shape drawing on `_dev/draw-shapes` (plan E5.5, plotly.js draw modes): each draw `dragmode`
 * turns one drag into one GUI `relayout` whose `shapes` list ends with the new shape (in the
 * subplot's data coordinates, `editable: true`, styled by `layout.newshape`); a click on a drawn
 * shape activates it and the `eraseshape` button removes it.
 *
 * The example: x in [0, 10], y in [0, 100], no shapes, `dragmode: 'drawrect'`, new shapes filled
 * `#ea2a37` with a 3 px `#5e74d5` outline, every draw button added to the (always shown) modebar.
 */
const EXAMPLE = '_dev/draw-shapes';

type RGB = readonly [number, number, number];
const RED: RGB = [0xea, 0x2a, 0x37];

interface Shape extends Record<string, unknown> {
  type: string;
  path?: string;
}

/** Whether the pixel at a page position has (nearly) the given color. */
async function isColor(page: Page, p: { x: number; y: number }, rgb: RGB): Promise<boolean> {
  const shot = await page.screenshot({
    clip: { x: Math.round(p.x) - 1, y: Math.round(p.y) - 1, width: 3, height: 3 },
  });
  const png = PNG.sync.read(shot);
  const i = (png.width + 1) * 4;
  return rgb.every((c, k) => Math.abs((png.data[i + k] ?? -1) - c) <= 8);
}

/** Drag through data points (x, y) with the primary button. */
async function drawThrough(page: Page, ...pts: [number, number][]): Promise<void> {
  const first = await toPage(page, ...(pts[0] as [number, number]));
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of pts.slice(1)) {
    const at = await toPage(page, ...p);
    await page.mouse.move(at.x, at.y, { steps: 6 });
  }
  await page.mouse.up();
}

/** The `shapes` of the only `relayout` since the log was cleared. */
async function drawnShapes(page: Page): Promise<Shape[]> {
  await waitForEvent(page, 'relayout');
  // No second relayout follows (the gesture commits once).
  await page.waitForTimeout(200);
  const relayouts = (await events(page)).filter((e) => e.name === 'relayout');
  expect(relayouts).toHaveLength(1);
  const payload = relayouts[0]?.payload as Record<string, unknown>;
  expect(Object.keys(payload).filter((k) => k !== 'event')).toEqual(['shapes']);
  return payload['shapes'] as Shape[];
}

/** `chart.layout[key]` (the input layout, after relayouts). */
async function inputLayout(page: Page, key: string): Promise<unknown> {
  return page.evaluate((k) => {
    const hook = (
      window as unknown as { __interaction: { chart: { layout: Record<string, unknown> } } }
    ).__interaction;
    return JSON.parse(JSON.stringify(hook.chart.layout[k] ?? null)) as unknown;
  }, key);
}

async function setDragmode(page: Page, mode: string): Promise<void> {
  await callChart(page, 'setDragmode', mode);
  await events(page, true);
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
  await events(page, true);
});

test('drawrect: a drag adds one rect in data coordinates with the newshape style', async ({
  page,
}) => {
  await drawThrough(page, [2, 20], [4, 60]);
  const [rect, ...rest] = await drawnShapes(page);
  expect(rest).toEqual([]);
  expect(rect).toMatchObject({
    type: 'rect',
    editable: true,
    xref: 'x',
    yref: 'y',
    layer: 'above',
    opacity: 1,
    fillcolor: 'rgb(234, 42, 55)',
    line: { color: 'rgb(94, 116, 213)', width: 3, dash: 'solid' },
  });
  expect(rect?.['x0']).toBeCloseTo(2, 1);
  expect(rect?.['y0']).toBeCloseTo(20, 0);
  expect(rect?.['x1']).toBeCloseTo(4, 1);
  expect(rect?.['y1']).toBeCloseTo(60, 0);
  // Drawn, and no zoom happened.
  await page.mouse.move(2, 2);
  await expect.poll(async () => isColor(page, await toPage(page, 3, 40), RED)).toBe(true);
  expect(await inputLayout(page, 'xaxis')).toEqual({ range: [0, 10] });
});

test('drawline from the modebar button: one line from start to release', async ({ page }) => {
  await page.click('button[data-button="drawline"]');
  const mode = await waitForEvent(page, 'relayout');
  expect(mode.payload).toMatchObject({ dragmode: 'drawline' });
  await events(page, true);
  await drawThrough(page, [1, 10], [5, 50]);
  const [line] = await drawnShapes(page);
  expect(line).toMatchObject({ type: 'line', editable: true });
  expect([line?.['x0'], line?.['y0'], line?.['x1'], line?.['y1']].map(Number)).toEqual([
    expect.closeTo(1, 1),
    expect.closeTo(10, 0),
    expect.closeTo(5, 1),
    expect.closeTo(50, 0),
  ]);
});

test('drawcircle: an ellipse centred on the start through the release point', async ({ page }) => {
  await setDragmode(page, 'drawcircle');
  await drawThrough(page, [5, 50], [6, 60]);
  const [circle] = await drawnShapes(page);
  expect(circle).toMatchObject({ type: 'circle', fillcolor: 'rgb(234, 42, 55)' });
  const r = Math.SQRT2;
  expect(circle?.['x0']).toBeCloseTo(5 - r, 1);
  expect(circle?.['x1']).toBeCloseTo(5 + r, 1);
  expect(circle?.['y0']).toBeCloseTo(50 - 10 * r, 0);
  expect(circle?.['y1']).toBeCloseTo(50 + 10 * r, 0);
});

test('drawopenpath and drawclosedpath: freeform paths, open ones unfilled', async ({ page }) => {
  await setDragmode(page, 'drawopenpath');
  await drawThrough(page, [1, 10], [3, 40], [5, 20], [7, 60]);
  const [open] = await drawnShapes(page);
  expect(open).toMatchObject({ type: 'path', editable: true });
  expect(open).not.toHaveProperty('fillcolor');
  expect(open?.path).toMatch(/^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+){3,}$/);
  const [x0, y0] = (open?.path ?? '').slice(1).split('L')[0]!.split(',').map(Number);
  expect(x0).toBeCloseTo(1, 1);
  expect(y0).toBeCloseTo(10, 0);

  await setDragmode(page, 'drawclosedpath');
  await drawThrough(page, [6, 10], [9, 10], [8, 40]);
  const shapes = await drawnShapes(page);
  expect(shapes).toHaveLength(2);
  expect(shapes[1]).toMatchObject({ type: 'path', fillcolor: 'rgb(234, 42, 55)' });
  expect(shapes[1]?.path).toMatch(/Z$/);
});

test('a press without a drag stays a click and draws nothing', async ({ page }) => {
  const at = await toPage(page, 5, 50);
  await page.mouse.click(at.x, at.y);
  await waitForEvent(page, 'click');
  await page.waitForTimeout(200);
  expect((await events(page)).filter((e) => e.name === 'relayout')).toHaveLength(0);
});

test('eraseshape removes the shape activated by a click', async ({ page }) => {
  await drawThrough(page, [2, 20], [4, 60]);
  await drawThrough(page, [6, 20], [8, 60]);
  await waitForEvent(page, 'relayout');
  await expect
    .poll(async () => {
      const list = await inputLayout(page, 'shapes');
      return Array.isArray(list) ? list.length : 0;
    })
    .toBe(2);
  // Nothing active yet: erasing does nothing.
  await events(page, true);
  await page.click('button[data-button="eraseshape"]');
  await page.waitForTimeout(200);
  expect(await events(page)).toEqual([]);

  // Activate the first rect (drawn in the activeshape style), then erase it.
  const inside = await toPage(page, 3, 40);
  await page.mouse.click(inside.x, inside.y);
  await page.mouse.move(2, 2);
  await expect.poll(async () => isColor(page, inside, RED)).toBe(false);
  await page.click('button[data-button="eraseshape"]');
  const [left] = await drawnShapes(page);
  expect(left?.['x0']).toBeCloseTo(6, 1);
  await expect.poll(async () => isColor(page, inside, RED)).toBe(false);
  expect(await isColor(page, await toPage(page, 7, 40), RED)).toBe(true);
});

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 800, height: 600 } });

  /** The modebar's computed opacity once its transition settled. */
  async function modebarOpacity(page: Page): Promise<number> {
    return page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>('.hc-modebar');
      return bar ? Number(getComputedStyle(bar).opacity) : NaN;
    });
  }

  test('the modebar shows after a tap on the chart and hides after a tap elsewhere', async ({
    page,
  }) => {
    // The default `displayModeBar: 'hover'`: hidden until the chart is tapped (Plotly shows it on
    // hover; touch has no hover).
    await openInteraction(page, '_dev/interaction-legendgroup');
    await expect.poll(() => modebarOpacity(page)).toBe(0);
    const canvas = await page.locator('canvas').first().boundingBox();
    if (!canvas) throw new Error('no canvas');
    await page.touchscreen.tap(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await expect.poll(() => modebarOpacity(page)).toBe(1);
    // A tap outside the chart hides it again.
    await page.touchscreen.tap(canvas.x + canvas.width / 2, canvas.y + canvas.height + 40);
    await expect.poll(() => modebarOpacity(page)).toBe(0);
  });
});
