import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A meta-analysis forest plot: eight trials' hazard ratios with 95 % confidence intervals on a log
 * axis, and the pooled estimate.
 *
 * - Confidence intervals of ratios are symmetric in log space, so in data space they are not:
 *   `error_x` of `type: 'data'` with `array` (to the upper bound) and `arrayminus` (to the lower
 *   bound), in a muted `color`, thin (`thickness`) with small caps (`width`).
 * - Squares are sized by study weight; the pooled estimate is a diamond with its own interval.
 * - `hovertext` gives each trial's size and year; `hoverlabel` styles its label (`bgcolor`,
 *   `bordercolor`, `font`, left `align`) and `namelength: -1` keeps the long trace name whole.
 * - The line of no effect is a dashed shape at HR = 1, labelled at its foot: horizontal
 *   (`label.textangle`), anchored to the right of the line (`label.xanchor`), in a small italic
 *   font (`label.font`).
 * - The summary boxes share one `height` so they line up; `valign: 'top'` keeps the shorter text at
 *   the top of its box. The footnote is italic (`font.style`), the callout bold (`font.weight`),
 *   with a larger head (`arrowsize`).
 */
export const meta: ExampleMeta = {
  title: 'Uncertainty: forest plot',
  description:
    'Hazard ratios with asymmetric 95 % CIs (error_x arrayminus) on a log axis, a pooled diamond, a no-effect line and aligned summary boxes.',
  tags: ['uncertainty', 'scatter', 'error-bars', 'log', 'medical', 'annotations'],
  testTolerance: 0.004,
  size: { width: 760, height: 540 },
};

/** Trial, hazard ratio, 95 % CI low and high, weight (%), patients, year. */
const TRIALS: readonly (readonly [string, number, number, number, number, number, number])[] = [
  ['ARISE-1', 0.82, 0.64, 1.05, 14.2, 1240, 2016],
  ['CORAL', 0.71, 0.52, 0.97, 10.8, 860, 2017],
  ['HELIX-2', 0.93, 0.78, 1.11, 21.5, 2310, 2018],
  ['NORDIC-HF', 0.66, 0.44, 0.99, 7.1, 540, 2019],
  ['PRISM', 0.88, 0.7, 1.1, 16.3, 1480, 2020],
  ['SAGE', 1.04, 0.79, 1.37, 11.9, 990, 2021],
  ['TANGO', 0.75, 0.58, 0.97, 12.6, 1120, 2022],
  ['VERTEX', 0.79, 0.57, 1.09, 5.6, 610, 2023],
];
const POOLED = { hr: 0.83, lo: 0.76, hi: 0.91 };
const POOLED_LABEL = 'Pooled (random effects)';

export function run(el: HTMLElement): ExampleHandle {
  const names = TRIALS.map((t) => t[0]);
  const chart = createChart(el, {
    data: [
      {
        name: 'Trials (95 % CI, squares sized by weight)',
        mode: 'markers',
        x: TRIALS.map((t) => t[1]),
        y: names,
        marker: {
          symbol: 'square',
          color: '#5e74d5',
          size: TRIALS.map((t) => 5 + t[4] * 0.75),
        },
        error_x: {
          type: 'data',
          array: TRIALS.map((t) => t[3] - t[1]),
          arrayminus: TRIALS.map((t) => t[1] - t[2]),
          color: '#9aa0b4',
          thickness: 1.5,
          width: 3,
        },
        hovertext: TRIALS.map(
          (t) =>
            `${t[0]} (${t[6]}), n = ${t[5].toLocaleString('en-US')}<br>` +
            `HR ${t[1].toFixed(2)} (${t[2].toFixed(2)}–${t[3].toFixed(2)}), weight ${t[4]} %`,
        ),
        hoverinfo: 'text+name',
        hoverlabel: {
          bgcolor: '#1b1e2b',
          bordercolor: '#5e74d5',
          font: { size: 12, color: '#e6e8f0' },
          align: 'left',
          namelength: -1,
        },
      },
      {
        name: 'Pooled estimate',
        mode: 'markers',
        x: [POOLED.hr],
        y: [POOLED_LABEL],
        marker: { symbol: 'diamond-wide', color: '#cc540a', size: 18 },
        error_x: {
          type: 'data',
          array: [POOLED.hi - POOLED.hr],
          arrayminus: [POOLED.hr - POOLED.lo],
          color: '#cc540a',
          thickness: 2,
          width: 5,
        },
      },
    ],
    layout: {
      title: { text: 'Drug X vs placebo: hospitalisation for heart failure' },
      margin: { b: 170 },
      xaxis: {
        type: 'log',
        range: [Math.log10(0.4), Math.log10(1.6)],
        tickvals: [0.4, 0.5, 0.6, 0.8, 1, 1.25, 1.6],
        title: { text: 'Hazard ratio (log scale)' },
        zeroline: false,
      },
      yaxis: {
        autorange: 'reversed',
        categoryorder: 'array',
        categoryarray: [...names, POOLED_LABEL],
      },
      legend: { orientation: 'h', x: 0, y: -0.16 },
      shapes: [
        {
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: 1,
          x1: 1,
          y0: 0,
          y1: 1,
          line: { color: '#80838f', width: 1, dash: 'dash' },
          label: {
            text: 'no effect',
            textposition: 'start',
            textangle: 0,
            xanchor: 'left',
            yanchor: 'bottom',
            font: { size: 11, style: 'italic', color: '#80838f' },
          },
        },
      ],
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 1,
          y: -0.14,
          xanchor: 'right',
          yanchor: 'top',
          height: 54,
          valign: 'top',
          align: 'left',
          text: 'Heterogeneity<br>I² = 18 %, τ² = 0.004<br>Q = 8.5, p = 0.29',
          bgcolor: 'rgba(27, 30, 43, 0.9)',
          bordercolor: '#3a3e4f',
          borderpad: 6,
          showarrow: false,
        },
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.74,
          y: -0.14,
          xanchor: 'right',
          yanchor: 'top',
          height: 54,
          valign: 'top',
          align: 'left',
          text: 'Overall effect<br>z = 3.94, p < 0.001',
          bgcolor: 'rgba(27, 30, 43, 0.9)',
          bordercolor: '#3a3e4f',
          borderpad: 6,
          showarrow: false,
        },
        {
          x: Math.log10(POOLED.hr),
          y: POOLED_LABEL,
          text: 'HR 0.83 (0.76–0.91)',
          font: { weight: 'bold', color: '#cc540a' },
          showarrow: true,
          arrowcolor: '#cc540a',
          arrowhead: 2,
          arrowsize: 1.4,
          ax: -70,
          ay: -24,
        },
        {
          xref: 'paper',
          yref: 'paper',
          x: 0,
          y: -0.38,
          xanchor: 'left',
          yanchor: 'top',
          text: 'Squares are sized by inverse-variance weight; bars show 95 % confidence intervals.',
          font: { size: 11, style: 'italic', color: '#80838f' },
          showarrow: false,
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
