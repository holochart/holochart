import { expect, test, type Page } from '@playwright/test';
import { dragBetween, events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Range slider and range selector (plan E5.9) on `_dev/rangeslider-timeseries` (daily data
 * 2023-01-01 … 2024-12-30, x range 2024-07-01 … 2024-12-31, buttons 1m / 6m / YTD / 1y / all) and
 * `_dev/rangeslider-rangebreaks` (trading days only, weekends and holidays broken out): dragging
 * the window pans with live `relayouting` previews and one `relayout` at the end, dragging an end
 * zooms, a click beside the window centers it, and the selector buttons set Plotly's ranges and
 * track the active one.
 */
const SERIES = '_dev/rangeslider-timeseries';
const BREAKS = '_dev/rangeslider-rangebreaks';
const DAY = 86_400_000;

interface SliderInfo {
  /** The slider (the thumbnail viewport) in page px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Linear ranges of the slider and of the axis in view. */
  range: [number, number];
  view: [number, number];
}

async function slider(page: Page): Promise<SliderInfo> {
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
    const axis = chart.axes.get('x');
    if (!axis) throw new Error('no x axis');
    const rs = chart.fullLayout.xaxis.rangeslider.range;
    return {
      x: box.left + vp.rect.x,
      y: box.top + vp.rect.y,
      width: vp.rect.width,
      height: vp.rect.height,
      range: [axis.scale.r2l(rs[0]), axis.scale.r2l(rs[1])],
      view: [axis.scale.range[0] as number, axis.scale.range[1] as number],
    };
  });
}

/** Page x of a linear coordinate on the slider. */
function sliderX(s: SliderInfo, l: number): number {
  return s.x + ((l - s.range[0]) / (s.range[1] - s.range[0])) * s.width;
}

function ms(v: unknown): number {
  return typeof v === 'number' ? v : Date.parse(`${String(v).replace(' ', 'T')}Z`);
}

async function count(page: Page, name: string): Promise<number> {
  return (await events(page)).filter((e) => e.name === name).length;
}

async function inputRange(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as { __interaction: { chart: { layout: Record<string, unknown> } } }
    ).__interaction;
    return JSON.parse(
      JSON.stringify((hook.chart.layout['xaxis'] as Record<string, unknown>)['range']),
    ) as unknown;
  });
}

test.describe('range slider', () => {
  test('the slider spans all the data and its window is the range in view', async ({ page }) => {
    await openInteraction(page, SERIES);
    const s = await slider(page);
    expect(s.range[0]).toBeLessThanOrEqual(Date.parse('2023-01-01'));
    expect(s.range[1]).toBeGreaterThanOrEqual(Date.parse('2024-12-30'));
    expect(s.view).toEqual([Date.parse('2024-07-01'), Date.parse('2024-12-31')]);
    expect(s.height).toBeGreaterThan(20);
  });

  test('dragging the window pans: previews while moving, one relayout at the end', async ({
    page,
  }) => {
    await openInteraction(page, SERIES);
    const s = await slider(page);
    const cy = s.y + s.height / 2;
    const mid = sliderX(s, (s.view[0] + s.view[1]) / 2);
    await events(page, true);
    await dragBetween(page, { x: mid, y: cy }, { x: mid - 120, y: cy }, 10);
    const relayout = await waitForEvent(page, 'relayout');
    expect(Object.keys(relayout.payload).sort()).toEqual(['xaxis.range[0]', 'xaxis.range[1]']);
    const r0 = ms(relayout.payload['xaxis.range[0]']);
    const r1 = ms(relayout.payload['xaxis.range[1]']);
    const shift = (120 / s.width) * (s.range[1] - s.range[0]);
    // The window keeps its width and moves by the dragged distance.
    expect(Math.abs(r1 - r0 - (s.view[1] - s.view[0]))).toBeLessThan(DAY);
    expect(Math.abs(s.view[0] - r0 - shift)).toBeLessThan(2 * DAY);
    expect(await count(page, 'relayouting')).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    expect(await count(page, 'relayout')).toBe(1);
    const after = await slider(page);
    expect(Math.abs(after.view[0] - r0)).toBeLessThan(1);
    expect(ms(((await inputRange(page)) as unknown[])[0])).toBeCloseTo(r0, -3);
  });

  test("dragging the window's end zooms", async ({ page }) => {
    await openInteraction(page, SERIES);
    const s = await slider(page);
    const cy = s.y + s.height / 2;
    const left = sliderX(s, s.view[0]);
    await events(page, true);
    await dragBetween(page, { x: left, y: cy }, { x: left - 80, y: cy }, 8);
    const relayout = await waitForEvent(page, 'relayout');
    const r0 = ms(relayout.payload['xaxis.range[0]']);
    const r1 = ms(relayout.payload['xaxis.range[1]']);
    expect(Math.abs(r1 - s.view[1])).toBeLessThan(1);
    const expected = s.view[0] - (80 / s.width) * (s.range[1] - s.range[0]);
    expect(Math.abs(r0 - expected)).toBeLessThan(2 * DAY);
  });

  test('a click beside the window centers the window there', async ({ page }) => {
    await openInteraction(page, SERIES);
    const s = await slider(page);
    const at = Date.parse('2023-06-01');
    await events(page, true);
    await page.mouse.click(sliderX(s, at), s.y + s.height / 2);
    const relayout = await waitForEvent(page, 'relayout');
    const r0 = ms(relayout.payload['xaxis.range[0]']);
    const r1 = ms(relayout.payload['xaxis.range[1]']);
    expect(Math.abs((r0 + r1) / 2 - at)).toBeLessThan(2 * DAY);
    expect(Math.abs(r1 - r0 - (s.view[1] - s.view[0]))).toBeLessThan(DAY);
    await page.waitForTimeout(300);
    expect(await count(page, 'relayout')).toBe(1);
    expect(await count(page, 'doubleclick')).toBe(0);
  });

  test('range breaks: the window drags in trading time and commits valid dates', async ({
    page,
  }) => {
    await openInteraction(page, BREAKS);
    const s = await slider(page);
    const cy = s.y + s.height / 2;
    const mid = sliderX(s, (s.view[0] + s.view[1]) / 2);
    await events(page, true);
    await dragBetween(page, { x: mid, y: cy }, { x: mid - 100, y: cy }, 8);
    const relayout = await waitForEvent(page, 'relayout');
    const r0 = relayout.payload['xaxis.range[0]'];
    const r1 = relayout.payload['xaxis.range[1]'];
    expect(typeof r0).toBe('string');
    expect(Number.isFinite(ms(r0))).toBe(true);
    expect(ms(r0)).toBeLessThan(Date.parse('2024-04-01'));
    const after = await slider(page);
    // Linear (compressed) width is kept: the window moved without changing size.
    expect(Math.abs(after.view[1] - after.view[0] - (s.view[1] - s.view[0]))).toBeLessThan(
      (s.range[1] - s.range[0]) / s.width,
    );
    expect(ms(r1)).toBeGreaterThan(ms(r0));
  });
});

