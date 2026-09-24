import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Violin scaling (plan E10.5). Left: every trace is its own scale group (the default: `scalegroup`
 * is the trace name), so each violin fills its slot whatever its density. Right: one `scalegroup`
 * with `scalemode: 'count'`, so widths compare densities and are also proportional to the sample
 * count — the 30-sample group is visibly thinner than the 300-sample one.
 */
export const meta: ExampleMeta = {
  title: 'Violin: scale groups and count scaling',
  description:
    'The same samples scaled per trace (left) and in one scale group proportional to sample counts (right).',
  tags: ['violin', 'statistical', 'distribution', 'scalegroup', 'kde', 'subplots'],
  testTolerance: 0.004,
};

const GROUPS: [string, number, number, number][] = [
  ['small', 30, 10, 2],
  ['medium', 120, 12, 3],
  ['large', 300, 11, 4],
];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(41));
  const samples = GROUPS.map(([, n, mu, sigma]) =>
    Array.from({ length: n }, () => mu + sigma * normal()),
  );
  const traces = (axes: { xaxis: string; yaxis: string }, grouped: boolean) =>
    GROUPS.map(([name], i) => ({
      type: 'violin',
      name,
      y: samples[i],
      points: false,
      ...axes,
      ...(grouped ? { scalegroup: 'all', scalemode: 'count' } : {}),
    }));
  const chart = createChart(el, {
    data: [
      ...traces({ xaxis: 'x', yaxis: 'y' }, false),
      ...traces({ xaxis: 'x2', yaxis: 'y2' }, true),
    ],
    layout: {
      title: { text: 'Per-trace scaling vs. one count-scaled group' },
      showlegend: false,
      xaxis: { domain: [0, 0.47] },
      xaxis2: { domain: [0.53, 1], anchor: 'y2' },
      yaxis2: { anchor: 'x2', showticklabels: false },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
