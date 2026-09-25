import { expect, test, type Page } from '@playwright/test';
import { dragBetween, events, openInteraction, toPage, waitForEvent } from './helpers.ts';

/**
 * Selections as layout objects (plan E5.12, Plotly 2.13+) on `_dev/selections-rect` (two traces,
 * `dragmode: 'select'`, x in [-1, 11], y in [0, 10], selections: rect x 1–4 × y 2–5.5 and rect
 * x 6.5–9 × y 5.5–8) and `_dev/selections-lasso` (a date-axis scatter with a restored lasso
 * `path`): selections given in the layout select points on load; a box or lasso drag stores its
 * outline in `layout.selections` (one `relayout`, then `selected`); a click activates a selection
 * so it can be moved, its edges resize it; a double-click clears them all.
 */
const RECT = '_dev/selections-rect';
const LASSO = '_dev/selections-lasso';

type Box = [x0: number, x1: number, y0: number, y1: number];

/** Indices of trace `i`'s points inside any of `boxes` (inclusive). */
async function inside(page: Page, i: number, boxes: readonly Box[]): Promise<number[]> {
  return page.evaluate(
    ([index, list]) => {
      const hook = (
        window as unknown as {
          __interaction: { chart: { data: readonly { x: number[]; y: number[] }[] } };
        }
      ).__interaction;
      const t = hook.chart.data[index] as { x: number[]; y: number[] };
      const out: number[] = [];
      t.x.forEach((x, k) => {
        const y = t.y[k] as number;
        if (list.some(([a, b, c, d]) => x >= a && x <= b && y >= c && y <= d)) out.push(k);
      });
      return out;
    },
    [i, boxes] as const,
  );
}

/** `chart.fullData[i].selectedpoints` (the selection in effect), or `null`. */
async function selected(page: Page, i: number): Promise<number[] | null> {
  return page.evaluate((index) => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { fullData: readonly Record<string, unknown>[] } };
      }
    ).__interaction;
    const v = hook.chart.fullData[index]?.['selectedpoints'];
    return Array.isArray(v) ? [...(v as number[])] : null;
  }, i);
}

/** `chart.layout.selections` (the input, after relayouts). */
async function selections(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as { __interaction: { chart: { layout: Record<string, unknown> } } }
    ).__interaction;
    const list = hook.chart.layout['selections'];
    return Array.isArray(list)
      ? (JSON.parse(JSON.stringify(list)) as Record<string, unknown>[])
      : [];
  });
}

async function count(page: Page, name: string): Promise<number> {
  return (await events(page)).filter((e) => e.name === name).length;
}

