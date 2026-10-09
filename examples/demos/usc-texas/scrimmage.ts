import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Rushes plus receptions',
  description:
    'Each player’s net rushing and receiving yards combined. Quarterback passing yards are excluded to avoid counting a completed pass twice.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 650 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'scrimmage', 'Rushes plus receptions');
}
