import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Float pixels with `zmin` / `zmax` (plan E11.3): a false-color composite of three simulated bands
 * with values between 0 and 1, rescaled to 0–255 per channel by `zmax: [1, 1, 1, 1]`
 * (`colormodel: 'rgba'`, alpha 0–1 fading out toward the edges). The red band is stretched from
 * 0.2–0.8 for contrast, as `zmin` / `zmax` can differ per component (Plotly's `makeScaler`).
 */
export const meta: ExampleMeta = {
  title: 'Image: float RGBA with zmin / zmax',
  description: 'Three bands of values in 0–1 rescaled per channel, with a fading alpha channel.',
  tags: ['image', 'scientific', 'rgba', 'zmin', 'zmax'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const w = 64;
  const h = 40;
  const z = Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => {
      const x = c / (w - 1);
      const y = r / (h - 1);
      const band1 = 0.5 + 0.5 * Math.sin(6 * x + 2 * y);
      const band2 = Math.exp(-((x - 0.6) ** 2 + (y - 0.4) ** 2) * 8);
      const band3 = y * (1 - x);
      const alpha = Math.min(1, 4 * Math.min(x, 1 - x, y, 1 - y) + 0.15);
      return [band1, band2, band3, alpha];
    }),
  );
  const chart = createChart(el, {
    data: [
      {
        type: 'image',
        z,
        colormodel: 'rgba',
        zmin: [0.2, 0, 0, 0],
        zmax: [0.8, 1, 1, 1],
        hovertemplate:
          'pixel (%{x}, %{y})<br>bands %{z[0]:.2f}, %{z[1]:.2f}, %{z[2]:.2f}<extra></extra>',
      },
    ],
    layout: { title: { text: 'False-color composite' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
