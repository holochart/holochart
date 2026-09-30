import { createChart } from '@mk7s/holochart';
import { linspace } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `surfacecolor` (plan E14.3): the colorscale maps its own values instead of the heights. A sphere
 * given as x, y and z matrices (a parametric surface) is colored by a made-up temperature that
 * varies with latitude and longitude; `cmin` / `cmax` fix the colorbar's range.
 */
export const meta: ExampleMeta = {
  title: 'Surface: surfacecolor',
  description: 'A parametric sphere colored by a separate field through surfacecolor.',
  tags: ['surface', '3d', 'scientific', 'colorscale'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const lat = linspace(-Math.PI / 2, Math.PI / 2, 40);
  const lon = linspace(0, 2 * Math.PI, 80);
  const x = lat.map((p) => lon.map((l) => Math.cos(p) * Math.cos(l)));
  const y = lat.map((p) => lon.map((l) => Math.cos(p) * Math.sin(l)));
  const z = lat.map((p) => lon.map(() => Math.sin(p)));
  const temperature = lat.map((p) =>
    lon.map((l) => 30 * Math.cos(p) ** 2 - 10 + 6 * Math.sin(3 * l) * Math.cos(p)),
  );
  const chart = createChart(el, {
    data: [
      {
        type: 'surface',
        x,
        y,
        z,
        surfacecolor: temperature,
        cmin: -10,
        cmax: 26,
        colorbar: { title: { text: '°C' } },
      },
    ],
    layout: {
      title: { text: 'Surface temperature' },
      scene: { aspectmode: 'data', camera: { eye: { x: 1.4, y: 1.1, z: 0.8 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
