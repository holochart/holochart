import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: The same offense in rings',
  description:
    'The hierarchy from the treemap shown radially. Click a branch to explore it. Only positive net player-category totals are represented.',
  tags: ['demo', 'football', 'sunburst'],
  size: { width: 960, height: 580 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'player-sunburst', 'The same offense in rings');
}
