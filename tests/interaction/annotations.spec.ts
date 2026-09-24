import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { dragBetween, events, openInteraction, ranges, toPage, waitForEvent } from './helpers.ts';

const { PNG } = pngjs;

/**
 * Annotation pointer input on `_dev/annotations-interactive` (plan E5.4): drags commit one
 * `relayout` with Plotly's attribute strings (`annotations[i].x`, `.ax`, …), `captureevents`
 * annotations emit `clickannotation`, and `clicktoshow` toggles `visible` on data-point clicks.
 * Drawn positions are checked by sampling the annotations' flat box colors next to their text.
 *
 * The example: one trace at (v, 10·v), v = 0…9, x in [-1, 10], y in [-10, 100], with
 * `edits: { annotationPosition: true, annotationTail: true }` and annotations
 *   0 'drag'     text only at (1, 80), 80×30 px, red
 *   1 'tail'     arrow head at (7, 10), pixel tail (-60, -50), 60×24 px, blue
 *   2 'click me' text only at (1, 40), captureevents
 *   3 'onoff'    hidden, clicktoshow 'onoff' on the point (3, 30), 25 px above it, green
 *   4 'onout'    hidden, clicktoshow 'onout' on the point (6, 60), 25 px above it, purple
 * (colors from the default colorway; the tests sample them, so they must stay flat and opaque)
 */
const EXAMPLE = '_dev/annotations-interactive';

type RGB = readonly [number, number, number];
const RED: RGB = [0xea, 0x2a, 0x37];
const BLUE: RGB = [0x5e, 0x74, 0xd5];
const GREEN: RGB = [0x11, 0x8e, 0x36];
const PURPLE: RGB = [0x99, 0x62, 0xc0];

/** Longer than `config.doubleClickDelay` (300 ms), so two clicks never make a double-click. */
const BETWEEN_CLICKS_MS = 450;

interface Pt {
  x: number;
  y: number;
}

const at = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy });

/** Whether the pixel at a page position has (nearly) the given color. */
async function isColor(page: Page, p: Pt, rgb: RGB): Promise<boolean> {
  const shot = await page.screenshot({
    clip: { x: Math.round(p.x) - 1, y: Math.round(p.y) - 1, width: 3, height: 3 },
  });
  const png = PNG.sync.read(shot);
  const i = (png.width + 1) * 4;
  return rgb.every((c, k) => Math.abs((png.data[i + k] ?? -1) - c) <= 8);
}

/** Move the pointer off the chart so hover state never covers what a screenshot samples. */
async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

/** Wait long enough for any stray event to show up before counting events. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(300);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

/** `chart.layout.annotations[i]` (the input annotation, after relayouts). */
async function inputAnnotation(page: Page, i: number): Promise<Record<string, unknown>> {
  return page.evaluate((index) => {
    const hook = (
      window as unknown as { __interaction: { chart: { layout: Record<string, unknown> } } }
    ).__interaction;
    const list = hook.chart.layout['annotations'] as Record<string, unknown>[];
    return JSON.parse(JSON.stringify(list[index])) as Record<string, unknown>;
  }, i);
}

async function count(page: Page, name: string): Promise<number> {
  return (await events(page)).filter((e) => e.name === name).length;
}

/** Back to the initial axis ranges (and wait for that relayout). */
async function callReset(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const chart = (
      window as unknown as { __interaction: { chart: { resetAxes(): Promise<unknown> } } }
    ).__interaction.chart;
    await chart.resetAxes();
  });
  await expect.poll(async () => ranges(page)).toEqual({ x: [-1, 10], y: [-10, 100] });
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('dragging a text-only annotation commits one relayout with its new data position', async ({
  page,
}) => {
  const from = await toPage(page, 1, 80);
  const to = await toPage(page, 3, 90);
  await parkPointer(page);
  expect(await isColor(page, at(from, -30, 0), RED)).toBe(true);

  await events(page, true);
  await dragBetween(page, from, to);
  const relayout = await waitForEvent(page, 'relayout');
  expect(Object.keys(relayout.payload).sort()).toEqual(['annotations[0].x', 'annotations[0].y']);
  expect(relayout.payload['annotations[0].x']).toBeCloseTo(3, 1);
  expect(relayout.payload['annotations[0].y']).toBeCloseTo(90, 0);

  await settle(page);
  expect(await count(page, 'relayout')).toBe(1);
  expect(await count(page, 'relayouting')).toBe(0);
  expect(await count(page, 'click')).toBe(0);
  // The drag moved the annotation, not the view.
  expect(await ranges(page)).toEqual({ x: [-1, 10], y: [-10, 100] });
  const input = await inputAnnotation(page, 0);
  expect(input['x']).toBeCloseTo(3, 1);
  expect(input['y']).toBeCloseTo(90, 0);

  await parkPointer(page);
  await expect.poll(() => isColor(page, at(to, -30, 0), RED)).toBe(true);
  expect(await isColor(page, at(from, -30, 0), RED)).toBe(false);
});

