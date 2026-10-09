import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Two halves, different outcomes',
  description:
    'Drive counts flow from team through the half in which the possession started to its recorded result. A drive crossing halftime is not split.',
  tags: ['demo', 'football', 'parcats'],
  size: { width: 960, height: 500 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'drive-parcats', 'Two halves, different outcomes');
}
