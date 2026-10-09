import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Yards per carry',
  description:
    'Net rushing yards divided by attempts. Sacks are deducted from Matt Leinart’s rushing total. Small samples, such as one carry, remain visible.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 500 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'rushing-efficiency', 'Yards per carry');
}
