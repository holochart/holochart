import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Who put points on the board',
  description:
    'Touchdowns credit six points to the scorer, kicks credit the kicker, and Young receives the two-point conversion. The bars sum to all 79 points.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 500 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'scoring-players', 'Who put points on the board');
}
