import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Spike lines under real pointer input (plan E3.10, E20.4) on `_dev/spikes-hover`: two traces of
 * 40 points; the x axis spikes `across+marker` (dotted, 1 px), the y axis `toaxis` (solid, blue).
 * The example hovers point 23 of trace 0 programmatically once ready.
 */
const EXAMPLE = '_dev/spikes-hover';

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
}

/** Visible spike lines (the dashed/colored ones, not their background lines), container px. */
async function spikes(page: Page): Promise<Line[]> {
  return page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('.holochart-spikelines');
    if (!svg || svg.style.display === 'none') return [];
    return [...svg.querySelectorAll<SVGLineElement>('.holochart-spikeline')]
      .filter((l) => l.style.display !== 'none')
      .map((l) => ({
        x1: Number(l.getAttribute('x1')),
        y1: Number(l.getAttribute('y1')),
        x2: Number(l.getAttribute('x2')),
        y2: Number(l.getAttribute('y2')),
        stroke: l.getAttribute('stroke') ?? '',
      }))
      .filter((_, i) => i % 2 === 1);
  });
}

/** Page position of point `i` of trace `k`, and the canvas origin. */
async function pointAt(page: Page, k: number, i: number) {
  return page.evaluate(
    ([trace, index]) => {
      interface Axis {
        scale: { d2p(v: unknown): number };
      }
      const hook = (
        window as unknown as {
          __interaction: {
            chart: {
              data: { x: number[]; y: number[] }[];
              three: { root: { canvas: HTMLCanvasElement } };
              subplots: Map<
                string,
                {
                  rect: { x: number; y: number; width: number; height: number };
                  xaxis: Axis;
                  yaxis: Axis;
                }
              >;
            };
          };
        }
      ).__interaction;
      const c = hook.chart;
      const box = c.three.root.canvas.getBoundingClientRect();
      const sp = c.subplots.get('xy');
      const t = c.data[trace as number];
      if (!sp || !t) throw new Error('no subplot or trace');
      const x = sp.rect.x + sp.xaxis.scale.d2p(t.x[index as number]);
      const y = sp.rect.y + sp.rect.height - sp.yaxis.scale.d2p(t.y[index as number]);
      return { page: { x: box.left + x, y: box.top + y }, local: { x, y }, rect: sp.rect };
    },
    [k, i] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(undefined)))),
  );
});

test('the programmatic hover shows both spikes at its point', async ({ page }) => {
  const p = await pointAt(page, 0, 23);
  const lines = await spikes(page);
  expect(lines).toHaveLength(2);
  const [h, v] = lines as [Line, Line];
  // y spike: horizontal, from the y axis line to the point.
  expect(h.y1).toBeCloseTo(p.local.y, 0);
  expect(h.x2).toBeCloseTo(p.local.x, 0);
  // x spike: vertical, across the whole plot area.
  expect(v.x1).toBeCloseTo(p.local.x, 0);
  expect(Math.min(v.y1, v.y2)).toBeCloseTo(p.rect.y, 0);
  expect(Math.max(v.y1, v.y2)).toBeCloseTo(p.rect.y + p.rect.height, 0);
  await expect(page.locator('.holochart-spikemarker').filter({ visible: true })).toHaveCount(1);
});

test('spikes appear on hover, follow the pointer and go away on leave', async ({ page }) => {
  await events(page, true);
  const a = await pointAt(page, 0, 5);
  await page.mouse.move(a.page.x + 1, a.page.y);
  await waitForEvent(page, 'hover');
  await expect.poll(async () => (await spikes(page))[1]?.x1 ?? NaN).toBeCloseTo(a.local.x, 0);

  const b = await pointAt(page, 1, 30);
  await page.mouse.move(b.page.x, b.page.y + 1, { steps: 4 });
  await expect.poll(async () => (await spikes(page))[1]?.x1 ?? NaN).toBeCloseTo(b.local.x, 0);
  await expect.poll(async () => (await spikes(page))[0]?.y1 ?? NaN).toBeCloseTo(b.local.y, 0);
  // The y spike keeps its own color.
  expect((await spikes(page))[0]?.stroke).toBe('rgb(94, 116, 213)');

  // Leave the chart: spikes hide with the labels.
  await page.mouse.move(5, 5);
  await waitForEvent(page, 'unhover');
  await expect.poll(async () => (await spikes(page)).length).toBe(0);
});

test("the modebar's spike button turns spikes off and on", async ({ page }) => {
  const a = await pointAt(page, 0, 12);
  await page.mouse.move(a.page.x, a.page.y);
  await expect.poll(async () => (await spikes(page)).length).toBe(2);
  const button = page.locator('.hc-modebar-btn[data-button="toggleSpikelines"]');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(a.page.x + 1, a.page.y);
  await page.mouse.move(a.page.x, a.page.y);
  await waitForEvent(page, 'hover');
  await expect.poll(async () => (await spikes(page)).length).toBe(0);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(a.page.x + 1, a.page.y);
  await expect.poll(async () => (await spikes(page)).length).toBe(2);
});
