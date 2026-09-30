import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3D bars colored by height (plan E14.9): monthly temperature anomalies (°C, synthetic) over ten
 * years. With a `marker.colorscale` and no `marker.color` array the bars are colored by `z`; a
 * diverging scale centered on zero (`cmid: 0`: Plotly's `RdBu` runs from blue to red) and a colorbar
 * (`showscale`). Negative anomalies go down from the
 * `base` (0 by default).
 */
export const meta: ExampleMeta = {
  title: 'Bar3D: colored by height (colorscale)',
  description: 'Temperature anomalies as 3D bars colored by value through a diverging colorscale.',
  tags: ['bar3d', '3d', 'bar', 'colorscale', 'colorbar', 'holochart-extension'],
  testTolerance: 0.004,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function run(el: HTMLElement): ExampleHandle {
  const x: string[] = [];
  const y: number[] = [];
  const z: number[] = [];
  for (let year = 2015; year < 2025; year++) {
    for (let m = 0; m < 12; m++) {
      x.push(MONTHS[m]!);
      y.push(year);
      const trend = (year - 2019.5) * 0.12;
      const season = 0.35 * Math.sin((m / 12) * 2 * Math.PI + year);
      const wiggle = 0.25 * Math.sin(m * 1.7 + year * 2.3);
      z.push(Math.round((trend + season + wiggle) * 100) / 100);
    }
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'bar3d',
        name: 'anomaly',
        x,
        y,
        z,
        marker: {
          colorscale: 'RdBu',
          cmid: 0,
          showscale: true,
          colorbar: { title: { text: '°C' } },
        },
      },
    ],
    layout: {
      title: { text: 'Monthly temperature anomaly' },
      scene: {
        camera: { eye: { x: 1.2, y: -1.7, z: 0.9 } },
        aspectmode: 'manual',
        aspectratio: { x: 1.3, y: 1, z: 0.5 },
        yaxis: { dtick: 2 },
        zaxis: { title: { text: '°C' } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
