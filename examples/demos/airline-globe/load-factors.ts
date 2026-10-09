import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { runInfographic } from './charts.mts';

export const meta: ExampleMeta = {
  title: 'Airline industry: How much seat capacity is used',
  description:
    'Regional load factors in 2025, measured as passenger kilometers divided by seat kilometers.',
  tags: ['demo', 'airlines', 'bar', 'industry'],
  size: { width: 760, height: 380 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  return runInfographic(el, 'load-factors');
}
