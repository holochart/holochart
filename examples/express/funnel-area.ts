import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Express funnel area (plan E23.6): `px.funnel_area` — one `funnelarea` trace whose stages come
 * from `names` and whose areas from `values`, each stage in the next colorway color with a
 * legend entry per stage.
 */
export const meta: ExampleMeta = {
  title: 'Express: funnel area',
  description: 'Recruiting stages as a funnel area: one trapezoid per stage sized by its count.',
  tags: ['express', 'funnelarea', 'funnel', 'pie-like'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = [
    { stage: 'Applied', people: 120 },
    { stage: 'Screened', people: 64 },
    { stage: 'Interviewed', people: 30 },
    { stage: 'Offered', people: 12 },
    { stage: 'Hired', people: 9 },
  ];
  const figure = hx.funnelArea(rows, { names: 'stage', values: 'people', title: 'Hiring funnel' });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
