import { expect, test, type Page } from '@playwright/test';
import { dragBetween, events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Sankey pointer scenarios on `_dev/sankey-drag` (plan E13.5b, E20.4): hovering a node highlights
 * its links and labels its flow counts, hovering a link labels its source and target, clicks on
 * nodes and links emit `click`, and dragging a node restyles `node.x` / `node.y` per
 * `arrangement` (`snap` returns the node to its column; `perpendicular` keeps it there;
 * `fixed` does not move it).
 *
 * The example: 640×400 px, domain x 60–580 and y 60–360, 20 px nodes at x = 60 (A: y 60–228,
 * B: 248–360), 310 (C: 280 px tall) and 560 (D: y 60–256, E: 276–360); links A → C, B → C,
 * C → D and C → E.
 */
const EXAMPLE = '_dev/sankey-drag';

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

const at = (box: Box, x: number, y: number) => ({ x: box.left + x, y: box.top + y });

/** Link alphas of the trace's first fill (the link ribbons): how many vertices are at `alpha`. */
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

async function hoverAt(page: Page, box: Box, x: number, y: number): Promise<void> {
  const p = at(box, x, y);
  await page.mouse.move(p.x - 12, p.y);
  await page.mouse.move(p.x, p.y, { steps: 4 });
}

/** `fullData[0].node.{x, y}`. */
async function nodePositions(page: Page): Promise<{ x: number[]; y: number[] }> {
  return page.evaluate(() => {
    const node = (
      window as unknown as {
        __interaction: { chart: { fullData: readonly { node: { x: number[]; y: number[] } }[] } };
      }
    ).__interaction.chart.fullData[0]!.node;
    return { x: [...node.x], y: [...node.y] };
  });
}

async function restyle(page: Page, update: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (u) => {
    const chart = (
      window as unknown as {
        __interaction: { chart: { restyle(u: unknown): Promise<unknown> } };
      }
    ).__interaction.chart;
    await chart.restyle(u);
  }, update);
}

test.describe('sankey interaction', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
    await events(page, true);
  });

  test('hovering a node labels it and highlights its links', async ({ page }) => {
    const box = await canvasBox(page);
    expect(await verticesAtAlpha(page, 0.5)).toBe(0);
    await hoverAt(page, box, 70, 144);
    const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
    await expect(label.first()).toBeVisible();
    await expect(label.first()).toContainText('A');
    await expect(label.first()).toContainText('Outgoing flow count: 1');
    await expect(label.first()).toContainText('6.00');
    const hover = await waitForEvent(page, 'hover');
    expect(hover.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 0,
      label: 'A',
      value: 6,
    });
    // A's one link takes its hover color (the default look's gray at 0.5 instead of 0.3).
    await expect.poll(() => verticesAtAlpha(page, 0.5)).toBeGreaterThan(0);
    await page.mouse.move(box.left + 5, box.top + 5);
    await expect.poll(() => verticesAtAlpha(page, 0.5)).toBe(0);
  });

  test('hovering a link labels its source and target', async ({ page }) => {
    const box = await canvasBox(page);
    // Mid-gap of A → C, near its center line.
    await hoverAt(page, box, 195, 146);
    const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
    await expect(label.first()).toContainText('Source: A');
    await expect(label.first()).toContainText('Target: C');
    const hover = await waitForEvent(page, 'hover');
    expect(hover.payload.points?.[0]).toMatchObject({
      pointNumber: 0,
      label: 'a to c',
      value: 6,
      source: { label: 'A' },
      target: { label: 'C' },
    });
  });

  test('clicking a node or a link emits click', async ({ page }) => {
    const box = await canvasBox(page);
    const node = at(box, 570, 316);
    await page.mouse.move(node.x, node.y);
    await page.mouse.click(node.x, node.y);
    const click = await waitForEvent(page, 'click');
    expect(click.payload.points?.[0]).toMatchObject({ curveNumber: 0, pointNumber: 4, label: 'E' });
    await events(page, true);
    const link = at(box, 195, 146);
    await page.mouse.move(link.x, link.y);
    await page.mouse.click(link.x, link.y);
    const linkClick = await waitForEvent(page, 'click');
    expect(linkClick.payload.points?.[0]).toMatchObject({ pointNumber: 0, label: 'a to c' });
    expect((await events(page)).filter((e) => e.name === 'restyle')).toEqual([]);
  });

  test('dragging a node (snap) restyles node positions, back in its column', async ({ page }) => {
    const box = await canvasBox(page);
    // A (center 70, 144) dragged right and down onto B's place.
    await dragBetween(page, at(box, 70, 144), at(box, 150, 300), 10);
    const restyled = await waitForEvent(page, 'restyle');
    expect(Object.keys((restyled.payload as { update: object }).update)).toEqual([
      'node.x',
      'node.y',
    ]);
    const { x, y } = await nodePositions(page);
    // Snapped back to the first column (center 10 px into the 520 px domain)…
    expect(x[0]).toBeCloseTo(10 / 520, 3);
    // …at the drop height (300 − 60 of 300 px), B pushed above it.
    expect(y[0]).toBeCloseTo(240 / 300, 2);
    expect(y[1]!).toBeLessThan(y[0]!);
  });

  test('perpendicular drags stay in the column; fixed nodes do not move', async ({ page }) => {
    await restyle(page, { arrangement: 'perpendicular' });
    const box = await canvasBox(page);
    // E (center 570, 318) dragged up and left.
    await dragBetween(page, at(box, 570, 318), at(box, 450, 250), 10);
    await waitForEvent(page, 'restyle');
    const { x, y } = await nodePositions(page);
    expect(x[4]).toBeCloseTo(510 / 520, 3);
    expect(y[4]).toBeCloseTo((318 - 68 - 60) / 300, 2);
    await restyle(page, { arrangement: 'fixed' });
    await events(page, true);
    await dragBetween(page, at(box, 70, 144), at(box, 70, 60), 10);
    await page.waitForTimeout(300);
    expect((await events(page)).filter((e) => e.name === 'restyle')).toEqual([]);
  });
});
