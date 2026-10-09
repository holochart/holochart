import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Ten-yard bins',
  description:
    'A histogram of official net drive yardage, with 10-yard bins. The overlap makes the shared cluster of long drives visible.',
  tags: ['demo', 'football', 'histogram'],
  size: { width: 960, height: 440 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'drive-histogram', 'Ten-yard bins');
}
