import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample, EVE } from '../_lib/hierarchy.ts';

/**
 * Basic icicle (plan E13.4): Plotly's Eve family tree as columns of cells, the root on the left and
 * each generation to the right of its parents, cells as tall as their values. Leaves are faded
 * (`leaf.opacity` 0.7) and Eve's own value leaves a gap below her children.
 */
export const meta: ExampleMeta = {
  title: 'Icicle: basic',
  description:
    "Plotly's Eve family tree as columns of cells from the root on the left, sized by value.",
  tags: ['icicle', 'hierarchical', 'chart', 'text', 'basic'],
  size: { width: 640, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [{ type: 'icicle', ...EVE }],
    layout: { title: { text: 'The family of Eve' }, margin: { l: 20, r: 20, t: 50, b: 20 } },
    config: { responsive: true },
  }));
}
