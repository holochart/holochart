import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic sunburst (plan E13.2): Plotly's "Eve" family tree from `labels` and `parents`, sized by
 * `values` (`branchvalues: 'remainder'`: each parent's own value adds to its children's, so Eve's
 * ring leaves a gap). The root is the disc in the middle; first-level sectors take the colorway
 * and their descendants inherit the color, faded by `leaf.opacity`. Click a sector to drill in.
 */
export const meta: ExampleMeta = {
  title: 'Sunburst: basic',
  description:
    "Plotly's Eve family tree as rings around the root, sized by value, with inherited colors and faded leaves.",
  tags: ['sunburst', 'hierarchical', 'chart', 'text', 'basic'],
  size: { width: 560, height: 480 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ';

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'sunburst',
          labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
          parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
          values: [10, 14, 12, 10, 2, 6, 6, 4, 4],
        },
      ],
      layout: {
        title: { text: 'The family of Eve' },
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
