import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Starting territory',
  description:
    'Starting field position against net drive yards. A position of 20 means the offense’s own 20-yard line, regardless of team.',
  tags: ['demo', 'football', 'scatter'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'field-position', 'Starting territory');
}
