/**
 * Accessible DOM mirror (plan E17.1) in a real browser: what the accessibility tree exposes for an
 * interactive and a static chart — role, accessible name and description, the axes and trace
 * lists and the hidden data tables — and that the description follows range changes.
 */
import { expect, test, type Page } from '@playwright/test';
import { openInteraction } from './helpers.ts';

/** The chart element (the example's chart container). */
function chartElement(page: Page) {
  return page.locator('[aria-describedby^="holochart-a11y-"]');
}

test.describe('interactive chart', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, '_dev/a11y-description');
  });

  test('is a figure named by its title and an automatic summary', async ({ page }) => {
    const figure = page.getByRole('figure', {
      name: 'Revenue and costs, H1 2024. Line and bar chart with 2 traces.',
      exact: true,
    });
    await expect(figure).toHaveCount(1);
    await expect(figure).toHaveAccessibleDescription(/Line and bar chart with 2 traces\./);
    await expect(figure).toHaveAccessibleDescription(/X axis "Month": date axis from/);
    await expect(figure).toHaveAccessibleDescription(/Line "Revenue": 6 points\./);
  });

  test('exposes the axes, trace summaries and data tables to the accessibility tree', async ({
    page,
  }) => {
    const figure = page.getByRole('figure');
    const axes = figure.getByRole('list', { name: 'Axes' }).getByRole('listitem');
    await expect(axes).toHaveCount(2);
    await expect(axes.nth(0)).toHaveText(/^X axis "Month": date axis from .+ to .+\.$/);
    await expect(axes.nth(1)).toHaveText(/^Y axis "k\$": linear axis from .+ to .+\.$/);
    const traces = figure.getByRole('list', { name: 'Traces' }).getByRole('listitem');
    await expect(traces).toHaveText([
      'Line "Revenue": 6 points. x from Jan 1, 2024 to Jun 1, 2024. Lowest y 11 at x = Mar 1, 2024, highest 21 at x = May 1, 2024.',
      'Bar "Costs": 6 bars. Largest 12 at May 1, 2024, smallest 8 at Jan 1, 2024.',
    ]);
    const table = figure.getByRole('table', { name: 'Revenue (6 rows)' });
    await expect(table.getByRole('columnheader')).toHaveText(['Month', 'k$']);
    await expect(table.getByRole('row')).toHaveCount(7);
    await expect(figure.getByRole('table', { name: 'Costs (6 rows)' })).toHaveCount(1);
    // The modebar stays reachable inside the figure; the canvas and hover labels are hidden.
    await expect(figure.getByRole('toolbar', { name: 'Chart toolbar' })).toHaveCount(1);
    await expect(figure.locator('canvas')).toHaveAttribute('aria-hidden', 'true');
    await expect(figure.locator('.holochart-fx')).toHaveAttribute('aria-hidden', 'true');
    // The same structure, as the accessibility tree reports it.
    const snapshot = await figure.ariaSnapshot();
    expect(snapshot).toContain('list "Axes:"');
    expect(snapshot).toContain('list "Traces:"');
    expect(snapshot).toContain('table "Revenue (6 rows)"');
  });

  test('takes no space and draws nothing', async ({ page }) => {
    const box = await page.locator('.holochart-a11y').boundingBox();
    expect(box?.width).toBeLessThanOrEqual(1);
    expect(box?.height).toBeLessThanOrEqual(1);
    const chart = await chartElement(page).boundingBox();
    const canvas = await page.locator('canvas').first().boundingBox();
    expect(canvas).toEqual(chart);
  });

  test('follows axis range changes after a short debounce', async ({ page }) => {
    await page.evaluate(() => {
      const hook = (
        window as unknown as { __interaction: { chart: { relayout(u: object): void } } }
      ).__interaction;
      hook.chart.relayout({ 'yaxis.range': [0, 50] });
    });
    const y = page.getByRole('list', { name: 'Axes' }).getByRole('listitem').nth(1);
    await expect(y).toHaveText('Y axis "k$": linear axis from 0 to 50.');
  });

  test('follows data and title changes', async ({ page }) => {
    await page.evaluate(async () => {
      const hook = (
        window as unknown as {
          __interaction: {
            chart: {
              relayout(u: object): Promise<unknown>;
              deleteTraces(i: number): Promise<unknown>;
            };
          };
        }
      ).__interaction;
      await hook.chart.relayout({ 'title.text': 'Revenue' });
      await hook.chart.deleteTraces(1);
    });
    await expect(
      page.getByRole('figure', { name: 'Revenue. Line chart.', exact: true }),
    ).toHaveCount(1);
    await expect(page.getByRole('list', { name: 'Traces' }).getByRole('listitem')).toHaveCount(1);
  });
});

test.describe('static chart', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, '_dev/a11y-static');
  });

  test('is an image named by layout.meta.description, described by its slices', async ({
    page,
  }) => {
    const img = page.getByRole('img', { name: 'Browser share of page views in June 2024' });
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAccessibleDescription(
      /Donut chart\. .*Donut "Browsers": 4 slices, total 1000\. Largest: Chrome 64\.1% \(641\)/,
    );
    await expect(page.getByRole('toolbar')).toHaveCount(0);
  });
});
