import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Ten, twenty, thirty',
  description:
    'Counts of offensive plays gaining at least 10, 20 and 30 yards. These thresholds overlap: every 30-yard play also counts in the other two bars.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 440 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'explosives', 'Ten, twenty, thirty');
}
