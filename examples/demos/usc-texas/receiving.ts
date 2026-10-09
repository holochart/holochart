import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Every receiving contribution',
  description: 'Official receiving totals, including the negative-yard catches by Texas backs.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 570 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'receiving', 'Every receiving contribution');
}
