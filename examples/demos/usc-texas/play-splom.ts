import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Down, distance, territory, gain',
  description:
    'A scatterplot matrix of down, yards to go, field position and net gain. Texas is orange and USC is red. The diagonal and duplicate upper triangle are hidden.',
  tags: ['demo', 'football', 'splom'],
  size: { width: 960, height: 650 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'play-splom', 'Down, distance, territory, gain');
}
