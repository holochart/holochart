import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { events, openInteraction, waitForEvent } from './helpers.ts';

const { PNG } = pngjs;

/**
 * The bar-like and pie-like financial traces (plan E12.4, E12.5, E12.6, E20.4):
 *
 * - `waterfall/interaction`: a waterfall (x subplot, left) and a horizontal funnel (x2y2, right).
 *   Hover labels carry Plotly's extra lines — the waterfall's change with ▲ / ▼ and its initial
 *   value, the funnel's three percentages — and hover events carry `initial` / `delta` / `final`
 *   and the percentages. A legend click hides a trace (`visible: 'legendonly'`).
 * - `funnelarea/interaction`: a funnel area in `domain.x: [0, 0.6]` of a 640×400 figure with 20 px
 *   margins (half-width and half-height 180 px around (200, 200)); hover shows pie's lines, and a
 *   legend click hides a stage through `layout.hiddenlabels`, the other stages filling the funnel.
 *
 * The legend has no DOM, so its items are found by their glyph colors outside the traces.
 */

interface Pt {
  x: number;
  y: number;
}

type RGB = readonly [number, number, number];

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

/** Page coordinates of a data point on subplot `id`. */
async function toPageOn(page: Page, id: string, x: unknown, y: unknown): Promise<Pt> {
  return page.evaluate(
    ([sid, dx, dy]) => {
      interface Axis {
        scale: { d2p(v: unknown): number };
      }
      const hook = (
        window as unknown as {
          __interaction: {
            chart: {
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
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const sp = hook.chart.subplots.get(sid as string);
      if (!sp) throw new Error(`no subplot ${String(sid)}`);
      return {
        x: box.left + sp.rect.x + sp.xaxis.scale.d2p(dx),
        y: box.top + sp.rect.y + sp.rect.height - sp.yaxis.scale.d2p(dy),
      };
    },
    [id, x, y] as const,
  );
}

/**
 * Center of the pixels of color `rgb` in the canvas, outside the given boxes (canvas px): a legend
 * glyph of that color.
 */
async function glyphOutside(
  page: Page,
  rgb: RGB,
  exclude: readonly { x: number; y: number; width: number; height: number }[],
): Promise<Pt> {
  const canvas = await page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
      }
    ).__interaction;
    const r = hook.chart.three.root.canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const clip = {
    x: Math.ceil(canvas.left),
    y: Math.ceil(canvas.top),
    width: Math.floor(canvas.width),
    height: Math.floor(canvas.height),
  };
  const png = PNG.sync.read(await page.screenshot({ clip }));
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (
        exclude.some(
          (b) => x >= b.x - 2 && x <= b.x + b.width + 2 && y >= b.y - 2 && y <= b.y + b.height + 2,
        )
      ) {
        continue;
      }
      const i = (y * png.width + x) * 4;
      if (rgb.every((c, k) => Math.abs((png.data[i + k] ?? -1) - c) <= 8)) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n < 9) throw new Error(`no legend glyph of color rgb(${rgb.join(', ')}) found`);
  return { x: clip.x + sx / n, y: clip.y + sy / n };
}

/** The canvas-px rects of every subplot. */
async function subplotRects(page: Page) {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: {
          chart: {
            subplots: Map<
              string,
              { rect: { x: number; y: number; width: number; height: number } }
            >;
          };
        };
      }
    ).__interaction;
    return [...hook.chart.subplots.values()].map((s) => s.rect);
  });
}

/** The first point of the latest `hover` event. */
async function lastHover(page: Page): Promise<Record<string, unknown> | undefined> {
  const hovers = (await events(page)).filter((e) => e.name === 'hover');
  return hovers.at(-1)?.payload.points?.[0] as Record<string, unknown> | undefined;
}

