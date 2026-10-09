import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { demo } from './ui.mts';

export const meta: ExampleMeta = {
  title: 'USC\u2013Texas: What each attempt produced',
  description:
    'Net yards divided by the official attempts: Texas gained 8.03 per rush; USC gained 8.90 per pass attempt. Total-play efficiency uses rushing plus passing attempts.',
  tags: ['demo', 'football', 'bar'],
  size: { width: 960, height: 420 },
};

export function run(el: HTMLElement): ExampleHandle {
  return demo(el, 'efficiency', 'What each attempt produced');
}
