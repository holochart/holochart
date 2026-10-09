import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: The typical gain and the outliers',
  description:
    'Every play is a dot. The box gives the median and interquartile range; the long upper tail contains the explosive gains.',
  tags: ['demo', 'football', 'box'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'gain-box', 'The typical gain and the outliers');
}
