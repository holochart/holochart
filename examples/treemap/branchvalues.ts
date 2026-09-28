import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample } from '../_lib/hierarchy.ts';

/**
 * Remainder and total values (plan E13.3): the same budget twice. On the left
 * (`branchvalues: 'remainder'`, the default) each department's own value is added to its teams',
 * so departments carry overhead besides their teams; on the right (`'total'`) a department's value
 * is its total, and what its teams don't use stays empty.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: remainder and total values',
  description:
    "One budget read two ways: `branchvalues: 'remainder'` adds a department's value to its teams', `'total'` takes it as the total.",
  tags: ['treemap', 'hierarchical', 'chart', 'branchvalues'],
  size: { width: 720, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const labels = [
  'Budget',
  'Research',
  'Sales',
  'Support',
  'Lab',
  'Tools',
  'Field',
  'Online',
  'Desk',
];
const parents = [
  '',
  'Budget',
  'Budget',
  'Budget',
  'Research',
  'Research',
  'Sales',
  'Sales',
  'Support',
];
const values = [100, 45, 35, 20, 25, 10, 20, 15, 12];

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'treemap',
        name: 'remainder',
        labels,
        parents,
        values,
        textinfo: 'label+value',
        domain: { x: [0, 0.48] },
      },
      {
        type: 'treemap',
        name: 'total',
        labels,
        parents,
        values,
        branchvalues: 'total',
        textinfo: 'label+value',
        domain: { x: [0.52, 1] },
      },
    ],
    layout: {
      title: { text: "branchvalues: 'remainder' (left) and 'total' (right)" },
      margin: { l: 20, r: 20, t: 70, b: 20 },
    },
    config: { responsive: true },
  }));
}
