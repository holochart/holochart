import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Arrangement and order (plan E10.11): `arrangement: 'freeform'` lets a dragged category band move
 * its whole dimension sideways as well as reorder the categories (`'perpendicular'`, the default,
 * moves bands only vertically; `'fixed'` turns dragging off). `displayindex` sets the dimension
 * order (here the last dimension is shown first), and `sortpaths: 'backward'` stacks the paths
 * inside each band by the dimensions to its right, from the last one back.
 */
export const meta: ExampleMeta = {
  title: 'Parallel categories: freeform arrangement',
  description:
    'Dimensions reordered with displayindex, paths sorted backward, bands freely draggable.',
  tags: ['parcats', 'statistical', 'domain', 'categorical', 'interaction'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(41);
  const n = 200;
  const team: string[] = [];
  const level: string[] = [];
  const office: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = ['Platform', 'Product', 'Design', 'Data'][Math.floor(random() * 4)]!;
    team.push(t);
    level.push(random() < 0.5 ? 'Junior' : random() < 0.7 ? 'Senior' : 'Staff');
    office.push(
      random() < (t === 'Design' ? 0.7 : 0.4) ? 'Remote' : random() < 0.5 ? 'Berlin' : 'Lisbon',
    );
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'parcats',
        arrangement: 'freeform',
        sortpaths: 'backward',
        line: { shape: 'hspline', color: '#9962c0' },
        dimensions: [
          { label: 'Team', values: team, displayindex: 1 },
          {
            label: 'Level',
            values: level,
            displayindex: 2,
            categoryarray: ['Junior', 'Senior', 'Staff'],
          },
          { label: 'Office', values: office, displayindex: 0 },
        ],
      },
    ],
    layout: {
      title: { text: 'Engineering staff: office, team and level' },
      margin: { t: 48, l: 56, r: 48, b: 24 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
