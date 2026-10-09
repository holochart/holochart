import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Two paths to the end zone',
  description:
    'Stacked rushing and passing yardage: Texas 556 total yards, USC 574. Passing yards are counted once, rather than being added again as receiving yards.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 420 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'offense-stack', 'Two paths to the end zone');
}
