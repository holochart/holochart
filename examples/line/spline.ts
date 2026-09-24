import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Spline vs linear (plan E9.2): the same 12 sparse points drawn straight, as a spline with the
 * default `smoothing: 1`, and as a looser spline with `smoothing: 1.3`. A spline passes through
 * every point; smoothing only changes how round the curve is between them.
 */
export const meta: ExampleMeta = {
  title: 'Line: spline vs linear',
  description:
    "The same sparse points drawn with line.shape 'linear' and 'spline' at smoothing 0.6, 1 and 1.3.",
  tags: ['line', 'scatter', 'spline'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(7));
  const x = Array.from({ length: 12 }, (_, i) => i);
  const y = x.map((v) => 10 + 4 * Math.sin(v / 1.8) + normal() * 1.2);

  const lines = [
    { name: 'linear', line: { shape: 'linear', dash: 'dot', width: 1.5, color: '#80838f' } },
    { name: 'spline, smoothing 0.6', line: { shape: 'spline', smoothing: 0.6 } },
    { name: 'spline, smoothing 1', line: { shape: 'spline' } },
    { name: 'spline, smoothing 1.3', line: { shape: 'spline', smoothing: 1.3 } },
  ];

  const chart = createChart(el, {
    data: [
      ...lines.map((l) => ({ type: 'scatter', mode: 'lines', x, y, ...l })),
      {
        type: 'scatter',
        mode: 'markers',
        name: 'data',
        x,
        y,
        marker: { size: 6, color: '#eceef4' },
      },
    ],
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
