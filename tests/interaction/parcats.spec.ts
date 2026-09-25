import { expect, test, type Page } from '@playwright/test';
import { dragBetween, events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Parallel-categories pointer scenarios on `parcats/interaction` (plan E10.11, E20.4): dragging a
 * category band reorders the categories (restyling `categoryarray`, `ticktext` and
 * `categoryorder`), dragging a dimension label reorders the dimensions (restyling `displayindex`
 * of every dimension), and hovering a band shows its count and probability.
 *
 * The example: 640×400 px, domain x 60–580 and y 60–360, dimensions A, B, C with 16 px bands at
 * x = 100, 312 and 524; B's three categories (4 samples each) at y 60–154.7, 162.7–257.3 and
 * 265.3–360.
 */
const EXAMPLE = 'parcats/interaction';
const DIM_X = { a: 100, b: 312, c: 524 } as const;

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

/** `fullData[0].dimensions` fields. */
async function dimensions(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __interaction: {
          chart: { fullData: readonly { dimensions: Record<string, unknown>[] }[] };
        };
      }
    ).__interaction.chart.fullData[0]!.dimensions.map((d) => ({
      label: d['label'],
      displayindex: d['displayindex'],
      categoryorder: d['categoryorder'],
      categoryarray: d['categoryarray'],
    })),
  );
}

test.describe('parcats interaction', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
    await events(page, true);
  });

  test('dragging a category band reorders the categories', async ({ page }) => {
    const box = await canvasBox(page);
    // B's first band (b1, center y ≈ 107) past the middle of the second (y ≈ 210).
    await dragBetween(page, at(box, DIM_X.b + 8, 107), at(box, DIM_X.b + 8, 230), 12);
    const restyle = await waitForEvent(page, 'restyle');
    expect(restyle.payload).toEqual({
      update: {
        'dimensions[1].categoryarray': [['b2', 'b1', 'b3']],
        'dimensions[1].ticktext': [['b2', 'b1', 'b3']],
        'dimensions[1].categoryorder': 'array',
      },
      traces: [0],
    });
    const dims = await dimensions(page);
    expect(dims[1]).toMatchObject({ categoryorder: 'array', categoryarray: ['b2', 'b1', 'b3'] });
    expect((await events(page)).filter((e) => e.name === 'relayout')).toEqual([]);
  });

  test('dragging a dimension label reorders the dimensions', async ({ page }) => {
    const box = await canvasBox(page);
    // A's label sits above its top band (y ≈ 50); drag it right of B.
    await dragBetween(page, at(box, DIM_X.a + 8, 50), at(box, 420, 50), 12);
    const restyle = await waitForEvent(page, 'restyle');
    expect(restyle.payload).toEqual({
      update: {
        'dimensions[1].displayindex': 0,
        'dimensions[0].displayindex': 1,
        'dimensions[2].displayindex': 2,
      },
      traces: [0],
    });
    const dims = await dimensions(page);
    expect(dims.map((d) => d['displayindex'])).toEqual([1, 0, 2]);
  });

  test('hovering a band shows its count and probability', async ({ page }) => {
    const box = await canvasBox(page);
    const p = at(box, DIM_X.c + 8, 150);
    await page.mouse.move(p.x - 30, p.y);
    await page.mouse.move(p.x, p.y, { steps: 4 });
    const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
    await expect(label.first()).toBeVisible();
    await expect(label.first()).toContainText('Count: 8');
    await expect(label.first()).toContainText('P(c1): 0.667');
  });
});
