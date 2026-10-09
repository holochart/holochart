import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: The race to 41',
  description:
    'Step lines change only when points are scored. Texas took the lead for the last time with 19 seconds left.',
  tags: ['demo', 'football', 'scatter'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'score-line', 'The race to 41');
}
