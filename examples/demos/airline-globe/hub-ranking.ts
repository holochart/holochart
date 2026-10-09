import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { runInfographic } from './charts.mts';

export const meta: ExampleMeta = {
  title: 'Airline industry: The connected hubs',
  description:
    'Airport connections split within and across regions, with an alternate ranking by geographic reach.',
  tags: ['demo', 'airlines', 'bar', 'network'],
  size: { width: 660, height: 740 },
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  return runInfographic(el, 'hub-ranking');
}
