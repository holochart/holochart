import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Thirty-two minutes to twenty-eight',
  description:
    'USC’s possession advantage did not produce a scoring advantage. Both values come from the official time-of-possession totals.',
  tags: ['demo', 'football', 'pie'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'possession', 'Thirty-two minutes to twenty-eight');
}
