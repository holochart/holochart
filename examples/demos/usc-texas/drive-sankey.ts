import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Where the possessions ended',
  description:
    'All 26 possessions, including the zero-play punt-return fumble. Flow width is the number of drives. The source labels both half-ending and game-ending possessions “End of half.”',
  tags: ['demo', 'football', 'sankey'],
  size: { width: 960, height: 500 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'drive-sankey', 'Where the possessions ended');
}
