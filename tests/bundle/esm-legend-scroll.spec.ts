import { expect, test } from '@playwright/test';
import { bundleApp, ORIGIN, serveApp } from './esm-app.ts';

/**
 * Scrolling legends through an app bundler (plan E5.2): the scrolling code is a lazy chunk
 * (components' `dist/legend-scroll-*.js`). A legend that fits requests none; one taller than its
 * `maxheight` requests it, and `chart.ready` resolves once the legend is drawn, scrolled into its
 * own viewport. Needs the packages built (`pnpm build`).
 */
test('ESM: a legend loads its scrolling code when it overflows', async ({ page }) => {
  test.setTimeout(60_000);
  const chunks = await bundleApp();
  expect([...chunks.keys()].filter((n) => n.startsWith('legend-scroll-'))).toHaveLength(1);

  const { errors, requests } = await serveApp(page, chunks);
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => 'Holochart' in window);
  const loaded = () =>
    requests.some((url) => new URL(url).pathname.slice(1).startsWith('legend-scroll-'));

  /** Draw `n` traces with a legend of at most 40 px (one row); the chart's viewports once ready. */
  const draw = (n: number) =>
    page.evaluate(async (count) => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global */
      const hc = (window as any).Holochart;
      const el = document.getElementById('root')!;
      const data = Array.from({ length: count }, (_, i) => ({ y: [i, i + 1], name: `t${i}` }));
      const chart = hc.createChart(el, {
        data,
        layout: { width: 480, height: 360, legend: { maxheight: 40 } },
      });
      await chart.ready;
      const names = (chart.three.viewports as { name?: string }[]).map((v) => v.name ?? '');
      chart.destroy();
      return names;
    }, n);

  expect(await draw(3)).not.toContain('legend-scroll');
  expect(loaded()).toBe(false);
  expect(await draw(20)).toContain('legend-scroll');
  expect(loaded()).toBe(true);
  expect(errors).toEqual([]);
});
