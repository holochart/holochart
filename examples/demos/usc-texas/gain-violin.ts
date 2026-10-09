import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: The shape of the game',
  description:
    'Smoothed gain distributions with inner boxes. The smoothing describes this game’s observed plays; it is not a prediction model.',
  tags: ['demo', 'football', 'violin'],
  size: { width: 960, height: 460 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'gain-violin', 'The shape of the game');
}
