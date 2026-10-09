import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: The game as a point cloud',
  description:
    'Play order, offensive field position and net gain in three dimensions. Hover for the play details and drag to orbit.',
  tags: ['demo', 'football', 'scatter3d', '3d'],
  size: { width: 960, height: 600 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'play-3d', 'The game as a point cloud');
}
