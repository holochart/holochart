import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample } from '../_lib/hierarchy.ts';

/**
 * The path bar (plan E13.3): with `level` set to a department deep in the hierarchy, the bar lists
 * its ancestors, root first; clicking a segment goes up to it. Four edge shapes (`>`, `/`, `|`,
 * `\`), on top or (`pathbar.side: 'bottom'`) below the tiles, one of them thicker.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: path bar',
  description: 'Path bars of a drilled-in treemap with each edge shape, above or below the tiles.',
  tags: ['treemap', 'hierarchical', 'chart', 'pathbar'],
  size: { width: 760, height: 480 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const ids = [
  'World',
  'Europe',
  'Asia',
  'Nordics',
  'Benelux',
  'Sweden',
  'Norway',
  'Denmark',
  'Japan',
];
const labels = ids;
const parents = ['', 'World', 'World', 'Europe', 'Europe', 'Nordics', 'Nordics', 'Nordics', 'Asia'];
const values = [0, 0, 0, 0, 30, 10, 5.5, 5.9, 125];
const SHAPES = [
  ['>', 'top'],
  ['/', 'top'],
  ['|', 'bottom'],
  ['\\', 'bottom'],
] as const;

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: SHAPES.map(([edgeshape, side], k) => ({
      type: 'treemap' as const,
      ids,
      labels,
      parents,
      values,
      level: 'Nordics',
      pathbar: { edgeshape, side, ...(k === 1 ? { thickness: 26 } : {}) },
      textinfo: 'label+value',
      domain: { row: Math.floor(k / 2), column: k % 2 },
    })),
    layout: {
      grid: { rows: 2, columns: 2, xgap: 0.06, ygap: 0.2 },
      margin: { l: 20, r: 20, t: 50, b: 40 },
    },
    config: { responsive: true },
  }));
}
