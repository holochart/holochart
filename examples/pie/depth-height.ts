import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { chartExample } from '../_lib/hierarchy.ts';

/**
 * A height-encoded pie (plan E9.12): `depth` takes one number per slice, so a second measure —
 * here each region's growth — raises its slice, while the angles keep showing the shares. Labels
 * outside the pie, with leader lines, sit at the height of their slices.
 */
export const meta: ExampleMeta = {
  title: 'Pie: height-encoded slices (per-slice depth)',
  description: 'Slices sized by revenue and raised by growth, with outside labels.',
  tags: ['pie', 'chart', 'depth', '2.5d', '3d-native', 'holochart-extension'],
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const GROWTH = [12, 4, 22, 9, 16];

export function run(el: HTMLElement): ExampleHandle {
  return chartExample(el, () => ({
    data: [
      {
        type: 'pie',
        name: 'Revenue',
        labels: ['North', 'South', 'East', 'West', 'Online'],
        values: [42, 31, 18, 27, 22],
        customdata: GROWTH,
        depth: GROWTH.map((g) => 8 + g * 3),
        tilt: 48,
        textposition: 'outside',
        textinfo: 'label+percent',
        hovertemplate: '%{label}: %{value} M, growth %{customdata} %<extra></extra>',
        marker: { line: { width: 2 } },
      },
    ],
    layout: { showlegend: false, title: { text: 'Revenue share, raised by growth' } },
    config: { responsive: true },
  }));
}
