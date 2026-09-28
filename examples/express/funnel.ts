import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Express funnel (plan E23.6): `px.funnel` — one `funnel` trace per office, stages on the y axis
 * (first at the top) and the counts as bar widths, stacked per stage (`funnelmode: 'stack'`).
 */
export const meta: ExampleMeta = {
  title: 'Express: funnel by group',
  description: 'A sales funnel of two offices, stacked per stage, from long-form rows.',
  tags: ['express', 'funnel', 'grouping', 'stacked'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

const STAGES = [
  'Website visit',
  'Downloads',
  'Potential customers',
  'Requested price',
  'Invoice sent',
];
const COUNTS: Record<string, number[]> = {
  Montreal: [39, 27.4, 20.6, 11, 2],
  Toronto: [52, 36, 18, 14, 5],
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = Object.entries(COUNTS).flatMap(([office, counts]) =>
    counts.map((number, i) => ({ stage: STAGES[i], office, number })),
  );
  const figure = hx.funnel(rows, {
    x: 'number',
    y: 'stage',
    color: 'office',
    title: 'Sales funnel per office',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