test.describe('waterfall and funnel', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, 'waterfall/interaction');
  });

  test('hovering a waterfall bar shows its total, change and initial value', async ({ page }) => {
    // Costs: −40 from a running total of 80, so the bar spans 40–80.
    const p = await toPageOn(page, 'xy', 'Costs', 60);
    await events(page, true);
    await page.mouse.move(p.x, p.y);
    const hover = await waitForEvent(page, 'hover');
    expect(hover.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 2,
      x: 'Costs',
      y: 40,
      initial: 80,
      delta: -40,
      final: 40,
    });
    const label = labels(page);
    await expect(label).toHaveCount(1);
    await expect(label).toContainText('(Costs, 40)');
    await expect(label).toContainText('(40) ▼');
    await expect(label).toContainText('Initial: 80');

    // The total bar shows only its value.
    const net = await toPageOn(page, 'xy', 'Net', 15);
    await page.mouse.move(net.x, net.y);
    await expect.poll(async () => (await lastHover(page))?.['pointNumber']).toBe(4);
    await expect(labels(page)).toContainText('(Net, 30)');
    await expect(labels(page)).not.toContainText('Initial');
  });

  test('hovering a funnel stage shows its value and the three percentages', async ({ page }) => {
    const p = await toPageOn(page, 'x2y2', 0, 'Sign-ups');
    await events(page, true);
    await page.mouse.move(p.x, p.y);
    await expect.poll(async () => (await lastHover(page))?.['curveNumber']).toBe(1);
    expect(await lastHover(page)).toMatchObject({
      pointNumber: 1,
      x: 200,
      y: 'Sign-ups',
      percentInitial: 0.5,
      percentPrevious: 0.5,
    });
    const label = labels(page);
    await expect(label).toContainText('(200, Sign-ups)');
    await expect(label).toContainText('50% of initial');
    await expect(label).toContainText('50% of previous');
    await expect(label).toContainText('30.8% of total');
  });

  test('a legend click hides the waterfall, a second shows it again', async ({ page }) => {
    await page.mouse.move(2, 2);
    // The waterfall's glyph shows its rising (the default look's emerald) band.
    const glyph = await glyphOutside(page, [0x11, 0x8e, 0x36], await subplotRects(page));
    await events(page, true);
    await page.mouse.click(glyph.x, glyph.y);
    const restyle = await waitForEvent(page, 'restyle');
    expect(restyle.payload).toMatchObject({ update: { visible: ['legendonly'] }, traces: [0] });

    // Nothing to hover where the Costs bar was.
    const p = await toPageOn(page, 'xy', 'Costs', 60);
    await events(page, true);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(300);
    expect(await lastHover(page)).toBeUndefined();

    await page.mouse.move(2, 2);
    await page.waitForTimeout(450); // longer than config.doubleClickDelay: not a double-click
    await page.mouse.click(glyph.x, glyph.y);
    await expect
      .poll(async () => (await events(page)).filter((e) => e.name === 'restyle').length)
      .toBe(1);
    await page.mouse.move(p.x, p.y);
    await expect.poll(async () => (await lastHover(page))?.['pointNumber']).toBe(2);
  });
});

test.describe('funnelarea', () => {
  /**
   * Stage bands of the example, container px (y down): 40, 30, 20, 10 with `baseratio` 0.333 in
   * a 360 px square centered at (200, 200) put the stage edges at y = 20, 126.5, 228.1, 318.5
   * and 380 (areas proportional to the values).
   */
  const MID = { Alpha: 73, Beta: 177, Gamma: 273, Delta: 349 } as const;
  const COLORS: Record<keyof typeof MID, RGB> = {
    Alpha: [0xea, 0x2a, 0x37],
    Beta: [0x5e, 0x74, 0xd5],
    Gamma: [0x11, 0x8e, 0x36],
    Delta: [0xcc, 0x54, 0x0a],
  };

  async function at(page: Page, x: number, y: number): Promise<Pt> {
    const box = await page.evaluate(() => {
      const hook = (
        window as unknown as {
          __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
        }
      ).__interaction;
      const r = hook.chart.three.root.canvas.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    return { x: box.left + x, y: box.top + y };
  }

  async function hiddenLabels(page: Page): Promise<unknown> {
    return page.evaluate(() => {
      const hook = (
        window as unknown as { __interaction: { chart: { layout: Record<string, unknown> } } }
      ).__interaction;
      return JSON.parse(JSON.stringify(hook.chart.layout['hiddenlabels'] ?? null)) as unknown;
    });
  }

  test.beforeEach(async ({ page }) => {
    await openInteraction(page, 'funnelarea/interaction');
  });

  test('stages sit where the geometry says, and hover shows their lines', async ({ page }) => {
    // The rendered colors match the computed stage bands.
    const origin = await at(page, 0, 0);
    for (const [label, y] of Object.entries(MID) as [keyof typeof MID, number][]) {
      const png = PNG.sync.read(
        await page.screenshot({
          clip: { x: origin.x + 199, y: origin.y + y - 1, width: 3, height: 3 },
        }),
      );
      const px = [png.data[16], png.data[17], png.data[18]];
      expect(px.map((c, k) => Math.abs(c! - COLORS[label][k]!)).every((d) => d <= 8)).toBe(true);
    }
    const p = await at(page, 200, MID.Beta);
    await events(page, true);
    await page.mouse.move(p.x, p.y);
    const hover = await waitForEvent(page, 'hover');
    expect(hover.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
      label: 'Beta',
      value: 30,
    });
    await expect(labels(page)).toContainText('Beta');
    await expect(labels(page)).toContainText('30%');

    // Outside the slanted edge: nothing.
    const out = await at(page, 60, MID.Delta);
    await page.mouse.move(out.x, out.y);
    await waitForEvent(page, 'unhover');
    await expect(labels(page)).toHaveCount(0);
  });

  test('a legend click hides a stage and the others fill the funnel', async ({ page }) => {
    await page.mouse.move(2, 2);
    const glyph = await glyphOutside(page, COLORS.Alpha, [
      { x: 20, y: 20, width: 360, height: 360 },
    ]);
    await events(page, true);
    await page.mouse.click(glyph.x, glyph.y);
    const legendclick = await waitForEvent(page, 'legendclick');
    expect(legendclick.payload).toMatchObject({ curveNumber: 0, label: 'Alpha' });
    await expect.poll(() => hiddenLabels(page)).toEqual(['Alpha']);

    // Beta is now the top stage, with 30 of 60.
    const top = await at(page, 200, MID.Alpha);
    await events(page, true);
    await page.mouse.move(top.x, top.y);
    await expect.poll(async () => (await lastHover(page))?.['label']).toBe('Beta');
    await expect(labels(page)).toContainText('50%');
  });
});
