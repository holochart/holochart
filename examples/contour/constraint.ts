import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Constraint contours (plan E11.2), as in an optimization problem: the objective's level lines
 * (`coloring: 'none'`, labelled) under two constraints drawn with `contours.type: 'constraint'` —
 * `x² + y² >= 1` (outside the unit circle, `operation: '>='`) and `x + y <= 2.2`
 * (`operation: '<='`), each shading where it holds in a half-transparent `fillcolor` with a 2 px
 * boundary line. The feasible region is where both shadings overlap.
 */
export const meta: ExampleMeta = {
  title: 'Contour: constraint contours',
  description: 'Objective level lines with two shaded inequality constraints and their boundaries.',
  tags: ['contour', 'scientific', 'constraint', 'labels'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 81 }, (_, i) => -2 + i * 0.05);
  const y = Array.from({ length: 81 }, (_, j) => -2 + j * 0.05);
  const grid = (f: (px: number, py: number) => number): number[][] =>
    y.map((py) => x.map((px) => f(px, py)));
  const chart = createChart(el, {
    data: [
      {
        type: 'contour',
        name: 'objective',
        x,
        y,
        z: grid((px, py) => (px - 1.2) ** 2 + 2 * (py - 0.8) ** 2),
        contours: {
          coloring: 'none',
          start: 0.5,
          end: 6,
          size: 0.5,
          showlabels: true,
          labelfont: { size: 8, color: '#9a9cab' },
        },
        line: { color: '#9a9cab', width: 1 },
        showlegend: false,
      },
      {
        type: 'contour',
        name: 'x² + y² ≥ 1',
        x,
        y,
        z: grid((px, py) => px * px + py * py),
        contours: { type: 'constraint', operation: '>=', value: 1 },
        fillcolor: 'rgba(64, 196, 255, 0.18)',
        line: { color: '#40c4ff' },
      },
      {
        type: 'contour',
        name: 'x + y ≤ 2.2',
        x,
        y,
        z: grid((px, py) => px + py),
        contours: { type: 'constraint', operation: '<=', value: 2.2 },
        fillcolor: 'rgba(255, 110, 199, 0.18)',
        line: { color: '#ff6ec7', dash: 'dash' },
      },
    ],
    layout: {
      title: { text: 'Feasible region of two constraints' },
      xaxis: { title: { text: 'x' } },
      yaxis: { title: { text: 'y' }, scaleanchor: 'x' },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
