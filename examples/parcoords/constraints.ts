import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Constraint ranges (plan E10.10): `constraintrange` selects lines inside `[lo, hi]` on an axis,
 * and with `multiselect` (the default) takes several ranges, `[[lo, hi], [lo2, hi2]]`. Lines
 * outside a range on any constrained axis are drawn in the `unselected` style (grey, faint); the
 * ranges show as magenta bars on their axes. Brushing an axis edits these ranges and restyles them.
 */
export const meta: ExampleMeta = {
  title: 'Parallel coordinates: constraint ranges',
  description:
    'Two brushed ranges on one axis and one on another; lines outside them fade to grey.',
  tags: ['parcoords', 'statistical', 'domain', 'selection', 'colorscale'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(5));
  const n = 600;
  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = normal();
    a.push(+(50 + 15 * t + 5 * normal()).toFixed(2));
    b.push(+(20 - 6 * t + 4 * normal()).toFixed(2));
    c.push(+(100 + 30 * normal()).toFixed(2));
    d.push(+(5 + 2 * t * t + normal()).toFixed(2));
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'parcoords',
        line: { color: a },
        dimensions: [
          { label: 'Load (%)', values: a },
          {
            label: 'Latency (ms)',
            values: b,
            constraintrange: [
              [8, 14],
              [24, 30],
            ],
          },
          { label: 'Throughput', values: c, constraintrange: [70, 140] },
          { label: 'Errors / min', values: d },
        ],
      },
    ],
    layout: {
      title: { text: 'Brushed: two latency bands, one throughput band' },
      margin: { t: 64, l: 48, r: 32, b: 32 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
