import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Loose balls and lost possessions',
  description:
    'Texas fumbled four times but lost only one. USC lost its only fumble and threw the game’s only interception.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 420 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'turnovers', 'Loose balls and lost possessions');
}