test.describe('range selector', () => {
  async function pressed(page: Page): Promise<string[]> {
    return page
      .locator('.hc-rangeselector button[aria-pressed="true"]')
      .evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
  }

  test('buttons set Plotly ranges back from the range end and track the active one', async ({
    page,
  }) => {
    await openInteraction(page, SERIES);
    expect(await pressed(page)).toEqual(['6m']);

    await events(page, true);
    await page.getByRole('button', { name: /^1m/ }).click();
    let relayout = await waitForEvent(page, 'relayout');
    expect(ms(relayout.payload['xaxis.range[0]'])).toBe(Date.parse('2024-12-01'));
    expect(ms(relayout.payload['xaxis.range[1]'])).toBe(Date.parse('2024-12-31'));
    await expect.poll(() => pressed(page)).toEqual(['1m']);

    await events(page, true);
    await page.getByRole('button', { name: /^YTD/ }).click();
    relayout = await waitForEvent(page, 'relayout');
    expect(ms(relayout.payload['xaxis.range[0]'])).toBe(Date.parse('2024-01-01'));
    await expect.poll(() => pressed(page)).toEqual(['YTD']);

    await events(page, true);
    await page.getByRole('button', { name: /^all/i }).click();
    relayout = await waitForEvent(page, 'relayout');
    expect(relayout.payload['xaxis.autorange']).toBe(true);
    await expect.poll(() => pressed(page)).toEqual(['all']);
    const s = await slider(page);
    // Autorange shows everything: the window covers the whole slider.
    expect(Math.abs(s.view[0] - s.range[0])).toBeLessThan(DAY);
    expect(Math.abs(s.view[1] - s.range[1])).toBeLessThan(DAY);
  });

  test('buttons are keyboard operable and never start a zoom', async ({ page }) => {
    await openInteraction(page, SERIES);
    await events(page, true);
    const button = page.getByRole('button', { name: /^1y/ });
    await button.focus();
    await page.keyboard.press('Enter');
    const relayout = await waitForEvent(page, 'relayout');
    expect(ms(relayout.payload['xaxis.range[0]'])).toBe(Date.parse('2023-12-31'));
    await page.waitForTimeout(200);
    expect(await count(page, 'relayouting')).toBe(0);
    expect(await count(page, 'relayout')).toBe(1);
  });
});
