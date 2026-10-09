import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Volume and distance',
  description:
    'Receptions against receiving yards. Marker diameter is 8 + longest reception / 2 pixels; hover gives the exact longest catch.',
  tags: ['demo', 'football', 'scatter'],
  size: { width: 960, height: 500 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'receiver-bubbles', 'Volume and distance');
}
