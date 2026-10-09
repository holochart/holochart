import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Long drives, quick drives',
  description:
    'Plays against drive yards. Larger circles represent more points: size is 8 + 3 × points in pixels. Empty possessions are the smallest circles.',
  tags: ['demo', 'football', 'scatter'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'drive-bubbles', 'Long drives, quick drives');
}
