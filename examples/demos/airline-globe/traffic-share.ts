import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { runInfographic } from './charts.mts';

export const meta: ExampleMeta = {
  title: 'Airline industry: Where passenger traffic comes from',
  description: 'Regional shares of global revenue passenger kilometers in 2025.',
  tags: ['demo', 'airlines', 'pie', 'donut', 'industry'],
  size: { width: 600, height: 440 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  return runInfographic(el, 'traffic-share');
}
