import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Where the yardage came from',
  description:
    'Team → rush or reception → player. Area represents positive player-category net yardage. Negative categories and TEAM are omitted, so this tree is not a total-offense reconciliation.',
  tags: ['demo', 'football', 'treemap'],
  size: { width: 960, height: 580 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'player-treemap', 'Where the yardage came from');
}