test('dragging the text of an arrow annotation moves its tail (ax / ay)', async ({ page }) => {
  const head = await toPage(page, 7, 10);
  const text = at(head, -60, -50);
  const moved = at(text, 40, 20);
  await parkPointer(page);
  expect(await isColor(page, at(text, -25, 0), BLUE)).toBe(true);

  await events(page, true);
  await dragBetween(page, text, moved);
  const relayout = await waitForEvent(page, 'relayout');
  expect(Object.keys(relayout.payload).sort()).toEqual(['annotations[1].ax', 'annotations[1].ay']);
  // Pixel tails: offsets from the head in px (y down), like Plotly.
  expect(relayout.payload['annotations[1].ax']).toBeCloseTo(-20, 0);
  expect(relayout.payload['annotations[1].ay']).toBeCloseTo(-30, 0);

  await settle(page);
  expect(await count(page, 'relayout')).toBe(1);
  const input = await inputAnnotation(page, 1);
  expect(input).toMatchObject({ x: 7, y: 10 });
  expect(input['ax']).toBeCloseTo(-20, 0);

  await parkPointer(page);
  await expect.poll(() => isColor(page, at(moved, -25, 0), BLUE)).toBe(true);
  expect(await isColor(page, at(text, -25, 0), BLUE)).toBe(false);
});

test('dragging the arrow head moves the anchor (x / y); the pixel tail follows', async ({
  page,
}) => {
  const head = await toPage(page, 7, 10);
  const to = await toPage(page, 8, 20);
  await events(page, true);
  await dragBetween(page, head, to);
  const relayout = await waitForEvent(page, 'relayout');
  expect(Object.keys(relayout.payload).sort()).toEqual(['annotations[1].x', 'annotations[1].y']);
  expect(relayout.payload['annotations[1].x']).toBeCloseTo(8, 1);
  expect(relayout.payload['annotations[1].y']).toBeCloseTo(20, 0);
  await settle(page);
  expect(await count(page, 'relayout')).toBe(1);

  await parkPointer(page);
  await expect.poll(() => isColor(page, at(to, -60 - 25, -50), BLUE)).toBe(true);
});

test('clicking a captureevents annotation emits clickannotation', async ({ page }) => {
  const p = await toPage(page, 1, 40);
  await events(page, true);
  await page.mouse.click(p.x, p.y);
  const click = await waitForEvent(page, 'clickannotation');
  expect(click.payload['index']).toBe(2);
  // plotly.js: `annotation` is the input object, `fullAnnotation` the defaulted one.
  expect(click.payload['annotation']).toEqual({
    x: 1,
    y: 40,
    text: 'click me',
    showarrow: false,
    captureevents: true,
    bgcolor: '#cc540a',
    font: { color: '#ffffff' },
  });
  // The font the annotation inherits from the layout (the default template sets family and size).
  const layoutFont = await page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { fullLayout: { font: { family: string; size: number } } } };
      }
    ).__interaction;
    const { family, size } = hook.chart.fullLayout.font;
    return { family, size };
  });
  expect(click.payload['fullAnnotation']).toMatchObject({
    _index: 2,
    x: 1,
    y: 40,
    text: 'click me',
    visible: true,
    showarrow: false,
    captureevents: true,
    xref: 'x',
    yref: 'y',
    // Colors come back normalized (`rgb(…)`), so only compare the rest of the font.
    font: layoutFont,
  });

  await settle(page);
  expect(await count(page, 'clickannotation')).toBe(1);
  // The annotation took the click: no data click, and a click without movement edits nothing.
  expect(await count(page, 'click')).toBe(0);
  expect(await count(page, 'relayout')).toBe(0);
});

