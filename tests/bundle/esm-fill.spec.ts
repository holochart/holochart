import { expect, test } from '@playwright/test';
import { bundleApp, ORIGIN, serveApp } from './esm-app.ts';

/**
 * The fill code through an app bundler (plan E21.6): the fill primitive, earcut and the exact
 * fill-rule code are their own lazy chunk (render's `dist/fill-lazy.js`). A chart without fills
 * never requests it; the first fill does, and `chart.ready` resolves once the fill is on screen.
 * Needs the packages built (`pnpm build`).
 */
test('ESM: the fill code loads from its own chunk with the first fill', async ({ page }) => {
  test.setTimeout(60_000);
  const chunks = await bundleApp();
  const fillChunks = [...chunks.keys()].filter((name) => name.startsWith('fill-lazy'));
  expect(fillChunks).toHaveLength(1);

  const { errors, requests } = await serveApp(page, chunks);
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => 'Holochart' in window);
  const fillRequests = (): string[] => requests.filter((url) => url.includes('/fill-lazy'));

  /** Draw a chart, wait for `ready`, and read the pixel at the center of the plot area. */
  const draw = (trace: Record<string, unknown>): Promise<number[]> =>
    page.evaluate(async (t) => {
      /* eslint-disable @typescript-eslint/no-explicit-any -- untyped global */
      const hc = (window as any).Holochart;
      const chart = hc.createChart(document.getElementById('root'), {
        data: [t],
        layout: { width: 400, height: 300, showlegend: false },
      });
      await chart.ready;
      // Render and read back in the same task: the drawing buffer is still intact.
      chart.three.root.renderNow();
      const canvas = chart.three.renderer.domElement as HTMLCanvasElement;
      const probe = document.createElement('canvas');
      probe.width = canvas.width;
      probe.height = canvas.height;
      const ctx = probe.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      // The subplot's rect: CSS px, top-left origin.
      const area = chart.three.subplot('xy').rect as {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      const scale = canvas.width / 400;
      const x = Math.round((area.x + area.width / 2) * scale);
      const y = Math.round((area.y + area.height / 2) * scale);
      const pixel = Array.from(ctx.getImageData(x, y, 1, 1).data);
      chart.destroy();
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return pixel;
    }, trace);

  const line = { x: [0, 1, 2], y: [10, 10, 10], mode: 'lines' };
  await draw(line);
  expect(fillRequests()).toEqual([]);

  const filled = await draw({ ...line, fill: 'tozeroy', fillcolor: 'rgb(255, 0, 0)' });
  expect(fillRequests()).toHaveLength(1);
  expect(filled).toEqual([255, 0, 0, 255]);

  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);
  expect(errors).toEqual([]);
});
