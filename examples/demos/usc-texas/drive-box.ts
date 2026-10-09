import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: The spread of drive lengths',
  description:
    'Boxes summarize the nonzero drives for each team; dots show each actual drive, including negative net yardage.',
  tags: ['demo', 'football', 'box'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'drive-box', 'The spread of drive lengths');
}
