import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Who had the ball, and when',
  description:
    'Every nonzero drive positioned on the game clock. Bars can span quarter boundaries. Hover for the result, duration, plays and yards.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 720 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'drive-timeline', 'Who had the ball, and when');
}
