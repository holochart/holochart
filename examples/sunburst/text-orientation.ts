import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Inside text orientation (plan E13.2): the same hierarchy four times in a 2×2 `layout.grid`, one
 * per `insidetextorientation`. Labels are fitted to their sector like pie labels (shrunk, never
 * grown): `'horizontal'` keeps them level, `'radial'` runs them along the radius, `'tangential'`
 * along the ring, and `'auto'` (the default) picks per sector whichever fits largest.
 */
export const meta: ExampleMeta = {
  title: 'Sunburst: inside text orientation',
  description:
    "insidetextorientation 'horizontal', 'radial', 'tangential' and 'auto' side by side on the same hierarchy.",
  tags: ['sunburst', 'hierarchical', 'chart', 'text', 'grid', 'annotations'],
  size: { width: 720, height: 680 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = "0123456789' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ORIENTATIONS = ['horizontal', 'radial', 'tangential', 'auto'] as const;

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: ORIENTATIONS.map((orientation, i) => ({
        type: 'sunburst',
        name: orientation,
        labels: [
          'Energy',
          'Fossil',
          'Renewable',
          'Nuclear',
          'Coal',
          'Gas',
          'Oil',
          'Wind',
          'Solar',
          'Hydro',
        ],
        parents: [
          '',
          'Energy',
          'Energy',
          'Energy',
          'Fossil',
          'Fossil',
          'Fossil',
          'Renewable',
          'Renewable',
          'Renewable',
        ],
        values: [0, 0, 0, 9, 35, 23, 3, 8, 6, 16],
        insidetextorientation: orientation,
        domain: { row: Math.floor(i / 2), column: i % 2 },
      })),
      layout: {
        grid: { rows: 2, columns: 2, ygap: 0.12 },
        margin: { l: 10, r: 10, t: 40, b: 10 },
        annotations: ORIENTATIONS.map((orientation, i) => ({
          text: `'${orientation}'`,
          x: i % 2 ? 0.76 : 0.24,
          y: i < 2 ? 1.05 : 0.47,
          xref: 'paper',
          yref: 'paper',
          showarrow: false,
        })),
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
