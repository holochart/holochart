import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Line smoothing (plan E11.2): the same coarse 9 × 7 grid contoured twice, with
 * `line.smoothing: 0` (straight segments between the grid crossings, left) and `1.3` (Plotly's
 * maximum spline smoothing, right). Smoothing applies to the fills as well as the lines.
 */
export const meta: ExampleMeta = {
  title: 'Contour: line smoothing',
  description:
    'A coarse grid contoured with straight segments (left) and maximum smoothing (right).',
  tags: ['contour', 'scientific', 'smoothing'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 9 }, (_, i) => i);
  const y = Array.from({ length: 7 }, (_, j) => j);
  const z = y.map((py) =>
    x.map((px) => Math.sin(px * 0.8) * Math.cos(py * 0.9) + 0.15 * px - 0.1 * py),
  );
  const common = {
    type: 'contour' as const,
    x,
    y,
    z,
    ncontours: 8,
    coloraxis: 'coloraxis',
    line: { color: 'rgba(10, 10, 15, 0.7)', width: 1 },
  };
  const chart = createChart(el, {
    data: [
      { ...common, name: 'smoothing 0', line: { ...common.line, smoothing: 0 } },
      {
        ...common,
        name: 'smoothing 1.3',
        line: { ...common.line, smoothing: 1.3 },
        xaxis: 'x2',
        yaxis: 'y2',
      },
    ],
    layout: {
      title: { text: 'line.smoothing: 0 vs 1.3' },
      grid: { rows: 1, columns: 2, pattern: 'independent' },
      xaxis: { title: { text: 'smoothing: 0' } },
      xaxis2: { title: { text: 'smoothing: 1.3' } },
      coloraxis: { colorbar: { title: { text: 'z' } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
