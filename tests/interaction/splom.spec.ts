import { expect, test, type Page } from '@playwright/test';
import { callChart, dragBetween, events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Scatter plot matrix pointer scenarios on `splom/interaction` (plan E10.9, E20.4): one splom
 * trace of six samples in three dimensions, `alpha` 1…6, `beta` 6 4 5 2 3 1, `gamma` 10 20 10 20
 * 10 20, drawn in a 3 × 3 grid (x axes `x`, `x2`, `x3` per column, y axes `y`, `y2`, `y3` per row;
 * row 0 on top), `dragmode: 'select'`.
 */
const EXAMPLE = 'splom/interaction';

/** Page coordinates of data (x, y) in the cell (subplot) `id`. */
async function cellToPage(
  page: Page,
  id: string,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([sid, dx, dy]) => {
      interface Axis {
        scale: { d2p(v: unknown): number };
      }
      interface Hook {
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
      }
      const hook = (window as unknown as { __interaction: Hook }).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const sp = hook.chart.subplots.get(sid as string);
      if (!sp) throw new Error(`no ${String(sid)} subplot`);
      return {
        x: box.left + sp.rect.x + sp.xaxis.scale.d2p(dx),
        y: box.top + sp.rect.y + sp.rect.height - sp.yaxis.scale.d2p(dy),
      };
    },
    [id, x, y] as const,
  );
}

/** Drawn opacity of each sample in cell `id` (read from the GPU style buffer the cells share). */
async function opacities(page: Page, id: string): Promise<number[]> {
  return page.evaluate((sid) => {
    interface Hook {
      chart: {
        subplots: Map<
          string,
          {
            viewport: {
              scene: {
                children: {
                  geometry?: { getAttribute(n: string): { array: ArrayLike<number> } | undefined };
                }[];
              };
            };
          }
        >;
      };
    }
    const hook = (window as unknown as { __interaction: Hook }).__interaction;
    const cell = hook.chart.subplots.get(sid)?.viewport.scene.children[0];
    const style = cell?.geometry?.getAttribute('aStyle');
    if (!style) throw new Error(`no cell in ${sid}`);
    return Array.from({ length: 6 }, (_, i) => Math.round((style.array[i * 4 + 2] ?? 0) * 10) / 10);
  }, id);
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('box-selecting in one cell highlights the same samples in every cell', async ({ page }) => {
  await events(page, true);
  // Cell x2y: beta along x, alpha along y. Samples 1 (beta 4, alpha 2) and 2 (beta 5, alpha 3).
  await dragBetween(
    page,
    await cellToPage(page, 'x2y', 3.5, 3.5),
    await cellToPage(page, 'x2y', 5.5, 1.5),
  );
  const selected = await waitForEvent(page, 'selected');
  expect(selected.payload.points?.map((p) => p.pointNumber)).toEqual([1, 2]);
  const expected = [0.2, 1, 1, 0.2, 0.2, 0.2];
  for (const id of ['x2y', 'xy', 'x3y3', 'xy3', 'x2y2']) {
    expect(await opacities(page, id)).toEqual(expected);
  }

  // A lasso in another cell replaces the selection everywhere. Cell x3y2: gamma along x, beta
  // along y; gamma 20 and beta ≥ 2 → samples 1 (beta 4) and 3 (beta 2).
  await callChart(page, 'setDragmode', 'lasso');
  const corners: [number, number][] = [
    [15, 1.5],
    [25, 1.5],
    [25, 4.5],
    [15, 4.5],
  ];
  const pts = [];
  for (const [x, y] of corners) pts.push(await cellToPage(page, 'x3y2', x, y));
  await page.mouse.move(pts[0]!.x, pts[0]!.y);
  await page.mouse.down();
  for (const p of [...pts.slice(1), pts[0]!]) await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => opacities(page, 'xy')).toEqual([0.2, 1, 0.2, 1, 0.2, 0.2]);
  expect(await opacities(page, 'x2y3')).toEqual([0.2, 1, 0.2, 1, 0.2, 0.2]);

  // Double-click clears it in every cell.
  const at = await cellToPage(page, 'xy', 3, 3);
  await page.mouse.dblclick(at.x, at.y);
  await waitForEvent(page, 'deselect');
  await expect.poll(async () => opacities(page, 'x3y')).toEqual([1, 1, 1, 1, 1, 1]);
});

test('hover shows the nearest sample of the hovered cell with both dimension values', async ({
  page,
}) => {
  await events(page, true);
  // Cell x3y2: gamma along x, beta along y. Sample 3 is at (20, 2).
  const p = await cellToPage(page, 'x3y2', 20, 2);
  await page.mouse.move(p.x + 2, p.y - 1);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toEqual([{ curveNumber: 0, pointNumber: 3, x: 20, y: 2 }]);
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toHaveCount(1);
  await expect(label).toContainText('gamma: 20');
  await expect(label).toContainText('beta: 2');

  // The same sample in the transposed cell (x2y3: beta along x, gamma along y).
  await events(page, true);
  const q = await cellToPage(page, 'x2y3', 2, 20);
  await page.mouse.move(q.x - 1, q.y + 2);
  const again = await waitForEvent(page, 'hover');
  expect(again.payload.points).toEqual([{ curveNumber: 0, pointNumber: 3, x: 2, y: 20 }]);
  await expect(label).toContainText('beta: 2');
  await expect(label).toContainText('gamma: 20');
});

test("zooming a cell zooms its column's x axis and its row's y axis", async ({ page }) => {
  await callChart(page, 'setDragmode', 'zoom');
  await events(page, true);
  // Cell x2y3 (beta × gamma): zoom to beta 2–5, gamma 12–22.
  await dragBetween(
    page,
    await cellToPage(page, 'x2y3', 2, 22),
    await cellToPage(page, 'x2y3', 5, 12),
  );
  const relayout = await waitForEvent(page, 'relayout');
  expect(relayout.payload['xaxis2.range[0]']).toBeCloseTo(2, 1);
  expect(relayout.payload['xaxis2.range[1]']).toBeCloseTo(5, 1);
  expect(relayout.payload['yaxis3.range[0]']).toBeCloseTo(12, 0);
  expect(relayout.payload['yaxis3.range[1]']).toBeCloseTo(22, 0);
  expect(relayout.payload['xaxis.range[0]']).toBeUndefined();
  // Every cell of the column follows (they share the axis).
  const top = await cellToPage(page, 'x2y', 5, 1);
  const bottom = await cellToPage(page, 'x2y3', 5, 12);
  expect(Math.abs(top.x - bottom.x)).toBeLessThan(0.5);
});
