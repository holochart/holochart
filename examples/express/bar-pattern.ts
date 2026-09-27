import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Express bar with patterns (plan E23.2, E8.10): `color` groups the rows by nation and `pattern`
 * by medal, so every nation × medal pair is its own trace with a `marker.pattern.shape` from
 * `patternShapeSequence` (like `px.bar(..., pattern_shape=...)`); the legend lists both.
 */
export const meta: ExampleMeta = {
  title: 'Express: bar with pattern groups',
  description: 'Medal counts stacked per nation, colored by nation and hatched by medal.',
  tags: ['express', 'bar', 'pattern', 'grouping', 'stacked'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

const MEDALS: readonly { nation: string; medal: string; count: number }[] = [
  { nation: 'South Korea', medal: 'gold', count: 24 },
  { nation: 'China', medal: 'gold', count: 10 },
  { nation: 'Canada', medal: 'gold', count: 9 },
  { nation: 'South Korea', medal: 'silver', count: 13 },
  { nation: 'China', medal: 'silver', count: 15 },
  { nation: 'Canada', medal: 'silver', count: 12 },
  { nation: 'South Korea', medal: 'bronze', count: 11 },
  { nation: 'China', medal: 'bronze', count: 8 },
  { nation: 'Canada', medal: 'bronze', count: 12 },
];

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.bar(MEDALS, {
    x: 'nation',
    y: 'count',
    color: 'nation',
    pattern: 'medal',
    patternShapeSequence: ['.', 'x', '/'],
    title: 'Medals by nation',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
