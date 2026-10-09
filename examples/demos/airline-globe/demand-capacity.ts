import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { runInfographic } from './charts.mts';

export const meta: ExampleMeta = {
  title: 'Airline industry: Passenger demand and capacity',
  description:
    'Regional passenger traffic and seat capacity growth in 2025, from the IATA January 2026 release.',
  tags: ['demo', 'airlines', 'bar', 'industry'],
  size: { width: 760, height: 440 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  return runInfographic(el, 'demand-capacity');
}
