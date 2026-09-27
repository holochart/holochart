import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeChart } from './selections-hook.mts';

/**
 * Decimation check for E16.2 (used by tests/interaction/decimation.spec.ts): 300,000 points with
 * a few gaps in one line, drawn through the min/max level of detail. The test screenshots it, turns
 * decimation off (`line.simplify: false`, every vertex drawn) and compares, at the full view and
 * zoomed in; it also streams points in with `extendTraces`.
 */
export const meta: ExampleMeta = {
  title: 'Decimated vs full line (E16.2 check)',
  description:
    '300k points with gaps, drawn decimated; the interaction suite compares it with every vertex drawn.',
  tags: ['dev', 'no-visual-test', 'line', 'scatter', 'performance'],
  size: { width: 640, height: 400 },
};

const COUNT = 300_000;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(16_2));
  const x = new Float64Array(COUNT);
  const y = new Float64Array(COUNT);
  let level = 0;
  for (let i = 0; i < COUNT; i++) {
    level += normal();
    x[i] = i;
    // Two gaps: the line breaks there.
    y[i] = (i > 100_000 && i < 101_500) || (i > 220_000 && i < 220_300) ? NaN : level;
  }
  const chart = createChart(el, {
    data: [{ type: 'scatter', mode: 'lines', x, y, line: { width: 1, color: '#2a6fdb' } }],
    layout: {
      showlegend: false,
      margin: { l: 50, r: 20, t: 20, b: 40 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
    },
  });
  const unexpose = exposeChart(chart);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      unexpose();
      chart.destroy();
    },
  };
}
