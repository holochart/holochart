import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: How often did a play break loose',
  description:
    'Five-yard bins of net offensive gains. Zero includes incompletions, interceptions and runs with no gain.',
  tags: ['demo', 'football', 'histogram'],
  size: { width: 960, height: 440 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'gain-histogram', 'How often did a play break loose');
}
