import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { meta as linearMeta, mount } from './weekly-tokens.ts';

/**
 * The weekly-tokens chart of the OpenRouter demo started on its log y axis: on a log scale an
 * exponential is a straight line, so how well it fits (and the upward bend of the last weeks) is
 * easy to judge. Same figure as `weekly-tokens`, with `yaxis.type: 'log'`, an explicit log range
 * (in exponents) and the end-of-line annotations placed by exponent.
 */
export const meta: ExampleMeta = {
  ...linearMeta,
  title: 'OpenRouter: weekly tokens on a log axis',
  description:
    'The weekly-tokens chart with a log y axis, where the exponential fit is a straight line.',
};

export function run(el: HTMLElement): ExampleHandle {
  return mount(el, { log: true });
}
