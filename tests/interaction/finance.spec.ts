import { expect, test, type Page } from '@playwright/test';
import {
  callChart,
  dragBetween,
  events,
  openInteraction,
  toPage,
  waitForEvent,
} from './helpers.ts';

/**
 * Financial traces (plan E12.2, E12.3, E12.1) on `candlestick/interaction`: ten daily candles from
 * 2024-01-01 to 2024-01-12 with the weekend hidden by range breaks and the default range slider
 * (the y axis is then `fixedrange`, as in Plotly). Hover shows all four prices, unified and split
 * labels work, the range slider pans and zooms in trading time, and a zoom box zooms x only.
 */
const EXAMPLE = 'candlestick/interaction';

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });
const unified = (page: Page) => page.locator('.holochart-hoverlabel-unified');

/** ms of a date at midnight UTC. */
function day(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function ms(v: unknown): number {
  return typeof v === 'number' ? v : Date.parse(`${String(v).replace(' ', 'T')}Z`);
}

/** The range slider thumbnail in page px, with its linear range and the x range in view. */
async function slider(page: Page) {
  return page.evaluate(() => {
    interface Hook {
      chart: {
        three: {
          root: { canvas: HTMLCanvasElement };
          viewports: readonly {
            name: string;
            rect: { x: number; y: number; width: number; height: number };
          }[];
        };
        axes: Map<string, { scale: { range: readonly number[]; r2l(v: unknown): number } }>;
        fullLayout: { xaxis: { rangeslider: { range: unknown[] } } };
      };
    }
    const { chart } = (window as unknown as { __interaction: Hook }).__interaction;
    const box = chart.three.root.canvas.getBoundingClientRect();
    const vp = chart.three.viewports.find((v) => v.name === 'mirror-xy');
    if (!vp) throw new Error('no range slider thumbnail');
    const axis = chart.axes.get('x')!;
    const rs = chart.fullLayout.xaxis.rangeslider.range;
    return {
      x: box.left + vp.rect.x,
      y: box.top + vp.rect.y,
      width: vp.rect.width,
      height: vp.rect.height,
      range: [axis.scale.r2l(rs[0]), axis.scale.r2l(rs[1])] as [number, number],
      view: [axis.scale.range[0]!, axis.scale.range[1]!] as [number, number],
    };
  });
}

async function yRange(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { axes: Map<string, { scale: { range: readonly number[] } }> } };
      }
    ).__interaction;
    return [...(hook.chart.axes.get('y')?.scale.range ?? [])];
  });
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('hovering a candle shows its date and all four prices; events carry them', async ({
  page,
}) => {
  await events(page, true);
  const at = await toPage(page, day('2024-01-03'), 12);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  const text = await labels(page).first().innerText();
  expect(text).toMatch(/Jan 3, 2024\s+open: 11\s+high: 14\s+low: 10\s+close: 13\s+▲/);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toEqual([
    { curveNumber: 0, pointNumber: 2, x: '2024-01-03', open: 11, high: 14, low: 10, close: 13 },
  ]);
  // A falling candle across the weekend break.
  const monday = await toPage(page, day('2024-01-08'), 14);
  await page.mouse.move(monday.x, monday.y);
  await expect(labels(page).first()).toContainText('close: 15');
  const friday = await toPage(page, day('2024-01-05'), 13.5);
  await page.mouse.move(friday.x, friday.y);
  await expect(labels(page).first()).toContainText(/close: 13\s+▼/);
});

test('unified hover names the trace; split labels show one price each', async ({ page }) => {
  await callChart(page, 'relayout', { hovermode: 'x unified' });
  const at = await toPage(page, day('2024-01-03'), 12);
  await page.mouse.move(at.x, at.y);
  await expect(unified(page)).toBeVisible();
  const text = await unified(page).innerText();
  expect(text).toMatch(/Jan 3, 2024\s+ACME : open: 11\s+high: 14\s+low: 10\s+close: 13/);

  await callChart(page, 'relayout', { hovermode: 'closest' });
  await callChart(page, 'restyle', { 'hoverlabel.split': true }, [0]);
  await page.mouse.move(at.x + 1, at.y);
  await expect(labels(page)).toHaveCount(4);
  const all = (await labels(page).allInnerTexts()).join('|');
  for (const part of ['high: 14', 'open: 11', 'close: 13', 'low: 10']) expect(all).toContain(part);
});

test('the range slider zooms and pans in trading time', async ({ page }) => {
  const s = await slider(page);
  const cy = s.y + s.height / 2;
  const x = (l: number) => s.x + ((l - s.range[0]) / (s.range[1] - s.range[0])) * s.width;
  // Drag the window's left end to the right: zoom in on the later days.
  await events(page, true);
  await dragBetween(page, { x: x(s.view[0]), y: cy }, { x: x(s.view[0]) + s.width * 0.4, y: cy });
  let relayout = await waitForEvent(page, 'relayout');
  const start = ms(relayout.payload['xaxis.range[0]']);
  expect(start).toBeGreaterThan(Date.parse('2024-01-03'));
  expect(typeof relayout.payload['xaxis.range[0]']).toBe('string');
  // Drag the (narrower) window back to the left: pan by trading days.
  const zoomed = await slider(page);
  const mid = x((zoomed.view[0] + zoomed.view[1]) / 2);
  await events(page, true);
  await dragBetween(page, { x: mid, y: cy }, { x: mid - s.width * 0.3, y: cy });
  relayout = await waitForEvent(page, 'relayout');
  expect(ms(relayout.payload['xaxis.range[0]'])).toBeLessThan(start);
  const after = await slider(page);
  expect(after.view[1] - after.view[0]).toBeCloseTo(zoomed.view[1] - zoomed.view[0], -3);
  // Hover still finds candles after the transform-only updates.
  const at = await toPage(page, day('2024-01-04'), 13.5);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page).first()).toContainText('open: 13');
});

test('a zoom box zooms x only (y is fixed under the range slider)', async ({ page }) => {
  const y0 = await yRange(page);
  const from = await toPage(page, day('2024-01-03'), 16);
  const to = await toPage(page, day('2024-01-09'), 11);
  await events(page, true);
  await dragBetween(page, from, to);
  const relayout = await waitForEvent(page, 'relayout');
  expect(ms(relayout.payload['xaxis.range[0]'])).toBeCloseTo(Date.parse('2024-01-03'), -7);
  expect(ms(relayout.payload['xaxis.range[1]'])).toBeCloseTo(Date.parse('2024-01-09'), -7);
  expect(Object.keys(relayout.payload).some((k) => k.startsWith('yaxis'))).toBe(false);
  expect(await yRange(page)).toEqual(y0);
});
