import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Polar lines (plan E11.4): the same closed curve drawn with straight segments and with
 * `line.shape: 'spline'` (Plotly's screen-space Catmull-Rom smoothing), plus a dashed
 * `thetaunit: 'radians'` trace. Angles on the axis read in radians (`angularaxis.thetaunit`).
 */
export const meta: ExampleMeta = {
  title: 'Polar: splines and radians',
  description: 'Linear and spline lines through the same points; radian angles and labels.',
  tags: ['polar', 'scatterpolar', 'lines', 'spline', 'radians'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const n = 9;
  const theta = Array.from({ length: n + 1 }, (_, i) => ((i % n) * 2 * Math.PI) / n);
  const r = theta.map((t, i) => (i % 2 === 0 ? 3.2 : 2) + 0.4 * Math.cos(3 * t));
  const rose = Array.from({ length: 121 }, (_, i) => (i * 2 * Math.PI) / 120);
  const chart = createChart(el, {
    data: [
      { type: 'scatterpolar', r, theta, thetaunit: 'radians', name: 'linear' },
      {
        type: 'scatterpolar',
        r: r.map((v) => v + 1),
        theta,
        thetaunit: 'radians',
        line: { shape: 'spline', smoothing: 1.3 },
        name: 'spline',
      },
      {
        type: 'scatterpolar',
        r: rose.map((t) => 1.2 + Math.abs(Math.sin(2 * t))),
        theta: rose,
        thetaunit: 'radians',
        mode: 'lines',
        line: { dash: 'dash' },
        name: 'rose',
      },
    ],
    layout: {
      title: { text: 'Linear and spline lines' },
      polar: { angularaxis: { thetaunit: 'radians' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
