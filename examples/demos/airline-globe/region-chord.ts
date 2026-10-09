import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { runInfographic } from './charts.mts';

export const meta: ExampleMeta = {
  title: 'Airline industry: Routes between regions',
  description:
    'An undirected chord diagram aggregating each of the 174 historical airport pairs once.',
  tags: ['demo', 'airlines', 'chord', 'graph', 'network'],
  size: { width: 640, height: 600 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  return runInfographic(el, 'region-chord');
}
