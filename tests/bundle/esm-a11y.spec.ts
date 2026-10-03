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

/**
 * The trace packages' accessibility code through an app bundler (backlog S2.14): one lazy chunk
 * per trace package (`dist/a11y-*.js`), which imports nothing from its package. A package's chunk
 * loads on the first keyboard focus of a chart with one of its traces; the 3D chunk also loads
 * after the first description of a 3D trace, which it then describes.
 */
test('ESM: trace keyboard stops and 3D descriptions load from their own chunks', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const chunks = await bundleApp();
  const a11y = [...chunks.keys()].filter((n) => n.startsWith('a11y-'));
  // hier, stats, sci, finance and 3d.
  expect(a11y).toHaveLength(5);
  // Self-contained: no static import (an app's bundler adds no shared chunk for them).
  for (const name of a11y) expect(chunks.get(name)).not.toMatch(/^\s*import\b/m);

  const { errors, requests } = await serveApp(page, chunks);
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => 'Holochart' in window);
  const loaded = (): number =>
    requests.filter((url) => new URL(url).pathname.slice(1).startsWith('a11y-')).length;

  const draw = (data: object[]) =>
    page.evaluate(async (traces) => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global */
      const w = window as any;
      w.chart?.destroy();
      const el = document.getElementById('root')!;
      w.chart = w.Holochart.createChart(el, {
        data: traces,
        layout: { width: 480, height: 360 },
      });
      await w.chart.ready;
      return ((await w.chart.describe())?.traces ?? []) as string[];
    }, data);

  // A sunburst is described by its own module: nothing loads until the chart gets focus.
  await draw([{ type: 'sunburst', labels: ['A', 'B'], parents: ['', 'A'], values: [2, 1] }]);
  expect(loaded()).toBe(0);
  await page.locator('.holochart-focus').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.holochart-live')).toHaveText(/level 1, 1 of 1, children: 1\./);
  expect(loaded()).toBe(1);
  // A cone's description comes with the 3D chunk, right after the first description.
  const [cone] = await draw([
    {
      type: 'cone',
      name: 'Wind',
      x: [0, 1],
      y: [0, 1],
      z: [0, 1],
      u: [1, 0],
      v: [0, 1],
      w: [0, 0],
    },
  ]);
  expect(cone).toMatch(/^Cone plot 'Wind': 2 cones; .*vector lengths 1–1\.$/);
  expect(loaded()).toBe(2);
  expect(errors).toEqual([]);
});
