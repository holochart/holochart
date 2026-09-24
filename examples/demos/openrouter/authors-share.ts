import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { meta as tokensMeta, mount } from './authors-area.ts';

/**
 * The OpenRouter authors chart started in share mode: `groupnorm: 'percent'` on the first trace
 * of the stack group scales every week's stack to 100%, so each band is that author's share of
 * the week's tokens.
 */
export const meta: ExampleMeta = {
  ...tokensMeta,
  title: 'OpenRouter: share of weekly tokens by author',
  description:
    "The authors chart as 100% stacked areas (groupnorm: 'percent'): each band is an author's share of the week.",
};

export function run(el: HTMLElement): ExampleHandle {
  return mount(el, { share: true });
}
