import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Error bars on bars, vertical and horizontal, for ranges that are not symmetric:
 *
 * - Left: quarterly revenue, actuals then forecast. The finance team's standard range is skewed to
 *   the downside, +6 % / −14 %: `error_y` of `type: 'percent'` with `symmetric: false`, `value`
 *   and `valueminus`, in a muted `color`.
 * - Right: remaining effort per workstream as three-point (PERT) estimates. The bar is the most
 *   likely duration; `error_x` of `type: 'data'` reaches the pessimistic end with `array` and back
 *   to the optimistic one with `arrayminus`, with its own `thickness`, cap `width` and `color`.
 *   Vendor-quoted work has a contractual tolerance instead, +1 / −0.5 weeks: `error_x` of
 *   `type: 'constant'` with `value` and `valueminus`.
 */
export const meta: ExampleMeta = {
  title: 'Uncertainty: forecast and estimate ranges',
  description:
    'Bars with asymmetric error bars: a percent downside-skewed revenue forecast (error_y valueminus) and PERT effort ranges on horizontal bars (error_x arrayminus, constant valueminus).',
  tags: ['uncertainty', 'bar', 'error-bars', 'forecast', 'finance'],
  testTolerance: 0.004,
  size: { width: 800, height: 420 },
};

const QUARTERS = ['Q1 25', 'Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26', 'Q3 26', 'Q4 26'];
const ACTUAL = [4.1, 4.4, 4.3, 4.9];
const FORECAST = [5.0, 5.2, 5.5, 5.9];

const WORKSTREAMS = ['Data migration', 'API v2', 'Mobile app', 'Billing', 'Compliance audit'];
const LIKELY = [6, 9, 12, 5, 4];
const OPTIMISTIC = [4, 7, 8, 4, 3];
const PESSIMISTIC = [11, 14, 21, 8, 6];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: 'Actual',
        x: QUARTERS.slice(0, 4),
        y: ACTUAL,
        marker: { color: '#5e74d5' },
      },
      {
        type: 'bar',
        name: 'Forecast (+6 % / −14 %)',
        x: QUARTERS.slice(4),
        y: FORECAST,
        marker: { color: 'rgba(94, 116, 213, 0.35)', line: { color: '#5e74d5', width: 1 } },
        error_y: {
          type: 'percent',
          symmetric: false,
          value: 6,
          valueminus: 14,
          color: '#c9cde0',
        },
      },
      {
        type: 'bar',
        name: 'In-house (PERT range)',
        orientation: 'h',
        xaxis: 'x2',
        yaxis: 'y2',
        x: LIKELY,
        y: WORKSTREAMS,
        marker: { color: '#cc540a' },
        error_x: {
          type: 'data',
          array: PESSIMISTIC.map((p, i) => p - LIKELY[i]!),
          arrayminus: LIKELY.map((l, i) => l - OPTIMISTIC[i]!),
          thickness: 1.5,
          width: 5,
          color: '#e8b08a',
        },
      },
      {
        type: 'bar',
        name: 'Vendor (+1 / −0.5 wk)',
        orientation: 'h',
        xaxis: 'x2',
        yaxis: 'y2',
        x: [3, 4],
        y: ['Penetration test', 'Localization'],
        marker: { color: '#80838f' },
        error_x: { type: 'constant', value: 1, valueminus: 0.5, color: '#c9cde0' },
      },
    ],
    layout: {
      title: { text: 'Revenue outlook and delivery estimates' },
      barmode: 'overlay',
      xaxis: { domain: [0, 0.44] },
      yaxis: { title: { text: 'Revenue ($M)' } },
      xaxis2: { domain: [0.62, 1], anchor: 'y2', title: { text: 'Remaining effort (weeks)' } },
      yaxis2: { anchor: 'x2', autorange: 'reversed' },
      legend: { orientation: 'h', x: 0, y: -0.14 },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
