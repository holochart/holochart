import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Sunburst with patterns (plan E13.2, E8.10): `marker.pattern.shape` per sector, one hatch per
 * first-level branch and its children. `fillmode: 'overlay'` draws the hatches over the sector
 * colors, in a contrasting color (with the default `'replace'` the background would be the paper
 * color); tiles are anchored at the center. `leaf.opacity: 1` keeps the leaves as strong as their
 * parents.
 */
export const meta: ExampleMeta = {
  title: 'Sunburst: patterns',
  description: 'Each branch hatched with its own pattern shape over its colors.',
  tags: ['sunburst', 'hierarchical', 'chart', 'pattern'],
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
          labels: [
            'Books',
            'Fiction',
            'Science',
            'History',
            'Novels',
            'Poetry',
            'Physics',
            'Biology',
            'Ancient',
            'Modern',
          ],
          parents: [
            '',
            'Books',
            'Books',
            'Books',
            'Fiction',
            'Fiction',
            'Science',
            'Science',
            'History',
            'History',
          ],
          values: [0, 0, 0, 0, 30, 10, 18, 14, 9, 15],
          leaf: { opacity: 1 },
          marker: {
            pattern: {
              shape: ['', '/', '.', 'x', '/', '/', '.', '.', 'x', 'x'],
              fillmode: 'overlay',
              size: 8,
            },
          },
        },
      ],
      layout: {
        title: { text: 'Library shelves' },
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
