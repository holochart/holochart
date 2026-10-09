import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Yards gained by down',
  description:
    'Average net offensive gain at each down, including zero-yard pass attempts. Fourth down has a very small sample; special-teams attempts are excluded.',
  tags: ['demo', 'football', 'heatmap'],
  size: { width: 960, height: 420 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'down-heatmap', 'Yards gained by down');
}
