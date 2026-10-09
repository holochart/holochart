import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: The pace of scoring',
  description:
    'Only scoring possessions: net yards against elapsed minutes. Texas’s final touchdown drive covered 56 net yards in 1:50.',
  tags: ['demo', 'football', 'scatter'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'scoring-drive-speed', 'The pace of scoring');
}