async function park(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

const RESTORED: Box[] = [
  [1, 4, 2, 5.5],
  [6.5, 9, 5.5, 8],
];

test.describe('box selections', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, RECT);
  });

  test('selections in the layout select the points inside them on load', async ({ page }) => {
    for (const i of [0, 1]) {
      const expected = await inside(page, i, RESTORED);
      expect(expected.length).toBeGreaterThan(5);
      expect(await selected(page, i)).toEqual(expected);
    }
  });

  test('a box drag replaces them: one relayout of selections, then selected', async ({ page }) => {
    await events(page, true);
    await dragBetween(page, await toPage(page, 0, 0.5), await toPage(page, 3, 3));
    const event = await waitForEvent(page, 'selected');
    const list = event.payload['selections'] as Record<string, number | string>[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'rect', xref: 'x', yref: 'y' });
    const s = list[0] as Record<string, number>;
    expect(s['x0']).toBeCloseTo(0, 1);
    expect(s['x1']).toBeCloseTo(3, 1);
    expect(s['y0']).toBeCloseTo(0.5, 1);
    expect(s['y1']).toBeCloseTo(3, 1);
    const relayout = await waitForEvent(page, 'relayout');
    expect(Object.keys(relayout.payload)).toEqual(['selections']);
    expect(await selections(page)).toHaveLength(1);
    const box: Box = [s['x0'] as number, s['x1'] as number, s['y0'] as number, s['y1'] as number];
    await expect.poll(() => selected(page, 0)).toEqual(await inside(page, 0, [box]));
    // Trace B has points only far from the new box: none left selected.
    await expect.poll(() => selected(page, 1)).toEqual(await inside(page, 1, [box]));
  });

  test('shift adds a selection to the others', async ({ page }) => {
    await events(page, true);
    await page.keyboard.down('Shift');
    await dragBetween(page, await toPage(page, 8.5, 1), await toPage(page, 10.5, 3));
    await page.keyboard.up('Shift');
    const event = await waitForEvent(page, 'selected');
    expect(event.payload['selections'] as unknown[]).toHaveLength(3);
    expect(await selections(page)).toHaveLength(3);
  });

  test('a click activates a selection, which then moves with a drag', async ({ page }) => {
    const center = await toPage(page, 2.5, 3.75);
    await page.mouse.click(center.x, center.y);
    await events(page, true);
    await dragBetween(page, center, await toPage(page, 3.5, 4.75));
    const relayout = await waitForEvent(page, 'relayout');
    expect(Object.keys(relayout.payload).sort()).toEqual([
      'selections[0].x0',
      'selections[0].x1',
      'selections[0].y0',
      'selections[0].y1',
    ]);
    expect(relayout.payload['selections[0].x0']).toBeCloseTo(2, 1);
    expect(relayout.payload['selections[0].x1']).toBeCloseTo(5, 1);
    expect(relayout.payload['selections[0].y0']).toBeCloseTo(3, 1);
    expect(relayout.payload['selections[0].y1']).toBeCloseTo(6.5, 1);
    // The selection selects again, and says so.
    const event = await waitForEvent(page, 'selected');
    expect(event.payload['selections'] as unknown[]).toHaveLength(2);
    const p = relayout.payload as Record<string, number>;
    const moved: Box[] = [
      [
        p['selections[0].x0'] as number,
        p['selections[0].x1'] as number,
        p['selections[0].y0'] as number,
        p['selections[0].y1'] as number,
      ],
      RESTORED[1] as Box,
    ];
    await expect.poll(() => selected(page, 0)).toEqual(await inside(page, 0, moved));
    expect(await count(page, 'selecting')).toBe(0);
  });

  test("dragging a box's edge resizes it", async ({ page }) => {
    const edge = await toPage(page, 9, 6.75);
    await events(page, true);
    await dragBetween(page, edge, await toPage(page, 10, 6.75));
    const relayout = await waitForEvent(page, 'relayout');
    expect(relayout.payload['selections[1].x1']).toBeCloseTo(10, 1);
    expect(relayout.payload['selections[1].x0']).toBeCloseTo(6.5, 5);
    expect(relayout.payload['selections[1].y1']).toBeCloseTo(8, 5);
    await expect
      .poll(() => selected(page, 1))
      .toEqual(await inside(page, 1, [RESTORED[0] as Box, [6.5, 10, 5.5, 8]]));
  });

  test('a double-click clears every selection', async ({ page }) => {
    const empty = await toPage(page, 5, 9.5);
    await events(page, true);
    await park(page);
    await page.mouse.dblclick(empty.x, empty.y);
    await waitForEvent(page, 'deselect');
    await expect.poll(() => selections(page)).toEqual([]);
    await expect.poll(() => selected(page, 0)).toBeNull();
    expect(await selected(page, 1)).toBeNull();
  });
});

test.describe('lasso selections', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, LASSO);
  });

  test('a restored path selects the points inside its polygon', async ({ page }) => {
    const expected = await page.evaluate(() => {
      const hook = (
        window as unknown as {
          __interaction: {
            chart: {
              data: readonly { x: string[]; y: number[] }[];
              layout: { selections: { path: string }[] };
            };
          };
        }
      ).__interaction;
      const ms = (v: string): number => Date.parse(`${v.replace(/[ _]/, 'T')}:00Z`);
      const poly = hook.chart.layout.selections[0]!.path.replace(/[MZ]/g, '')
        .split('L')
        .map((p) => p.trim().split(','))
        .map(([x, y]) => [ms(x as string), Number(y)] as const);
      const t = hook.chart.data[0]!;
      const out: number[] = [];
      t.x.forEach((xs, k) => {
        const x = ms(xs);
        const y = t.y[k] as number;
        let inPoly = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i]!;
          const [xj, yj] = poly[j]!;
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inPoly = !inPoly;
        }
        if (inPoly) out.push(k);
      });
      return out;
    });
    expect(expected.length).toBeGreaterThan(10);
    expect(await selected(page, 0)).toEqual(expected);
  });

  test('a lasso drag stores a path selection', async ({ page }) => {
    const a = await toPage(page, '2024-03-01 12:00' as unknown as number, 12);
    const b = await toPage(page, '2024-03-02 12:00' as unknown as number, 20);
    const c = await toPage(page, '2024-03-03 00:00' as unknown as number, 12);
    await events(page, true);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.move(c.x, c.y, { steps: 8 });
    await page.mouse.move(a.x, a.y, { steps: 8 });
    await page.mouse.up();
    const event = await waitForEvent(page, 'selected');
    const list = event.payload['selections'] as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'path', xref: 'x', yref: 'y' });
    const path = String(list[0]?.['path']);
    expect(path).toMatch(/^M2024-03-0\d_\d\d:\d\d.*Z$/);
    expect(await selections(page)).toHaveLength(1);
    await expect.poll(async () => (await selected(page, 0))?.length ?? 0).toBeGreaterThan(0);
  });
});
