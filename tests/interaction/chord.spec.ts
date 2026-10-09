import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Chord pointer scenarios on `_dev/interaction-chord` (backlog G8): hovering a node arc labels
 * its flows, highlights its ribbons and dims the others; hovering a ribbon labels its two ends
 * and highlights it alone; clicks on arcs and ribbons emit `click` with the node or link index.
 *
 * The example: 480×480 px, the ring centered on (240, 240), node arcs between radii 180 and 200
 * and ribbons inside radius 178. Arcs clockwise from 12 o'clock: A 0°–112.5°, B 112.5°–202.5°,
 * C 202.5°–270°, D 270°–360°. Links A → B (3), B → C (1), C → D (2), D → A (2).
 */
const EXAMPLE = '_dev/interaction-chord';
const CENTER = 240;

/** Ribbon alphas: as drawn, while highlighted (a quarter more opaque) and while dimmed. */
const BASE = 0.6;
const LIT = 0.85;
const DIMMED = 0.09;

interface Box {
  left: number;
  top: number;
}

async function canvasBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
      }
    ).__interaction;
    const r = hook.chart.three.root.canvas.getBoundingClientRect();
    return { left: r.left, top: r.top };
  });
}

/** Page coordinates of the point `degrees` clockwise from 12 o'clock at `radius` px. */
function onRing(box: Box, degrees: number, radius: number): { x: number; y: number } {
  const a = (degrees * Math.PI) / 180;
  return {
    x: box.left + CENTER + radius * Math.sin(a),
    y: box.top + CENTER - radius * Math.cos(a),
  };
}

/** How many vertices of the trace's first primitive (the ribbons' fill) are at `alpha`. */
async function verticesAtAlpha(page: Page, alpha: number): Promise<number> {
  return page.evaluate((a) => {
    const hook = (
      window as unknown as {
        __interaction: {
          chart: {
            getTraceObjects(i: number): {
              geometry?: { attributes?: Record<string, { array: ArrayLike<number> }> };
            }[];
          };
        };
      }
    ).__interaction;
    const colors = hook.chart.getTraceObjects(0)[0]?.geometry?.attributes?.['aColor']?.array;
    let n = 0;
    if (colors) for (let i = 3; i < colors.length; i += 4) if (Math.abs(colors[i]! - a) < 1e-3) n++;
    return n;
  }, alpha);
}

async function hoverAt(page: Page, p: { x: number; y: number }): Promise<void> {
  await page.mouse.move(p.x - 8, p.y);
  await page.mouse.move(p.x, p.y, { steps: 4 });
}

test.describe('chord interaction', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
    // The ribbons' fill loads on first use.
    await expect.poll(() => verticesAtAlpha(page, BASE)).toBeGreaterThan(0);
    await events(page, true);
  });

  test('hovering a node arc labels it, highlights its ribbons and dims the rest', async ({
    page,
  }) => {
    const box = await canvasBox(page);
    const all = await verticesAtAlpha(page, BASE);
    expect(await verticesAtAlpha(page, LIT)).toBe(0);
    // The middle of arc A.
    await hoverAt(page, onRing(box, 56, 190));
    const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
    await expect(label.first()).toBeVisible();
    await expect(label.first()).toContainText('A');
    await expect(label.first()).toContainText('Outgoing: 3');
    await expect(label.first()).toContainText('Incoming: 2');
    await expect(label.first()).toContainText('Share: 31.3%');
    const hover = await waitForEvent(page, 'hover');
    expect(hover.payload.points).toHaveLength(1);
    expect(hover.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 0,
      kind: 'node',
      label: 'A',
      value: 5,
      out: 3,
      in: 2,
    });
    // A's two ribbons (A → B, D → A) are lit, the other two dimmed, none as before.
    await expect.poll(() => verticesAtAlpha(page, LIT)).toBeGreaterThan(0);
    const lit = await verticesAtAlpha(page, LIT);
    const dimmed = await verticesAtAlpha(page, DIMMED);
    expect(dimmed).toBeGreaterThan(0);
    expect(lit + dimmed).toBe(all);
    // Off the chart: unhover, and every ribbon as it was.
    await page.mouse.move(box.left + 5, box.top + 5);
    await waitForEvent(page, 'unhover');
    await expect.poll(() => verticesAtAlpha(page, BASE)).toBe(all);
    await expect(page.locator('.holochart-hoverlabel').filter({ visible: true })).toHaveCount(0);
  });

  test('hovering a ribbon labels its ends and highlights it alone', async ({ page }) => {
    const box = await canvasBox(page);
    const all = await verticesAtAlpha(page, BASE);
    // Inside A → B: just under the ring, in the middle of its source span (45°–112.5°).
    await hoverAt(page, onRing(box, 79, 150));
    const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
    await expect(label.first()).toContainText('a to b');
    await expect(label.first()).toContainText('A → B');
    await expect(label.first()).toContainText('Share of flow: 37.5%');
    const hover = await waitForEvent(page, 'hover');
    expect(hover.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 0,
      kind: 'link',
      label: 'a to b',
      value: 3,
      source: { pointNumber: 0, label: 'A' },
      target: { pointNumber: 1, label: 'B' },
    });
    await expect.poll(() => verticesAtAlpha(page, LIT)).toBeGreaterThan(0);
    const lit = await verticesAtAlpha(page, LIT);
    // One ribbon of four is lit: fewer vertices than the three dimmed ones together.
    expect(lit).toBeLessThan(all - lit);
    expect(await verticesAtAlpha(page, DIMMED)).toBe(all - lit);
    // On to the ribbon C → D (it enters D between 270° and 315°): a new hover, of another link.
    await events(page, true);
    await hoverAt(page, onRing(box, 292, 150));
    await expect
      .poll(
        async () =>
          (await events(page)).filter((e) => e.name === 'hover').at(-1)?.payload.points?.[0],
      )
      .toMatchObject({ kind: 'link', pointNumber: 2, label: 'c to d' });
  });

  test('clicking an arc or a ribbon emits click with the node or link index', async ({ page }) => {
    const box = await canvasBox(page);
    // Arc C (202.5°–270°).
    const arc = onRing(box, 236, 190);
    await page.mouse.move(arc.x, arc.y);
    await page.mouse.click(arc.x, arc.y);
    const click = await waitForEvent(page, 'click');
    expect(click.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 2,
      kind: 'node',
      label: 'C',
      value: 3,
    });
    await events(page, true);
    // Ribbon D → A, which leaves D between 315° and 360°.
    const ribbon = onRing(box, 337, 150);
    await page.mouse.move(ribbon.x, ribbon.y);
    await page.mouse.click(ribbon.x, ribbon.y);
    const linkClick = await waitForEvent(page, 'click');
    expect(linkClick.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 3,
      kind: 'link',
      label: 'd to a',
      value: 2,
      source: { label: 'D' },
      target: { label: 'A' },
    });
  });
});
