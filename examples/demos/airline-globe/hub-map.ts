import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { runInfographic } from './charts.mts';

export const meta: ExampleMeta = {
  title: 'Airline industry: Airline hubs on the map',
  description: 'A Natural Earth bubble map of connectivity in the selected 2014 airport network.',
  tags: ['demo', 'airlines', 'geo', 'scattergeo', 'bubble'],
  size: { width: 960, height: 480 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  return runInfographic(el, 'hub-map');
}
