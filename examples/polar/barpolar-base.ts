import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Floating polar bars (plan E11.5): `base` starts each bar away from the center (here: daily
 * temperature ranges per month, from the low to the high), `width` sets the angular width in the
 * trace's `thetaunit`, and `offset` shifts bars off their angle (a second series beside the first).
 * Traces with a `base` are not stacked, even in `stack` mode.
 */
export const meta: ExampleMeta = {
  title: 'Polar: floating bars (base, width, offset)',
  description: 'Temperature ranges per month drawn from a base, with explicit widths and offsets.',
  tags: ['polar', 'barpolar', 'base', 'width', 'offset'],
  testTolerance: 0.004,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LOW = [-3, -2, 1, 5, 9, 13, 15, 14, 11, 7, 2, -1];
const HIGH = [3, 5, 9, 14, 19, 23, 25, 24, 20, 14, 8, 4];
const LOW2 = [4, 5, 7, 10, 13, 16, 18, 18, 16, 12, 8, 5];
const HIGH2 = [11, 12, 15, 18, 22, 26, 29, 29, 26, 21, 15, 12];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'barpolar',
        name: 'Inland',
        theta: MONTHS,
        base: LOW.map((v) => v + 10),
        r: HIGH.map((v, i) => v - LOW[i]!),
        width: 0.4,
        offset: -0.42,
      },
      {
        type: 'barpolar',
        name: 'Coast',
        theta: MONTHS,
        base: LOW2.map((v) => v + 10),
        r: HIGH2.map((v, i) => v - LOW2[i]!),
        width: 0.4,
        offset: 0.02,
      },
    ],
    layout: {
      title: { text: 'Daily temperature range by month (°C + 10)' },
      polar: {
        angularaxis: { direction: 'clockwise' },
        radialaxis: { range: [0, 42], angle: 90, tickangle: 90 },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
