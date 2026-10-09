import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { runInfographic } from './charts.mts';

export const meta: ExampleMeta = {
  title: 'Airline industry: Airline route portfolios',
  description:
    'Carrier route counts and median distance, with bubbles sized by airports reached in the historical sample.',
  tags: ['demo', 'airlines', 'scatter', 'bubble', 'airlines'],
  size: { width: 760, height: 480 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  return runInfographic(el, 'carrier-portfolio');
}
