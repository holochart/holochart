import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `branchvalues` (plan E13.1): the same `values` read two ways. With `'remainder'` (left) a
 * parent's value is its own share, added to its children's; with `'total'` (right) it is the
 * branch's total, so children fill their parent up to their sum and the rest stays empty (Seth's
 * children fill it exactly). A `total` below its children's sum is an error: the trace is not
 * drawn and a warning names the node. Labels show each sector's share of its parent.
 */
export const meta: ExampleMeta = {
  title: 'Sunburst: branchvalues',
  description:
    "branchvalues 'remainder' and 'total' side by side on the same values, labeled with each sector's percent of its parent.",
  tags: ['sunburst', 'hierarchical', 'chart', 'text', 'domain', 'annotations'],
  size: { width: 720, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = "0123456789%' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const TREE = {
  labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
  parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
  values: [65, 14, 12, 10, 2, 6, 6, 4, 4],
  textinfo: 'label+percent parent',
};

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        { type: 'sunburst', ...TREE, branchvalues: 'remainder', domain: { x: [0, 0.48] } },
        { type: 'sunburst', ...TREE, branchvalues: 'total', domain: { x: [0.52, 1] } },
      ],
      layout: {
        margin: { l: 10, r: 10, t: 40, b: 10 },
        annotations: [
          {
            text: "branchvalues: 'remainder'",
            x: 0.24,
            y: 1.06,
            xref: 'paper',
            yref: 'paper',
            showarrow: false,
          },
          {
            text: "branchvalues: 'total'",
            x: 0.76,
            y: 1.06,
            xref: 'paper',
            yref: 'paper',
            showarrow: false,
          },
        ],
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
