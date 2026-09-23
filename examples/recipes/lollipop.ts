import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Lollipop chart (plan E9.6 recipe): a marker per category with a stem down to zero. The stem is
 * an asymmetric, capless error bar: `arrayminus` is the value itself (down to 0) and `array` is 0.
 * Error bar ends count in the autorange, so the axis includes zero.
 */
export const meta: ExampleMeta = {
  title: 'Recipe: lollipop',
  description:
    'Markers on stems: asymmetric capless error_y bars from zero to each value, over a category axis.',
  tags: ['recipe', 'scatter', 'lollipop', 'error-bars', 'category'],
  testTolerance: 0.004,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RAIN = [78, 61, 57, 44, 49, 38, 22, 27, 51, 83, 96, 88];

export function run(el: HTMLElement): ExampleHandle {
  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Rainfall',
        x: MONTHS,
        y: RAIN,
        marker: { size: 13, color: '#17becf', line: { width: 2, color: '#0e7c86' } },
        error_y: {
          type: 'data',
          symmetric: false,
          array: RAIN.map(() => 0),
          arrayminus: RAIN,
          width: 0,
          thickness: 2.5,
          color: '#0e7c86',
        },
        hovertemplate: '%{x}: %{y} mm<extra></extra>',
      },
    ],
    layout: {
      font: { family: 'Inter', size: 12 },
      yaxis: { title: { text: 'Rainfall (mm)' } },
      margin: { l: 56, r: 24, t: 24, b: 40 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
