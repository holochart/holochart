import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Fourth and five, for the title',
  description:
    'The last ten Texas offensive plays. Bars show gains (orange rush, blue pass); the pale line shows field position on the right axis. An accepted USC penalty moves the ball between snaps and is not an offensive gain. Young’s last run gains eight yards from USC’s 8-yard line.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 500 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'final-drive', 'Fourth and five, for the title');
}
