import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: A lead is not a result',
  description:
    'Time spent ahead, measured between scoring events. Tied time includes the opening 2:33. This is clock time, not a win-probability estimate.',
  tags: ['demo', 'football', 'pie'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'lead-time', 'A lead is not a result');
}
