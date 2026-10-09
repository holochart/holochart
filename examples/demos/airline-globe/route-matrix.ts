import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { runInfographic } from './charts.mts';

export const meta: ExampleMeta = {
  title: 'Airline industry: Shared routes in the network',
  description:
    'A symmetric airport adjacency matrix colored by the number of selected carriers recorded per pair.',
  tags: ['demo', 'airlines', 'heatmap', 'matrix', 'network'],
  size: { width: 760, height: 680 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  return runInfographic(el, 'route-matrix');
}
