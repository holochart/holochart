import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Moving the chains',
  description:
    'Third down: Texas 3/11, USC 8/14. Fourth down: Texas 1/2, USC 1/3. Red-zone scores: Texas 5/6, USC 4/5. Red-zone scoring includes field goals.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 420 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'conversions', 'Moving the chains');
}
