import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Sixty minutes around the dial',
  description:
    'One revolution is the game: kickoff at the top, then Q2, Q3 and Q4 clockwise. Each spoke marks a scoring event; its height is the points added.',
  tags: ['demo', 'football', 'barpolar'],
  size: { width: 960, height: 520 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'scoring-clock', 'Sixty minutes around the dial');
}
