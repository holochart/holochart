import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Several polar subplots (plan E11.4): traces pick theirs with `subplot` (`'polar'`, `'polar2'`,
 * …); each `layout.polarN` has its own `domain`, axes and background. Without domains, subplots
 * sit side by side (Plotly). Here: a log radial axis on the left (one tick per decade, `dtick: 1`),
 * a compass on the right with the radial labels on the counterclockwise side.
 */
export const meta: ExampleMeta = {
  title: 'Polar: subplots and a log radial axis',
  description: 'Two polar subplots with their own domains; the left one has a log radial axis.',
  tags: ['polar', 'scatterpolar', 'subplots', 'log', 'domain'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const theta = Array.from({ length: 37 }, (_, i) => i * 10);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatterpolar',
        r: theta.map((t) => 10 ** (1 + (2.5 * t) / 360)),
        theta,
        mode: 'lines+markers',
        name: 'growth (log r)',
      },
      {
        type: 'scatterpolar',
        subplot: 'polar2',
        r: theta.map((t) => 2 + Math.cos((t / 180) * Math.PI * 2)),
        theta,
        mode: 'lines',
        fill: 'toself',
        name: 'bearing',
      },
    ],
    layout: {
      title: { text: 'Two polar subplots' },
      polar: {
        domain: { x: [0, 0.46] },
        radialaxis: { type: 'log', angle: 45, dtick: 1 },
      },
      polar2: {
        domain: { x: [0.54, 1] },
        angularaxis: { direction: 'clockwise' },
        radialaxis: { side: 'counterclockwise' },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
