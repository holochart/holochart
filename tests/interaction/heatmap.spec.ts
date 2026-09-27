import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Heatmap and image hover on `heatmap/interaction` (plan E11.1, E11.3, E20.4): a heatmap on
 * subplot `xy` (category x `a`/`b`/`c` at 0…2, rows y 0 and 1, cell (c, 0) a gap with
 * `hoverongaps: false`) and a 2 × 2 RGB image on `x2y2` (pixel centers 0 and 1, row 0 at the
 * top).
 */
const EXAMPLE = 'heatmap/interaction';

/** Page coordinates of linear coordinates on a subplot. */
async function toPage(
  page: Page,
  subplot: string,
  xl: number,
  yl: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([id, x, y]) => {
      interface Axis {
        scale: { l2p(l: number): number };
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
      const sp = hook.chart.subplots.get(id);
      if (!sp) throw new Error(`no ${id} subplot`);
      return {
        x: box.left + sp.rect.x + sp.xaxis.scale.l2p(x),
        y: box.top + sp.rect.y + sp.rect.height - sp.yaxis.scale.l2p(y),
      };
    },
    [subplot, xl, yl] as const,
  );
}

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('hovering a heatmap cell shows x, y, z and its text; events carry [row, column]', async ({
  page,
}) => {
  await events(page, true);
  const at = await toPage(page, 'xy', 1.2, 0.9);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  const text = await labels(page).first().innerText();
  for (const part of ['x: b', 'y: 1', 'z: 5', 't11']) expect(text).toContain(part);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toEqual([
    {
      curveNumber: 0,
      pointNumber: [1, 1],
      x: 'b',
      y: 1,
      z: 5,
      text: 't11',
      customdata: 'c11',
    },
  ]);
});

test('a gap shows no label with hoverongaps off', async ({ page }) => {
  const cell = await toPage(page, 'xy', 0, 0);
  await page.mouse.move(cell.x, cell.y);
  await expect(labels(page)).toHaveCount(1);
  const gap = await toPage(page, 'xy', 2, 0);
  await page.mouse.move(gap.x, gap.y);
  await expect(labels(page)).toHaveCount(0);
});

test('hovering an image pixel fills its template from the pixel components', async ({ page }) => {
  await events(page, true);
  // Row 1, column 0: blue (the y axis is reversed, so row 1 is the lower row).
  const at = await toPage(page, 'x2y2', 0.1, 1.1);
  await page.mouse.move(at.x, at.y);
  await expect(labels(page)).toHaveCount(1);
  await expect(labels(page).first()).toContainText('px 0,1: 0/0/255');
  await expect(page.locator('.holochart-hoverlabel-name').filter({ visible: true })).toHaveText(
    'rgb',
  );
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toMatchObject([
    { curveNumber: 1, pointNumber: [1, 0], x: 0, y: 1, z: [0, 0, 255] },
  ]);
});
