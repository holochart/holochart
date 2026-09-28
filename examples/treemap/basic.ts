import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, EVE } from '../_lib/hierarchy.ts';

/**
 * Basic treemap (plan E13.3): Plotly's Eve family tree as nested tiles, squarified, each branch
 * with its label in a header band, colors from the colorway faded towards the background from the
 * leaves up (`marker.depthfade`). Eve's own value leaves part of her tile empty
 * (`branchvalues: 'remainder'`).
 */
export const meta: ExampleMeta = {
  title: 'Treemap: basic',
  description:
    "Plotly's Eve family tree as nested tiles sized by value, with branch headers and faded parents.",
  tags: ['treemap', 'hierarchical', 'chart', 'text', 'basic'],
  size: { width: 640, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [{ type: 'treemap', ...EVE }],
    layout: { title: { text: 'The family of Eve' }, margin: { l: 20, r: 20, t: 50, b: 20 } },
    config: { responsive: true },
  }));
}
