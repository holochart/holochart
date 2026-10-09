import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Four very different quarters',
  description:
    'Texas scored 16 points in the second quarter and 18 in the fourth. USC scored 28 points after halftime.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 420 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'quarter-bars', 'Four very different quarters');
}
