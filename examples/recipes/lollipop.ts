import { createChart } from '@mk7s/holochart';
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
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Rainfall',
        x: MONTHS,
        y: RAIN,
        marker: { size: 10, color: '#128b8b', line: { width: 1.5, color: '#3fd0e0' } },
        error_y: {
          type: 'data',
          symmetric: false,
          array: RAIN.map(() => 0),
          arrayminus: RAIN,
          width: 0,
          thickness: 2,
          color: '#128b8b',
        },
        hovertemplate: '%{x}: %{y} mm<extra></extra>',
      },
    ],
    layout: {
      // One label per stem: the default look's `nticks` would label every other month.
      xaxis: { dtick: 1 },
      yaxis: { title: { text: 'Rainfall (mm)' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
