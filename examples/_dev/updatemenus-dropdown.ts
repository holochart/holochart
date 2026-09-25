import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A dropdown update menu (plan E5.10) switching the chart type with `restyle`: the button shows the
 * active choice with an arrow; the list (a `role="listbox"`) opens below it on click or with the
 * arrow keys. A second dropdown `update`s the color and the title together. Menus sit in the top
 * margin, left of the plot's right edge; dropdown lists overlay the chart and push no margin.
 */
export const meta: ExampleMeta = {
  title: 'Update menus: dropdowns (restyle chart type, update)',
  description:
    'A dropdown switching between line, markers and bars with restyle, and one calling update (trace color + title).',
  tags: ['dev', 'chart', 'updatemenus', 'dropdown', 'restyle', 'update'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RAIN = [49, 71, 106, 129, 144, 176, 135, 148, 216, 194, 95, 54];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [{ type: 'scatter', mode: 'lines+markers', name: 'Rainfall', x: MONTHS, y: RAIN }],
    layout: {
      title: { text: 'Monthly rainfall (mm)' },
      margin: { t: 56 },
      yaxis: { rangemode: 'tozero' },
      updatemenus: [
        {
          x: 1,
          xanchor: 'right',
          y: 1.03,
          yanchor: 'bottom',
          buttons: [
            {
              label: 'Line',
              method: 'restyle',
              args: [{ type: 'scatter', mode: 'lines+markers' }],
            },
            { label: 'Markers', method: 'restyle', args: [{ type: 'scatter', mode: 'markers' }] },
            { label: 'Bars', method: 'restyle', args: [{ type: 'bar' }] },
          ],
        },
        {
          x: 0.8,
          xanchor: 'right',
          y: 1.03,
          yanchor: 'bottom',
          buttons: [
            {
              label: 'Red',
              method: 'update',
              args: [
                { 'marker.color': '#ea2a37', 'line.color': '#ea2a37' },
                { 'title.text': 'Monthly rainfall (mm)' },
              ],
            },
            {
              label: 'Blue',
              method: 'update',
              args: [
                { 'marker.color': '#5e74d5', 'line.color': '#5e74d5' },
                { 'title.text': 'Monthly rainfall (mm), blue' },
              ],
            },
          ],
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
