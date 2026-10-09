import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: The leading tacklers',
  description:
    'The 14 highest individual tackle totals in USC’s official report, split into solo and assisted tackles. TEAM credits are excluded.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 620 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'defense', 'The leading tacklers');
}
