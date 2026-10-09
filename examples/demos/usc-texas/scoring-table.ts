import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: All thirteen scoring events',
  description:
    'The score column always lists Texas first. Touchdown rows include the points from the following kick or two-point conversion.',
  tags: ['demo', 'football', 'table'],
  size: { width: 960, height: 540 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'scoring-table', 'All thirteen scoring events');
}
