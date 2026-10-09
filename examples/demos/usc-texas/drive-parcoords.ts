import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: The anatomy of a possession',
  description:
    'Each line is a drive, linking team, start field, play count, yardage, duration and points. Drag along an axis to brush a range.',
  tags: ['demo', 'football', 'parcoords'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'drive-parcoords', 'The anatomy of a possession');
}
