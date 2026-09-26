import { expect, test } from '@playwright/test';
import { bundleApp, ORIGIN, serveApp } from './esm-app.ts';

/**
 * The animation code through an app bundler (plan E7.3, E7.4): transitions, frames and `animate`
 * are a lazy chunk (runtime's `dist/animation-*.js`). A chart that never animates requests it not;
 * `chart.animate` loads it and plays the frames. Needs the packages built (`pnpm build`).
 */
test('ESM: the animation code loads the first time a chart animates', async ({ page }) => {
  test.setTimeout(60_000);
  const chunks = await bundleApp();
  expect([...chunks.keys()].filter((n) => n.startsWith('animation-'))).toHaveLength(1);

  const { errors, requests } = await serveApp(page, chunks);
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => 'Holochart' in window);
  const animationRequested = (): boolean =>
    requests.some((url) => new URL(url).pathname.slice(1).startsWith('animation-'));

  await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global */
    const w = window as any;
    const el = document.getElementById('root')!;
    w.chart = w.Holochart.createChart(el, {
      data: [{ x: [1, 2, 3], y: [2, 1, 3], mode: 'markers' }],
      layout: { width: 480, height: 360, yaxis: { range: [0, 10] } },
      frames: [
        { name: 'a', data: [{ y: [4, 5, 6] }] },
        { name: 'b', data: [{ y: [7, 8, 9] }] },
      ],
    });
    await w.chart.ready;
    await w.chart.restyle({ 'marker.size': 9 });
    await w.chart.react({ ...w.chart.toJSON(), layout: { width: 480, height: 360 } });
  });
  expect(animationRequested()).toBe(false);

  const result = await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global */
    const chart = (window as any).chart;
    const frames: string[] = [];
    chart.on('animatingframe', (e: { name: string }) => frames.push(e.name));
    await chart.animate(null, { frame: { duration: 50 }, transition: { duration: 30 } });
    const y = Array.from(chart.fullData[0].y as ArrayLike<number>);
    chart.destroy();
    return { frames, y };
  });
  expect(result.frames).toEqual(['a', 'b']);
  expect(result.y).toEqual([7, 8, 9]);
  expect(animationRequested()).toBe(true);
  expect(errors).toEqual([]);
});
