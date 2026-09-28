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

/** Chart methods the E17.2–E17.5 tests call in the page. */
interface A11yChart {
  describe(): Promise<{ overview: string } | undefined>;
  react(figure: object): Promise<unknown>;
  update(update: object): Promise<unknown>;
  data: unknown[];
  layout: object;
}

/** The example's chart, inside `page.evaluate` (written out there: functions don't serialize). */
type Hooked = { __interaction: { chart: A11yChart } };

test.describe('generated summary (E17.2)', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, '_dev/a11y-summary');
  });

  test('describes trends and extremes with the axis format', async ({ page }) => {
    const overview =
      'USD by Month. Revenue rises from 1.2M (Jan 1, 2024) to 3.4M (Dec 1, 2024). It peaks at 3.6M (Nov 1, 2024). Costs stays flat at about 2.0M.';
    const figure = page.getByRole('figure');
    await expect(figure).toHaveAccessibleDescription(
      new RegExp(overview.replace(/[.()$]/g, '\\$&')),
    );
    // The example shows the same words under the chart.
    await expect(page.locator('p.a11y-summary')).toHaveText(overview);
  });

  test('speaks the chart locale through dictionary templates', async ({ page }) => {
    const overview = await page.evaluate(async () => {
      const chart = (window as unknown as Hooked).__interaction.chart;
      await chart.update({
        config: {
          locale: 'de',
          locales: {
            de: {
              dictionary: {
                '{name} rises from {start} ({startX}) to {end} ({endX}).':
                  '{name} steigt von {start} ({startX}) auf {end} ({endX}).',
              },
              format: { decimal: ',', thousands: '.' },
            },
          },
        },
      });
      return (await chart.describe())?.overview;
    });
    expect(overview).toContain('Revenue steigt von 1,2M');
    await expect(page.getByRole('figure')).toHaveAccessibleDescription(/Revenue steigt von/);
  });
});

test.describe('data table (E17.3)', () => {
  test('is visible below the chart, virtualized, and scrolls through 100k rows', async ({
    page,
  }) => {
    await openInteraction(page, '_dev/a11y-table-100k');
    await page.evaluate(() => (window as unknown as Hooked).__interaction.chart.describe());
    const region = page.getByRole('region', { name: 'Signal (100,000 rows)' });
    await expect(region).toBeVisible();
    const table = page.getByRole('table', { name: 'Signal (100,000 rows)' });
    await expect(table).toHaveAttribute('aria-rowcount', '100001');
    await expect(table.getByRole('columnheader')).toHaveText(['x', 'y']);
    // Below the chart, not over it; and not repeated in the hidden description.
    const chartBox = await page.locator('canvas').first().boundingBox();
    const tableBox = await region.boundingBox();
    expect(tableBox!.y).toBeGreaterThanOrEqual(chartBox!.y + chartBox!.height - 1);
    await expect(page.locator('.holochart-a11y table')).toHaveCount(0);
    const rows = table.locator('tbody tr[aria-rowindex]');
    expect(await rows.count()).toBeLessThan(60);
    await expect(rows.first()).toHaveAttribute('aria-rowindex', '2');

    // The rows fill the scroll region from the start.
    const regionBox = await region.boundingBox();
    const lastBox = await rows.last().boundingBox();
    expect(lastBox!.y + lastBox!.height).toBeGreaterThanOrEqual(regionBox!.y + regionBox!.height);
    // The region takes keyboard focus (so arrow keys scroll it); scroll it to the end.
    await region.focus();
    await expect(region).toBeFocused();
    await region.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(rows.last()).toHaveAttribute('aria-rowindex', '100001');
    // Values as the axes format them.
    await expect(rows.last()).toHaveText(/^99\.999k/);
    expect(await rows.count()).toBeLessThan(60);
    // Scrolling to the middle renders the rows there.
    await region.evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
    await expect
      .poll(async () => Number(await rows.first().getAttribute('aria-rowindex')))
      .toBeGreaterThan(49_000);
  });

  test('can be hidden (screen readers only) or turned off', async ({ page }) => {
    await openInteraction(page, '_dev/a11y-description');
    await expect(page.locator('.holochart-data-table')).toHaveCount(0);
    const hidden = page.getByRole('table', { name: 'Revenue (6 rows)' });
    await expect(hidden).toHaveCount(1);
    expect((await page.locator('.holochart-a11y').boundingBox())!.height).toBeLessThanOrEqual(1);
    await page.evaluate(() =>
      (window as unknown as Hooked).__interaction.chart.update({
        config: { a11y: { dataTable: false } },
      }),
    );
    await expect(page.getByRole('figure')).toHaveAccessibleDescription(/Line and bar chart/);
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.evaluate(async () => {
      await (window as unknown as Hooked).__interaction.chart.update({
        config: { a11y: { dataTable: 'visible' } },
      });
      await (window as unknown as Hooked).__interaction.chart.describe();
    });
    await expect(page.locator('.holochart-data-table').getByRole('table')).toHaveCount(2);
  });
});

test.describe('reduced motion (E17.5)', () => {
  /** Milliseconds a `react` with a 1.5 s transition takes to settle. */
  async function transitionTime(page: Page, config: object): Promise<number> {
    return page.evaluate(async (cfg) => {
      const chart = (window as unknown as Hooked).__interaction.chart;
      const figure = (y: number[]) => ({
        data: [{ type: 'scatter', mode: 'lines', x: [0, 1, 2], y }],
        layout: { transition: { duration: 1500, easing: 'linear' } },
        config: cfg,
      });
      await chart.react(figure([1, 2, 3]));
      const start = performance.now();
      await chart.react(figure([3, 2, 1]));
      return performance.now() - start;
    }, config);
  }

  test.beforeEach(async ({ page }) => {
    await openInteraction(page, '_dev/a11y-description');
  });

  test('transitions snap when the user prefers reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await transitionTime(page, {})).toBeLessThan(1000);
  });

  test('config.a11y.reducedMotion overrides the preference', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await transitionTime(page, { a11y: { reducedMotion: false } })).toBeGreaterThan(1400);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await transitionTime(page, { a11y: { reducedMotion: true } })).toBeLessThan(1000);
  });
});
