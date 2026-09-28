import { expect, test } from '@playwright/test';
import { bundleApp, ORIGIN, serveApp } from './esm-app.ts';

/**
 * The accessibility code through an app bundler (plan E17.2, E17.3): the generated summaries and
 * the visible data table are lazy chunks (runtime's `dist/summary-*.js`, `dist/table-view-*.js`).
 * The summary chunk loads after a chart's first description, the table chunk only for
 * `config.a11y.dataTable: 'visible'`, and with summaries off neither loads. Needs the packages
 * built (`pnpm build`).
 */
test('ESM: summaries and the visible table load from their own chunks when used', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const chunks = await bundleApp();
  const names = [...chunks.keys()];
  expect(names.filter((n) => n.startsWith('summary-'))).toHaveLength(1);
  expect(names.filter((n) => n.startsWith('table-view-'))).toHaveLength(1);

  const { errors, requests } = await serveApp(page, chunks);
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => 'Holochart' in window);
  const requested = (prefix: string): boolean =>
    requests.some((url) => new URL(url).pathname.slice(1).startsWith(prefix));

  const draw = (config: object) =>
    page.evaluate(async (cfg) => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global */
      const w = window as any;
      w.chart?.destroy();
      const el = document.getElementById('root')!;
      w.chart = w.Holochart.createChart(el, {
        data: [{ x: [1, 2, 3], y: [2, 4, 6], mode: 'lines', name: 'Sales' }],
        layout: { width: 480, height: 360 },
        config: cfg,
      });
      await w.chart.ready;
      return (await w.chart.describe())?.overview as string;
    }, config);

  expect(await draw({ a11y: { summaries: false } })).toBe('');
  expect(requested('summary-')).toBe(false);
  expect(await draw({})).toBe('Sales rises from 2 (1) to 6 (3).');
  expect(requested('summary-')).toBe(true);
  expect(requested('table-view-')).toBe(false);
  await draw({ a11y: { dataTable: 'visible' } });
  expect(requested('table-view-')).toBe(true);
  await expect(page.locator('.holochart-data-table table')).toHaveCount(1);
  expect(errors).toEqual([]);
});
