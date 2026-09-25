import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic parallel coordinates (plan E10.10): 150 flowers measured four ways, one vertical axis per
 * measurement and one line per flower across them. Each axis spans its values (the range labels at
 * both ends) with ticks on the left. Brush an axis to filter the lines; drag a label to reorder
 * the axes.
 */
export const meta: ExampleMeta = {
  title: 'Parallel coordinates: basic',
  description: 'Four measurements of 150 flowers: one axis per measurement, one line per flower.',
  tags: ['parcoords', 'statistical', 'domain', 'basic'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(11));
  const species = [
    { sl: 5.0, sw: 3.4, pl: 1.5, pw: 0.25 },
    { sl: 5.9, sw: 2.8, pl: 4.3, pw: 1.3 },
    { sl: 6.6, sw: 3.0, pl: 5.6, pw: 2.0 },
  ];
  const sl: number[] = [];
  const sw: number[] = [];
  const pl: number[] = [];
  const pw: number[] = [];
  for (let i = 0; i < 150; i++) {
    const s = species[Math.floor(i / 50)]!;
    sl.push(+(s.sl + 0.4 * normal()).toFixed(1));
    sw.push(+(s.sw + 0.3 * normal()).toFixed(1));
    pl.push(+Math.max(1, s.pl + 0.4 * normal()).toFixed(1));
    pw.push(+Math.max(0.1, s.pw + 0.2 * normal()).toFixed(1));
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'parcoords',
        dimensions: [
          { label: 'Sepal length', values: sl },
          { label: 'Sepal width', values: sw },
          { label: 'Petal length', values: pl },
          { label: 'Petal width', values: pw },
        ],
      },
    ],
    layout: {
      title: { text: 'Flower measurements (cm)' },
      margin: { t: 64, l: 48, r: 32, b: 32 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
