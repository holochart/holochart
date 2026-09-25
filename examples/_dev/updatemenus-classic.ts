import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Update menus and a slider in Plotly's look (`template: 'plotly-classic'`): the widgets take
 * Plotly's own colors (`#BEC8D9` borders, `#F4FAFF` active buttons, a `#f8fafc` rail) and its
 * 12 px sizes, read from the resolved layout like every other color. Compare with the default
 * look in `_dev/updatemenus-buttons` and `_dev/sliders-sweep`.
 */
export const meta: ExampleMeta = {
  title: "Update menus and slider: Plotly's look",
  description:
    'A button menu, a dropdown and a slider with template plotly-classic: Plotly widget colors and sizes.',
  tags: ['dev', 'chart', 'updatemenus', 'sliders', 'themes'],
  size: { width: 640, height: 440 },
  testTolerance: 0.004,
};

const YEARS = [1990, 1995, 2000, 2005, 2010, 2015, 2020];
const series = (k: number) => YEARS.map((_, i) => 10 + k * 4 + i * (k + 1));

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [0, 1, 2].map((k) => ({
      type: 'scatter',
      mode: 'lines+markers',
      name: `Region ${k + 1}`,
      x: YEARS,
      y: series(k),
    })),
    layout: {
      template: 'plotly-classic',
      title: { text: 'Regional output' },
      showlegend: false,
      updatemenus: [
        {
          type: 'buttons',
          direction: 'right',
          active: 1,
          x: 0,
          xanchor: 'left',
          y: 1.1,
          yanchor: 'bottom',
          buttons: [
            { label: 'Lines', method: 'restyle', args: ['mode', 'lines'] },
            { label: 'Lines + markers', method: 'restyle', args: ['mode', 'lines+markers'] },
          ],
        },
        {
          x: 1,
          xanchor: 'right',
          y: 1.1,
          yanchor: 'bottom',
          buttons: [
            { label: 'Linear', method: 'relayout', args: ['yaxis.type', 'linear'] },
            { label: 'Log', method: 'relayout', args: ['yaxis.type', 'log'] },
          ],
        },
      ],
      sliders: [
        {
          active: 2,
          currentvalue: { prefix: 'Line width: ' },
          steps: [1, 2, 3, 4, 5].map((w) => ({
            label: String(w),
            method: 'restyle',
            args: ['line.width', w],
          })),
        },
      ],
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
