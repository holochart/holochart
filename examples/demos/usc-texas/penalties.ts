import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Yards given away',
  description:
    'Penalty yardage and yards lost on rushing plays, shown separately. These are different official categories and should not be added to total offense.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 420 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'penalties', 'Yards given away');
}
