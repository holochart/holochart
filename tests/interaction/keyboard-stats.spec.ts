import { expect, test, type Page } from '@playwright/test';
import { openInteraction, ranges } from './helpers.ts';
import { anchor, labels, press, tabIntoChart, trackAnchors } from './keyboard-helpers.ts';

/**
 * Keyboard navigation of aggregating, grid and domain traces (backlog S2.14) with real key
 * presses: a bin cursor on histograms, the statistics of each box and violin, a cell cursor on
 * heatmaps and contours, funnelarea stages, parcats categories, parcoords lines × axes and polar
 * points. Each stop shows the hover label(s) of its element and announces what they read.
 */

/** Replace the example's figure (the full bundle has every trace type). */
async function react(page: Page, figure: object): Promise<void> {
  await page.evaluate(async (f) => {
    const chart = (
      window as unknown as { __interaction: { chart: { react(f: object): Promise<unknown> } } }
    ).__interaction.chart;
    await chart.react(f);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, figure);
}

test('histogram: arrows step through the bins, up and down between overlaid traces', async ({
  page,
}) => {
  await openInteraction(page, 'box/interaction');
  await react(page, {
    data: [
      { type: 'histogram', name: 'A', x: [1, 1, 2, 3, 3, 3], xbins: { start: 0.5, size: 1 } },
      { type: 'histogram', name: 'B', x: [1, 2, 2, 2, 2, 3], xbins: { start: 0.5, size: 1 } },
    ],
    layout: { barmode: 'overlay', width: 640, height: 400 },
  });
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe('A: (1, 2), 1 of 3.');
  await expect(labels(page)).toHaveCount(1);
  expect(await press(page, 'ArrowRight')).toBe('A: (2, 1), 2 of 3.');
  // Up: the trace whose bar is next above at this bin (B has 4 samples there).
  expect(await press(page, 'ArrowUp')).toBe('B: (2, 4), 2 of 3.');
  expect(await press(page, 'End')).toBe('B: (3, 1), 3 of 3.');
  expect(await press(page, 'PageUp')).toBe('A: (3, 3), 3 of 3.');
  // Zoom keys work on the bins' axes, and the cursor stays in view.
  const span = async (): Promise<number> => {
    const [lo = 0, hi = 0] = (await ranges(page)).x;
    return hi - lo;
  };
  const before = await span();
  expect(await press(page, '+')).toBe('Zoomed in.');
  await expect.poll(span).toBeLessThan(before);
});

test('box and violin: one stop per box, with every statistic', async ({ page }) => {
  await openInteraction(page, 'box/interaction');
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe(
    'box: max: 30, upper fence: 9, q3: 8, median: 5.5, q1: 3, lower fence: 1, min: 1, 1 of 1.',
  );
  // The labels a pointer over the box shows, the median's with the trace name.
  await expect(labels(page)).toHaveCount(7);
  await expect(labels(page).filter({ hasText: 'median: 5.5' })).toContainText('box');
  expect(await press(page, 'PageDown')).toBe(
    'violin: max: 9, q3: 6, median: 4.6, q1: 3.5, min: 2, 1 of 1.',
  );
  await expect(labels(page)).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(labels(page)).toHaveCount(0);
});

test('boxes of one trace are announced with their positions', async ({ page }) => {
  await openInteraction(page, 'box/interaction');
  await react(page, {
    data: [
      {
        type: 'box',
        name: 'Scores',
        x: ['a', 'a', 'a', 'b', 'b', 'b'],
        y: [1, 2, 3, 4, 6, 8],
      },
    ],
    layout: { width: 640, height: 400 },
  });
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe(
    'Scores: a, max: 3, upper fence: 3, q3: 2.75, median: 2, q1: 1.25, lower fence: 1, min: 1, 1 of 2.',
  );
  expect(await press(page, 'ArrowRight')).toMatch(/^Scores: b, max: 8, .*median: 6, .*2 of 2\.$/);
});

test('heatmap: a cell cursor, rows from the top, staying in view after a zoom', async ({
  page,
}) => {
  await openInteraction(page, 'heatmap/interaction');
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe(
    'grid: x: a, y: 1, z: 4, t10, row 1 of 2, column 1 of 3.',
  );
  await expect(labels(page)).toHaveCount(1);
  await expect(labels(page)).toContainText('z: 4');
  expect(await press(page, 'ArrowRight')).toMatch(/x: b, y: 1, z: 5, .*row 1 of 2, column 2 of 3/);
  expect(await press(page, 'ArrowDown')).toMatch(/x: b, y: 0, z: 2, .*row 2 of 2, column 2 of 3/);
  // The bottom row: down stays.
  expect(await press(page, 'ArrowDown')).toMatch(/row 2 of 2, column 2 of 3/);
  // A gap the pointer gets no label on (`hoverongaps: false`) is still a stop: its position.
  expect(await press(page, 'End')).toBe('grid: (c, 0), row 2 of 2, column 3 of 3.');
  expect(await press(page, 'Home')).toMatch(/x: a, y: 0, .*column 1 of 3/);
  expect(await press(page, '+')).toBe('Zoomed in.');
  expect(await press(page, 'ArrowUp')).toMatch(/^grid: x: \w, y: \d, z: \d/);
});

test('contour: the same cell cursor over the grid points', async ({ page }) => {
  await openInteraction(page, 'contour/interaction');
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe(
    'grid: x: 0, y: 3, z: 30, row 1 of 4, column 1 of 5.',
  );
  expect(await press(page, 'ArrowDown')).toBe(
    'grid: x: 0, y: 2, z: 20, row 2 of 4, column 1 of 5.',
  );
});

test('funnelarea: arrows step through the stages', async ({ page }) => {
  await openInteraction(page, 'funnelarea/interaction');
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe('Stages: Alpha, 40, 40%, point 1 of 4.');
  await expect(labels(page)).toContainText('Alpha');
  expect(await press(page, 'ArrowDown')).toBe('Stages: Beta, 30, 30%, point 2 of 4.');
  expect(await press(page, 'End')).toBe('Stages: Delta, 10, 10%, point 4 of 4.');
  expect(await press(page, 'ArrowUp')).toBe('Stages: Gamma, 20, 20%, point 3 of 4.');
});

test('parcats: left and right between dimensions, up and down between categories', async ({
  page,
}) => {
  await openInteraction(page, 'parcats/interaction');
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe('trace 0: A, a1, Count: 6, P(a1): 0.500, 1 of 2.');
  await expect(labels(page)).toContainText('Count: 6');
  expect(await press(page, 'ArrowDown')).toBe('trace 0: A, a2, Count: 6, P(a2): 0.500, 2 of 2.');
  // Sideways: the category at the same place in the next dimension.
  expect(await press(page, 'ArrowRight')).toBe('trace 0: B, b2, Count: 4, P(b2): 0.333, 2 of 3.');
  await expect(labels(page)).toContainText('P(b2)');
  expect(await press(page, 'End')).toMatch(/^trace 0: B, b3, .*3 of 3\.$/);
  expect(await press(page, 'ArrowLeft')).toMatch(/^trace 0: A, a2, /);
});

test('parcoords: left and right along a line, up and down between lines', async ({ page }) => {
  await openInteraction(page, 'parcoords/interaction');
  await trackAnchors(page);
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe('trace 0: Alpha: 0, row 1 of 50, column 1 of 3.');
  // Parcoords has no pointer hover: the label is the keyboard cursor, on the axis at the value.
  await expect(labels(page)).toHaveText(['Alpha: 0']);
  const low = await anchor(page);
  expect(await press(page, 'ArrowRight')).toBe('trace 0: Beta: 100, row 1 of 50, column 2 of 3.');
  await expect(labels(page)).toHaveText(['Beta: 100']);
  // Alpha: 0 is at the bottom of the first axis, Beta: 100 at the top of the second, both inside
  // the figure (400 px tall).
  const high = await anchor(page);
  const box = (await page.locator('canvas').first().boundingBox())!;
  expect(high.x).toBeGreaterThan(low.x + 100);
  expect(low.y - high.y).toBeGreaterThan(150);
  expect(low.y).toBeLessThan(box.y + box.height);
  expect(low.y).toBeGreaterThan(box.y + box.height - 120);
  expect(await press(page, 'ArrowDown')).toMatch(/^trace 0: Beta: 97\.9592, row 2 of 50, column 2/);
  expect(await press(page, 'Home')).toMatch(/^trace 0: Alpha: 2\.04082, row 2 of 50, column 1/);
  expect(await press(page, 'End')).toMatch(/^trace 0: Gamma: .*row 2 of 50, column 3 of 3\.$/);
});

test('polar: arrows step through the points of a trace, Page Down to the next', async ({
  page,
}) => {
  await openInteraction(page, '_dev/interaction-polar');
  await trackAnchors(page);
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe('A: r: 5, θ: 45°, point 1 of 4.');
  await expect(labels(page)).toContainText('r: 5');
  const first = await anchor(page);
  expect(await press(page, 'ArrowRight')).toBe('A: r: 8, θ: 135°, point 2 of 4.');
  // The first label sat on its point: a pointer there hovers that point.
  await page.mouse.move(first.x, first.y);
  await expect(labels(page)).toContainText('r: 5');
  expect(await press(page, 'PageDown')).toBe('B: r: 7, θ: 90°, point 1 of 2.');
  expect(await press(page, 'End')).toBe('B: r: 2, θ: 180°, point 2 of 2.');
});
