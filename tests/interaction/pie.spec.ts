import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { events, openInteraction, waitForEvent } from './helpers.ts';

const { PNG } = pngjs;

/**
 * Pie pointer scenarios on `pie/interaction` (plan E9.11, E20.4): hover labels and events per
 * slice, slice clicks, and legend clicks that hide a slice (`layout.hiddenlabels`) and re-flow
 * the others.
 *
 * The example: one pie, labels Alpha … Epsilon with values 40, 25, 15, 12, 8 (already descending,
 * so `sort` keeps the input order), explicit slice colors, `direction: 'clockwise'` from
 * 12 o'clock, `domain.x: [0, 0.6]`, and a legend inside the plot area right of the pie.
 * Slices are located from the public figure (size, margins and the trace's domain): the pie is
 * centered in its domain rect with radius min(width, height) / 2.
 */
const EXAMPLE = 'pie/interaction';

const LABELS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'] as const;
const VALUES = [40, 25, 15, 12, 8] as const;
type RGB = readonly [number, number, number];
/** `marker.colors` of the example, per label. */
const COLORS: Record<(typeof LABELS)[number], RGB> = {
  Alpha: [0xea, 0x2a, 0x37],
  Beta: [0x5e, 0x74, 0xd5],
  Gamma: [0x11, 0x8e, 0x36],
  Delta: [0x99, 0x62, 0xc0],
  Epsilon: [0xcc, 0x54, 0x0a],
};

interface Pt {
  x: number;
  y: number;
}

/** Pie center and radius in page px, and the right edge of its domain. */
interface PieGeometry {
  cx: number;
  cy: number;
  r: number;
  domainRight: number;
  canvas: { left: number; top: number; width: number; height: number };
}

/**
 * The pie's geometry, checked against the rendered pixels: the middle of each slice must show that
 * slice's color. A figure change that moves the pie (e.g. a legend or title that grows the margins)
 * then fails here, with a clear message, instead of as missed hovers and clicks.
 */
async function pieGeometry(page: Page): Promise<PieGeometry> {
  const g = await figureGeometry(page);
  let start = 0;
  const total = VALUES.reduce((a, b) => a + b, 0);
  for (const [i, label] of LABELS.entries()) {
    const span = (VALUES[i]! / total) * 360;
    const p = polar(g, start + span / 2, 0.6);
    start += span;
    const png = PNG.sync.read(
      await page.screenshot({
        clip: { x: Math.round(p.x), y: Math.round(p.y), width: 1, height: 1 },
      }),
    );
    const pixel = [png.data[0], png.data[1], png.data[2]];
    const ok = COLORS[label].every((c, k) => Math.abs((pixel[k] ?? -1) - c) <= 8);
    if (!ok) {
      throw new Error(
        `pie geometry mismatch: ${label} expected at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) ` +
          `but the pixel there is rgb(${pixel.join(', ')}); did the margins or domain change?`,
      );
    }
  }
  return g;
}

/** Pie geometry from the public figure (size, margins, domain). */
async function figureGeometry(page: Page): Promise<PieGeometry> {
  return page.evaluate(() => {
    const chart = (
      window as unknown as {
        __interaction: {
          chart: {
            three: { root: { canvas: HTMLCanvasElement } };
            size: { width: number; height: number };
            fullLayout: { margin: { l: number; r: number; t: number; b: number } } | undefined;
            fullData: readonly { domain?: { x: [number, number]; y: [number, number] } }[];
          };
        };
      }
    ).__interaction.chart;
    const box = chart.three.root.canvas.getBoundingClientRect();
    const m = chart.fullLayout?.margin;
    const domain = chart.fullData[0]?.domain;
    if (!m || !domain) throw new Error('no fullLayout.margin or pie domain');
    // Plot area and domain rect in container px (top-left origin), like the runtime's domainRect.
    const area = {
      x: m.l,
      y: m.t,
      width: chart.size.width - m.l - m.r,
      height: chart.size.height - m.t - m.b,
    };
    const left = area.x + domain.x[0] * area.width;
    const right = area.x + domain.x[1] * area.width;
    const top = area.y + (1 - domain.y[1]) * area.height;
    const bottom = area.y + (1 - domain.y[0]) * area.height;
    return {
      cx: box.left + (left + right) / 2,
      cy: box.top + (top + bottom) / 2,
      r: Math.min(right - left, bottom - top) / 2,
      domainRight: box.left + right,
      canvas: { left: box.left, top: box.top, width: box.width, height: box.height },
    };
  });
}

/**
 * The page point at `angle` degrees clockwise from 12 o'clock and `fraction` of the radius (the
 * example's slices run clockwise from 12 o'clock).
 */
function polar(g: PieGeometry, angle: number, fraction: number): Pt {
  const a = (angle * Math.PI) / 180;
  return { x: g.cx + fraction * g.r * Math.sin(a), y: g.cy - fraction * g.r * Math.cos(a) };
}

/**
 * Center of the pixels of color `rgb` right of the pie's domain: the legend glyph of that label
 * (the legend has no DOM, so find its item by the glyph fill).
 */
