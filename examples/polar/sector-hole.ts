import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Sectors and holes (plan E11.4): `polar.sector` keeps part of the circle (here the upper half,
 * `[0, 180]`, which fills the domain's width) and `polar.hole` cuts out the middle. Lines are
 * clipped to the subplot like Plotly's: the radial range starts at 2, so the trace dips below it
 * into the hole's edge, and runs past the sector's ends.
 */
export const meta: ExampleMeta = {
  title: 'Polar: sector and hole',
  description: 'A half-circle sector with a hole; lines and markers clipped to the subplot.',
  tags: ['polar', 'scatterpolar', 'sector', 'hole', 'clipping'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(11));
  const n = 90;
  const theta = Float64Array.from({ length: n }, (_, i) => -20 + (i * 220) / (n - 1));
  const chart = createChart(el, {
    data: [
      {
        type: 'scatterpolar',
        r: Float64Array.from(theta, (t) => 5 + 3 * Math.sin((t / 180) * Math.PI * 3)),
        theta,
        mode: 'lines',
        name: 'wave',
      },
      {
        type: 'scatterpolar',
        r: Float64Array.from({ length: 40 }, () => 5 + normal() * 1.5),
        theta: Float64Array.from({ length: 40 }, (_, i) => -10 + i * 5),
        mode: 'markers',
        name: 'samples',
      },
    ],
    layout: {
      title: { text: 'Sector [0, 180] with a 30% hole' },
      polar: {
        sector: [0, 180],
        hole: 0.3,
        radialaxis: { range: [2, 8.5] },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
