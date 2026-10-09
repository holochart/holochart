import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Every swing of the margin',
  description:
    'Each scoring event adds Texas points or subtracts USC points. The running total ends at Texas +3. Touchdowns include the subsequent extra point or conversion.',
  tags: ['demo', 'football', 'waterfall'],
  size: { width: 960, height: 480 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'scoring-waterfall', 'Every swing of the margin');
}
