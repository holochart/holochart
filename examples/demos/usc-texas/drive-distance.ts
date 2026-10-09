import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: How far each possession traveled',
  description:
    'Official net drive yardage, in game order. Penalties affect drive distance, so adding these bars does not reproduce net offensive yardage.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 440 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'drive-distance', 'How far each possession traveled');
}
