import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: How the offense changed',
  description:
    'Net rushing and passing yards for each team and quarter, assigned to the quarter of the snap. Sacks remain in rushing.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'run-pass-quarter', 'How the offense changed');
}
