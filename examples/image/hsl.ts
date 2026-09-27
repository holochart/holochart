import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * HSL pixels with smoothing (plan E11.3): a hue × lightness chart in `colormodel: 'hsla'`, placed
 * on the axes with `x0` / `dx` (hue in degrees) and `y0` / `dy` (lightness in %), drawn with
 * `zsmooth: 'fast'` (the GPU's bilinear filtering). The image defaults are overridden: the y axis
 * runs upwards (`autorange: true`) and `scaleanchor: false` lets the axes stretch instead of
 * keeping equal data units.
 */
export const meta: ExampleMeta = {
  title: 'Image: HSL colors, smoothed',
  description: 'Hue against lightness in the HSLA color model, bilinear-filtered.',
  tags: ['image', 'scientific', 'hsl', 'zsmooth'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const hues = 24;
  const lights = 9;
  const z = Array.from({ length: lights }, (_, j) =>
    Array.from({ length: hues }, (_, i) => [i * 15, 85, 10 + j * 10, 0.4 + (0.6 * i) / (hues - 1)]),
  );
  const chart = createChart(el, {
    data: [
      { type: 'image', z, colormodel: 'hsla', x0: 0, dx: 15, y0: 10, dy: 10, zsmooth: 'fast' },
    ],
    layout: {
      title: { text: 'Hue × lightness' },
      xaxis: { title: { text: 'hue (°)' } },
      yaxis: { title: { text: 'lightness (%)' }, autorange: true, scaleanchor: false },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
