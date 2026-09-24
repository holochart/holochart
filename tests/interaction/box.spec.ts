import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Box and violin hover on `box/interaction` (plan E10.4, E10.5, E20.4): the box of samples 1…9
 * and 30 at category `box` (index 0) has q1 3, median 5.5, q3 8, fences 1 and 9, and 30 as its
 * outlier point; the violin is at category `violin` (index 1).
 */
const EXAMPLE = 'box/interaction';

/** Page coordinates of linear coordinates (category index, value) on subplot `xy`. */
async function toPage(page: Page, xl: number, yl: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y]) => {
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
      const sp = hook.chart.subplots.get('xy');
      if (!sp) throw new Error('no xy subplot');
      return {
        x: box.left + sp.rect.x + sp.xaxis.scale.l2p(x),
        y: box.top + sp.rect.y + sp.rect.height - sp.yaxis.scale.l2p(y),
      };
    },
    [xl, yl] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('hovering a box shows one label per statistic, the trace name on the median', async ({
  page,
}) => {
  const at = await toPage(page, 0, 5);
  await page.mouse.move(at.x, at.y);
  const labels = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(labels).toHaveCount(7);
  const texts = await labels.allInnerTexts();
  for (const stat of [
    '(box, max: 30)',
    '(box, upper fence: 9)',
    '(box, q3: 8)',
    '(box, median: 5.5)',
    '(box, q1: 3)',
    '(box, lower fence: 1)',
    '(box, min: 1)',
  ]) {
    expect(texts.some((t) => t.includes(stat))).toBe(true);
  }
  await expect(page.locator('.holochart-hoverlabel-name').filter({ visible: true })).toHaveText(
    'box',
  );
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toHaveLength(7);
});

test('hovering the outlier shows that point only', async ({ page }) => {
  await events(page, true);
  const at = await toPage(page, 0, 30);
  await page.mouse.move(at.x, at.y);
  const labels = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(labels).toHaveCount(1);
  await expect(labels.first()).toContainText('(box, 30)');
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points?.[0]).toMatchObject({ curveNumber: 0, pointNumber: 9, y: 30 });
});

test('hovering a violin adds the density at the pointer', async ({ page }) => {
  const at = await toPage(page, 1, 5);
  await page.mouse.move(at.x, at.y);
  const labels = page.locator('.holochart-hoverlabel').filter({ visible: true });
  // max, q3, median, q1, min (no fences without points) and the density.
  await expect(labels).toHaveCount(6);
  const texts = await labels.allInnerTexts();
  expect(texts.some((t) => /^\(violin, y: 5, kde: 0\.\d{3}\)$/.test(t.trim()))).toBe(true);
});
