import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: The scoreboard in three dimensions',
  description:
    'The quarter-by-quarter score as eight extruded bars. Rotate the view to inspect each team’s row.',
  tags: ['demo', 'football', 'bar3d', '3d'],
  size: { width: 960, height: 560 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'quarter-3d', 'The scoreboard in three dimensions');
}
