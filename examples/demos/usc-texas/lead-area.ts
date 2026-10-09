import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Who had the lead',
  description:
    'Above zero, Texas leads; below zero, USC leads. The orange finish is only 19 seconds wide.',
  tags: ['demo', 'football', 'scatter'],
  size: { width: 960, height: 420 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'lead-area', 'Who had the lead');
}
