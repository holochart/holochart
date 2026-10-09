import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Thirty first downs apiece',
  description:
    'The totals match, but Texas earned more on the ground and USC earned more through the air and by penalty.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 420 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'first-downs', 'Thirty first downs apiece');
}
