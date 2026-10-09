import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: One dot per offensive play',
  description:
    'Circles are rushes and diamonds are passes; larger dots are touchdowns. The horizontal axis is play order, not elapsed time.',
  tags: ['demo', 'football', 'scatter'],
  size: { width: 960, height: 480 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'snap-gains', 'One dot per offensive play');
}