test('config.editable enables drags unless edits opts out; other drags reach the chart', async ({
  page,
}) => {
  // `editable` alone allows every edit; an explicit `edits.annotationTail: false` opts out.
  await page.evaluate(async () => {
    const chart = (
      window as unknown as {
        __interaction: {
          chart: {
            data: readonly unknown[];
            layout: Record<string, unknown>;
            react(figure: unknown): Promise<unknown>;
          };
        };
      }
    ).__interaction.chart;
    await chart.react({
      data: chart.data,
      layout: chart.layout,
      config: { editable: true, edits: { annotationTail: false } },
    });
  });

  await events(page, true);
  const text = at(await toPage(page, 7, 10), -60, -50);
  await dragBetween(page, text, at(text, 40, 20));
  const zoom = await waitForEvent(page, 'relayout');
  expect(Object.keys(zoom.payload).some((k) => k.startsWith('annotations'))).toBe(false);
  expect(zoom.payload['xaxis.range[0]']).toBeDefined();

  await callReset(page);
  await events(page, true);
  await dragBetween(page, await toPage(page, 1, 80), await toPage(page, 3, 90));
  const moved = await waitForEvent(page, 'relayout');
  expect(Object.keys(moved.payload).sort()).toEqual(['annotations[0].x', 'annotations[0].y']);
});

test("clicktoshow 'onoff' toggles the annotation on clicks on its point", async ({ page }) => {
  const point = await toPage(page, 3, 30);
  const box = at(point, -25, -25);
  await parkPointer(page);
  expect(await isColor(page, box, GREEN)).toBe(false);

  await events(page, true);
  await page.mouse.click(point.x, point.y);
  const shown = await waitForEvent(page, 'relayout');
  expect(shown.payload).toEqual({ 'annotations[3].visible': true });
  expect((await waitForEvent(page, 'click')).payload.points?.[0]).toMatchObject({ x: 3, y: 30 });
  expect((await inputAnnotation(page, 3))['visible']).toBe(true);
  await parkPointer(page);
  await expect.poll(() => isColor(page, box, GREEN)).toBe(true);

  await page.waitForTimeout(BETWEEN_CLICKS_MS);
  await events(page, true);
  await page.mouse.click(point.x, point.y);
  const hidden = await waitForEvent(page, 'relayout');
  expect(hidden.payload).toEqual({ 'annotations[3].visible': false });
  await parkPointer(page);
  await expect.poll(() => isColor(page, box, GREEN)).toBe(false);

  // A click on another point leaves an 'onoff' annotation alone.
  await page.waitForTimeout(BETWEEN_CLICKS_MS);
  await events(page, true);
  const other = await toPage(page, 5, 50);
  await page.mouse.click(other.x, other.y);
  await waitForEvent(page, 'click');
  await settle(page);
  expect(await count(page, 'relayout')).toBe(0);
});

test("clicktoshow 'onout' shows on its point and hides on clicks on other points", async ({
  page,
}) => {
  const point = await toPage(page, 6, 60);
  const box = at(point, -25, -25);
  await events(page, true);
  await page.mouse.click(point.x, point.y);
  expect((await waitForEvent(page, 'relayout')).payload).toEqual({
    'annotations[4].visible': true,
  });
  await parkPointer(page);
  await expect.poll(() => isColor(page, box, PURPLE)).toBe(true);

  // The 'onoff' point: shows annotation 3 and, being another point, hides annotation 4.
  await page.waitForTimeout(BETWEEN_CLICKS_MS);
  await events(page, true);
  const onoff = await toPage(page, 3, 30);
  await page.mouse.click(onoff.x, onoff.y);
  expect((await waitForEvent(page, 'relayout')).payload).toEqual({
    'annotations[3].visible': true,
    'annotations[4].visible': false,
  });
  await parkPointer(page);
  await expect.poll(() => isColor(page, box, PURPLE)).toBe(false);
  expect(await isColor(page, at(onoff, -25, -25), GREEN)).toBe(true);
});

// Regression: `Interaction` used to skip pointer capture for gestures a component handles, so a
// release outside the chart was lost and the next gesture ended the drag at the wrong place.
test('releasing an annotation drag outside the chart still commits it', async ({ page }) => {
  const from = await toPage(page, 1, 80);
  await events(page, true);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y, { steps: 4 });
  await page.mouse.move(1000, 700, { steps: 8 });
  await page.mouse.up();
  await waitForEvent(page, 'relayout');
  await settle(page);
  expect(await count(page, 'relayout')).toBe(1);
});