async function legendGlyph(page: Page, g: PieGeometry, rgb: RGB): Promise<Pt> {
  const clip = {
    x: Math.ceil(g.domainRight) + 4,
    y: Math.ceil(g.canvas.top),
    width: Math.floor(g.canvas.left + g.canvas.width - g.domainRight) - 8,
    height: Math.floor(g.canvas.height),
  };
  const png = PNG.sync.read(await page.screenshot({ clip }));
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
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

/** Move the pointer off the chart so no hover state is left over. */
async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

/** `chart.layout.hiddenlabels` (the input layout, after relayouts). */
async function hiddenLabels(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as { __interaction: { chart: { layout: Record<string, unknown> } } }
    ).__interaction;
    return JSON.parse(JSON.stringify(hook.chart.layout['hiddenlabels'] ?? null)) as unknown;
  });
}

/** The first point of the latest `hover` event. */
async function lastHover(page: Page): Promise<Record<string, unknown> | undefined> {
  const hovers = (await events(page)).filter((e) => e.name === 'hover');
  return hovers.at(-1)?.payload.points?.[0] as Record<string, unknown> | undefined;
}

const visibleLabel = (page: Page) =>
  page.locator('.holochart-hoverlabel').filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('hovering a slice shows its hovertemplate label and emits hover', async ({ page }) => {
  const g = await pieGeometry(page);
  // Alpha (40 %) spans 0°–144° clockwise from 12 o'clock.
  const p = polar(g, 30, 0.6);
  await events(page, true);
  await page.mouse.move(p.x, p.y);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toHaveLength(1);
  const point = hover.payload.points?.[0] as unknown as Record<string, unknown>;
  expect(point).toMatchObject({ curveNumber: 0, pointNumber: 0, label: 'Alpha', value: 40 });
  expect(point['percent']).toBeCloseTo(0.4, 6);

  const label = visibleLabel(page);
  await expect(label).toHaveCount(1);
  await expect(label).toContainText('Alpha: 40 (40%)');

  // Another slice: Gamma spans 234°–288°.
  const gamma = polar(g, 260, 0.6);
  await page.mouse.move(gamma.x, gamma.y);
  await expect.poll(async () => (await lastHover(page))?.['label']).toBe('Gamma');
  await expect(visibleLabel(page)).toContainText('Gamma: 15 (15%)');

  // Outside the pie: unhover, label gone.
  await page.mouse.move(g.cx, g.cy - g.r - 8);
  await waitForEvent(page, 'unhover');
  await expect(visibleLabel(page)).toHaveCount(0);
});

test('clicking a slice emits click with the slice', async ({ page }) => {
  const g = await pieGeometry(page);
  // Beta (25 %) spans 144°–234°.
  const p = polar(g, 190, 0.6);
  await events(page, true);
  await page.mouse.click(p.x, p.y);
  const click = await waitForEvent(page, 'click');
  expect(click.payload.points?.[0]).toMatchObject({
    curveNumber: 0,
    pointNumber: 1,
    label: 'Beta',
    value: 25,
  });
});

test('a legend click hides the slice via hiddenlabels and the others re-flow', async ({ page }) => {
  const g = await pieGeometry(page);
  const probe = polar(g, 30, 0.6);
  await page.mouse.move(probe.x, probe.y);
  await expect(visibleLabel(page)).toContainText('Alpha');

  await parkPointer(page);
  await expect(visibleLabel(page)).toHaveCount(0);
  const glyph = await legendGlyph(page, g, COLORS.Alpha);
  await events(page, true);
  await page.mouse.click(glyph.x, glyph.y);

  const legendclick = await waitForEvent(page, 'legendclick');
  // plotly.js adds the item's `label` to legend events of pie-like traces.
  expect(legendclick.payload).toMatchObject({ curveNumber: 0, label: 'Alpha' });
  await expect.poll(() => hiddenLabels(page)).toEqual(['Alpha']);

  // Alpha is gone, so the slices re-flow over the visible total (60): Beta now spans 0°–150°
  // and its percent is 25 / 60.
  await events(page, true);
  await page.mouse.move(probe.x, probe.y);
  await expect.poll(() => lastHover(page)).toMatchObject({ label: 'Beta', value: 25 });
  await expect(visibleLabel(page)).toContainText('Beta: 25 (41.7%)');
  await expect(visibleLabel(page)).not.toContainText('Alpha');

  // A second click shows the slice again.
  await parkPointer(page);
  await page.waitForTimeout(450); // longer than config.doubleClickDelay: not a double-click
  await page.mouse.click(glyph.x, glyph.y);
  await expect.poll(async () => (await hiddenLabels(page)) ?? []).toEqual([]);
  await page.mouse.move(probe.x, probe.y);
  await expect(visibleLabel(page)).toContainText('Alpha: 40 (40%)');
});

test('a legend double-click isolates the label', async ({ page }) => {
  const g = await pieGeometry(page);
  const glyph = await legendGlyph(page, g, COLORS.Gamma);
  await events(page, true);
  await page.mouse.dblclick(glyph.x, glyph.y);
  await waitForEvent(page, 'legenddoubleclick');
  await expect
    .poll(async () => ((await hiddenLabels(page)) as string[] | null)?.slice().sort())
    .toEqual(LABELS.filter((l) => l !== 'Gamma').sort());

  // Only Gamma is left: it fills the whole pie at 100 %.
  const p = polar(g, 30, 0.6);
  await page.mouse.move(p.x, p.y);
  await expect(visibleLabel(page)).toContainText(`Gamma: ${VALUES[2]} (100%)`);
});
