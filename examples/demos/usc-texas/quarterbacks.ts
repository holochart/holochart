import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: Two championship quarterbacks',
  description:
    'Vince Young: 267 passing + 200 rushing. Matt Leinart: 365 passing + 2 net rushing, after sack yardage. USC’s other pass attempt was by Dwayne Jarrett.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 440 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'quarterbacks', 'Two championship quarterbacks');
}
