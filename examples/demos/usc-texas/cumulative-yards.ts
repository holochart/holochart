import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Building up 1,130 yards',
  description:
    'Net offensive yardage accumulates in game order, including downward steps for losses. The endpoints reconcile to Texas 556 and USC 574.',
  tags: ['demo', 'football', 'scatter'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'cumulative-yards', 'Building up 1,130 yards');
}
