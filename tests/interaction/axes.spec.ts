import { expect, test, type Page } from '@playwright/test';
import { dragBetween, events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Linked axes, aspect locks and range breaks under real pointer input (plan E3.8, E3.9, E20.4):
 * a zoom or pan on one axis of a `matches` group moves the others, an x-only zoom box on an
 * aspect-locked subplot zooms y too, and zooming / panning across range breaks commits dates.
 */

interface AxisProbe {
  range: number[];
  length: number;
}

/** Linear ranges and lengths of the given axes. */
async function axes(page: Page, ids: readonly string[]): Promise<Record<string, AxisProbe>> {
  return page.evaluate((list) => {
    const hook = (
      window as unknown as {
        __interaction: {
          chart: {
            axes: Map<string, { scale: { range: readonly number[]; length: number } }>;
          };
        };
      }
    ).__interaction;
    const out: Record<string, { range: number[]; length: number }> = {};
    for (const id of list) {
      const s = hook.chart.axes.get(id)?.scale;
      if (s) out[id] = { range: [...s.range], length: s.length };
    }
    return out;
  }, ids);
}

/** Page position of a fraction `(fx, fy)` of a subplot's plot area (fy from the top). */
async function inSubplot(
  page: Page,
  id: string,
  fx: number,
  fy: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([sid, ax, ay]) => {
      const hook = (
        window as unknown as {
          __interaction: {
            chart: {
              three: { root: { canvas: HTMLCanvasElement } };
              subplots: Map<
                string,
                { rect: { x: number; y: number; width: number; height: number } }
              >;
            };
          };
        }
      ).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const r = hook.chart.subplots.get(sid as string)?.rect;
      if (!r) throw new Error(`no subplot ${String(sid)}`);
      return { x: box.left + r.x + r.width * ax, y: box.top + r.y + r.height * ay };
    },
    [id, fx, fy] as const,
  );
}

const pxPerUnit = (a: AxisProbe): number =>
  Math.abs(a.length / ((a.range[1] as number) - (a.range[0] as number)));

test('a zoom box in one panel zooms every axis of the matches group', async ({ page }) => {
  await openInteraction(page, '_dev/matches-subplots');
  const before = await axes(page, ['x', 'x2', 'x3', 'x4', 'y', 'y4']);
  // All four x axes start with one autorange over every panel's data.
  for (const id of ['x2', 'x3', 'x4']) expect(before[id]?.range).toEqual(before['x']?.range);
  await events(page, true);
  // Zoom box in the bottom-right panel (x4, y4): 20–60% across, 30–70% down.
  await dragBetween(
    page,
    await inSubplot(page, 'x4y4', 0.2, 0.3),
    await inSubplot(page, 'x4y4', 0.6, 0.7),
  );
  const relayout = await waitForEvent(page, 'relayout');
  expect(Object.keys(relayout.payload)).toEqual(
    expect.arrayContaining([
      'xaxis.range[0]',
      'xaxis4.range[0]',
      'yaxis.range[1]',
      'yaxis4.range[1]',
    ]),
  );
  const after = await axes(page, ['x', 'x2', 'x3', 'x4', 'y', 'y2', 'y3', 'y4']);
  const x = after['x']?.range as number[];
  expect((x[1] as number) - (x[0] as number)).toBeLessThan(
    ((before['x']?.range[1] as number) - (before['x']?.range[0] as number)) * 0.5,
  );
  for (const id of ['x2', 'x3', 'x4']) expect(after[id]?.range).toEqual(x);
  for (const id of ['y2', 'y3', 'y4']) expect(after[id]?.range).toEqual(after['y']?.range);

  // A pan in the top-left panel moves them all again.
  await page.evaluate(() =>
    (
      window as unknown as {
        __interaction: { chart: { setDragmode(m: string): Promise<unknown> } };
      }
    ).__interaction.chart.setDragmode('pan'),
  );
  await events(page, true);
  await dragBetween(
    page,
    await inSubplot(page, 'xy', 0.6, 0.5),
    await inSubplot(page, 'xy', 0.4, 0.5),
  );
  await waitForEvent(page, 'relayout');
  const panned = await axes(page, ['x', 'x4']);
  expect(panned['x4']?.range).toEqual(panned['x']?.range);
  expect(panned['x']?.range[0] as number).toBeGreaterThan(x[0] as number);
});

test('an x-only zoom box on an aspect-locked subplot zooms y by the same factor', async ({
  page,
}) => {
  await openInteraction(page, '_dev/scaleanchor-square');
  const before = await axes(page, ['x', 'y']);
  expect(pxPerUnit(before['x'] as AxisProbe)).toBeCloseTo(pxPerUnit(before['y'] as AxisProbe), 3);
  await events(page, true);
  // Thin horizontal drag across the middle half of the left subplot: x only.
  await dragBetween(
    page,
    await inSubplot(page, 'xy', 0.25, 0.5),
    await inSubplot(page, 'xy', 0.75, 0.51),
  );
  await waitForEvent(page, 'relayout');
  const after = await axes(page, ['x', 'y']);
  expect(pxPerUnit(after['x'] as AxisProbe)).toBeCloseTo(pxPerUnit(after['y'] as AxisProbe), 3);
  expect(pxPerUnit(after['y'] as AxisProbe) / pxPerUnit(before['y'] as AxisProbe)).toBeCloseTo(
    2,
    1,
  );
});

test('zoom and pan across range breaks commit dates and keep the matched axis', async ({
  page,
}) => {
  await openInteraction(page, '_dev/rangebreaks-stocks');
  await events(page, true);
  // Box zoom in the price panel over the middle fifth.
  await dragBetween(
    page,
    await inSubplot(page, 'xy', 0.4, 0.2),
    await inSubplot(page, 'xy', 0.6, 0.8),
  );
  const zoom = await waitForEvent(page, 'relayout');
  const r0 = zoom.payload['xaxis.range[0]'];
  const r1 = zoom.payload['xaxis.range[1]'];
  expect(typeof r0).toBe('string');
  expect(String(r0)).toMatch(/^2024-0[2-4]-\d\d/);
  expect(zoom.payload['xaxis2.range[0]']).toBe(r0);
  const zoomed = await axes(page, ['x', 'x2']);
  expect(zoomed['x2']?.range).toEqual(zoomed['x']?.range);
  // The visible span is 20% of the trading days, not of the calendar.
  const span = (r: number[]): number => (r[1] as number) - (r[0] as number);
  expect(Date.parse(String(r1)) - Date.parse(String(r0))).toBeGreaterThanOrEqual(
    span(zoomed['x']?.range as number[]) - 1,
  );

  // Pan by the whole visible width: the view moves by that many trading days.
  await page.evaluate(() =>
    (
      window as unknown as {
        __interaction: { chart: { setDragmode(m: string): Promise<unknown> } };
      }
    ).__interaction.chart.setDragmode('pan'),
  );
  await events(page, true);
  await dragBetween(
    page,
    await inSubplot(page, 'xy', 0.9, 0.5),
    await inSubplot(page, 'xy', 0.1, 0.5),
  );
  await waitForEvent(page, 'relayout');
  const panned = await axes(page, ['x', 'x2']);
  const before = zoomed['x']?.range as number[];
  const after = panned['x']?.range as number[];
  expect(span(after)).toBeCloseTo(span(before), -2);
  expect((after[0] as number) - (before[0] as number)).toBeCloseTo(span(before) * 0.8, -5);
  expect(panned['x2']?.range).toEqual(after);
});
