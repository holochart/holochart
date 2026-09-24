import { componentsReady, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Horizontal legend (E5.2) below the plot: items flow in rows and wrap at the plot width, the
 * title sits on the left, `itemsizing: 'constant'` draws every marker at the same size, and the
 * legend pushes the bottom margin so it clears the x-axis labels. The figure title is placed in
 * paper coordinates with `automargin` (E5.1).
 */
export const meta: ExampleMeta = {
  title: 'Legend: horizontal, wrapping rows, constant item size',
  description:
    'Horizontal legend under the plot with a left title, wrapped rows and constant glyph size; paper-referenced title with automargin.',
  tags: ['dev', 'chart', 'legend', 'title'],
  size: { width: 640, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const SERIES = [
  'Hydro',
  'Wind (onshore)',
  'Wind (offshore)',
  'Solar PV',
  'Bioenergy',
  'Geothermal',
  'Nuclear',
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: SERIES.map((name, k) => ({
      mode: 'markers',
      name,
      x: [2019, 2020, 2021, 2022, 2023, 2024],
      y: [0, 1, 2, 3, 4, 5].map((i) => 20 + k * 12 + i * (k + 1) * 1.5),
      marker: { size: 4 + k * 2 },
    })),
    layout: {
      title: {
        text: '<b>Capacity additions</b>',
        xref: 'paper',
        yref: 'paper',
        x: 0,
        y: 1,
        yanchor: 'bottom',
        automargin: true,
        pad: { b: 8 },
      },
      legend: {
        orientation: 'h',
        y: -0.1,
        yanchor: 'top',
        itemsizing: 'constant',
        title: { text: 'Source:' },
      },
      xaxis: { dtick: 1, showline: true, ticks: 'outside' },
      yaxis: { title: { text: 'GW' }, automargin: true },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
