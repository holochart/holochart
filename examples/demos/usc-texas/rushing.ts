import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Every rushing contribution',
  description:
    'Net rushing yards, including TEAM’s kneel-down and negative player totals. Team color stays consistent throughout the demo.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 500 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'rushing', 'Every rushing contribution');
}
