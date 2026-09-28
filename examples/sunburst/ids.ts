import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `ids` with repeated labels (plan E13.1): sales by region and product line, where every region
 * has the same product lines. `ids` identify the nodes (`parents` refer to ids), so labels may
 * repeat; the root is implied (no row has an empty parent, so the one parent id that is no node,
 * `'total'`, becomes the root). Region values are their lines' sums (`branchvalues: 'total'`).
 * Labels run radially and show the value; the hover template reports the path and the share of
 * the whole.
 */
export const meta: ExampleMeta = {
  title: 'Sunburst: ids and repeated labels',
  description:
    'Regions and their product lines keyed by ids, so the product names repeat, under an implied root; radial labels with values.',
  tags: ['sunburst', 'hierarchical', 'chart', 'text', 'hovertemplate'],
  size: { width: 560, height: 480 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789,.k ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const REGIONS = ['North', 'South', 'East', 'West'];
const LINES = ['Bikes', 'Parts', 'Apparel'];
/** Sales per region (rows) and product line (columns), in k$. */
const SALES = [
  [420, 180, 90],
  [310, 220, 60],
  [260, 140, 130],
  [150, 90, 70],
];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ids: string[] = [];
  const labels: string[] = [];
  const parents: string[] = [];
  const values: number[] = [];
  REGIONS.forEach((region, r) => {
    ids.push(region);
    labels.push(region);
    parents.push('total');
    values.push(SALES[r]!.reduce((a, b) => a + b, 0));
    LINES.forEach((line, l) => {
      ids.push(`${region}/${line}`);
      labels.push(line);
      parents.push(region);
      values.push(SALES[r]![l]!);
    });
  });
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'sunburst',
          ids,
          labels,
          parents,
          values,
          branchvalues: 'total',
          textinfo: 'label+value',
          insidetextorientation: 'radial',
          hovertemplate:
            '%{currentPath}%{label}<br>%{value}k$, %{percentRoot} of all sales<extra></extra>',
        },
      ],
      layout: {
        title: { text: 'Sales by region and product line (k$)' },
        margin: { l: 20, r: 20, t: 50, b: 20 },
      },
      config: { responsive: true },
    });
    await componentsReady(chart);
  });

  return {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      disposed = true;
      chart?.destroy();
    },
  };
}
