import { componentsReady, createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A finance-style dual-axis chart: monthly revenue as bars on the left axis and gross margin as a
 * line on a secondary right axis (`yaxis2.overlaying: 'y'`, its labels in the line's color, and
 * `fixedrange` so zooming only rescales revenue).
 *
 * The date axis steps by quarter and uses `ticklabelmode: 'period'`, so each label sits in the
 * middle of the quarter it names rather than on its first day, with month minor ticks between.
 * `tickformatstops` switch the label format with the zoom level (days, quarters, years) and
 * `hoverformat` spells the full month out on hover. Revenue labels use `separatethousands`, and
 * show the currency prefix only on the first label and the unit suffix only on the last
 * (`showtickprefix: 'first'`, `showticksuffix: 'last'`), as printed financial reports do.
 */
export const meta: ExampleMeta = {
  title: 'Axes: revenue and margin on two y axes',
  description:
    'Monthly revenue bars with a secondary margin axis, period tick labels, tickformatstops and prefix/suffix placement.',
  tags: ['axes', 'date', 'secondary-axis', 'bar', 'line', 'finance'],
  size: { width: 760, height: 440 },
  testTolerance: 0.004,
};

/** Mid-month dates, Jan 2024 – Dec 2025, so each bar sits in the middle of its month. */
const MONTHS = Array.from({ length: 24 }, (_, i) => {
  const y = 2024 + Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-15`;
});

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(2024);
  // Revenue in thousands of USD: steady growth, a Q4 holiday peak and a quiet summer.
  const season = [0.94, 0.9, 0.98, 1.0, 1.02, 0.95, 0.9, 0.92, 1.01, 1.06, 1.14, 1.24];
  const revenue = MONTHS.map((_, i) =>
    Math.round((1420 + i * 38) * (season[i % 12] ?? 1) * (0.96 + random() * 0.08)),
  );
  // Gross margin in %: discounting around the peak squeezes it.
  const margin = MONTHS.map((_, i) => {
    const m = i % 12;
    const promo = m >= 10 ? -3.5 : m === 6 ? -1.5 : 0;
    return 31 + i * 0.12 + promo + (random() - 0.5) * 1.6;
  });

  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: 'Revenue',
        x: MONTHS,
        y: revenue,
        marker: { color: '#5e74d5' },
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Gross margin',
        x: MONTHS,
        y: margin,
        yaxis: 'y2',
        line: { color: '#e8a33d', width: 2.5 },
        marker: { size: 5 },
      },
    ],
    layout: {
      title: { text: 'Monthly revenue and gross margin' },
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      bargap: 0.25,
      hovermode: 'x unified',
      xaxis: {
        type: 'date',
        dtick: 'M3',
        ticklabelmode: 'period',
        ticks: 'outside',
        ticklen: 8,
        tickwidth: 1.5,
        tickcolor: '#8b8e9c',
        minor: { dtick: 'M1', ticks: 'outside', ticklen: 4, tickwidth: 1, tickcolor: '#555866' },
        tickformatstops: [
          { dtickrange: [null, 'M1'], value: '%b %e' },
          { dtickrange: ['M1', 'M12'], value: 'Q%q %Y' },
          { dtickrange: ['M12', null], value: '%Y' },
        ],
        hoverformat: '%B %Y',
      },
      yaxis: {
        title: { text: 'Revenue (USD, thousands)' },
        tickprefix: '$',
        showtickprefix: 'first',
        ticksuffix: 'k',
        showticksuffix: 'last',
        separatethousands: true,
        hoverformat: '$,.0f',
        griddash: 'dot',
      },
      yaxis2: {
        title: { text: 'Gross margin', font: { color: '#e8a33d' } },
        overlaying: 'y',
        side: 'right',
        tickfont: { color: '#e8a33d' },
        range: [20, 40],
        dtick: 5,
        ticksuffix: '%',
        hoverformat: '.1f',
        showgrid: false,
        zeroline: false,
        fixedrange: true,
      },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
