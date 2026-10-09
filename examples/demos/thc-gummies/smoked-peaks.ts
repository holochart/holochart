import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { ROUTE_COLOR, SMOKED_PEAKS } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * Perez-Reyes 1990, redrawn from the table printed with its Figure 1: peak plasma THC after
 * smoking one cigarette, against the cigarette's potency, for nine groups of occasional users.
 * Dots are group means with the printed plus-or-minus as `error_y`; the thin vertical segments
 * behind them (a `lines` trace broken by nulls) span the lowest and highest individual. Marker
 * area follows group size.
 */
export const meta: ExampleMeta = {
  title: 'Smoked THC: peak plasma concentration by cigarette potency',
  description:
    'Peak plasma THC after one cigarette against its potency in nine groups, with the printed error and the range between individuals.',
  tags: ['demo', 'scatter', 'error-bars', 'bubble', 'medical'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  return mount(el, (narrow) => ({
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Lowest to highest individual',
        x: SMOKED_PEAKS.flatMap((p) => [p.potencyPct, p.potencyPct, null]),
        y: SMOKED_PEAKS.flatMap((p) => [p.range[0], p.range[1], null]),
        line: { color: LOOK.zero, width: 2 },
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Group mean (size: participants)',
        x: SMOKED_PEAKS.map((p) => p.potencyPct),
        y: SMOKED_PEAKS.map((p) => p.peak),
        error_y: {
          type: 'data',
          array: SMOKED_PEAKS.map((p) => p.pm),
          color: '#eceef4',
          thickness: 1.5,
          width: 4,
        },
        marker: {
          size: SMOKED_PEAKS.map((p) => 6 + Math.sqrt(p.n) * 3),
          color: ROUTE_COLOR.smoked,
          opacity: 1,
        },
        hovertext: SMOKED_PEAKS.map(
          (p) =>
            `${p.potencyPct}% THC, n = ${p.n}<br>peak ${p.peak} ± ${p.pm} ng/mL` +
            `<br>individuals ${p.range[0]} to ${p.range[1]}`,
        ),
        hoverinfo: 'text',
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : 'The same cigarette gave one smoker ten times the peak of another',
      },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Cigarette potency, % THC' },
        range: [0.6, 5.2],
        ticksuffix: '%',
        zeroline: false,
      },
      yaxis: { title: { text: 'Peak plasma THC, ng/mL' }, range: [0, 240] },
    },
  }));
}
