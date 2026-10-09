import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { runInfographic } from './charts.mts';

export const meta: ExampleMeta = {
  title: 'Airline industry: The shape of route distances',
  description: 'Great-circle distances in 2,000 km bins, split within and across regions.',
  tags: ['demo', 'airlines', 'bar', 'histogram', 'network'],
  size: { width: 760, height: 420 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  return runInfographic(el, 'route-distance');
}
