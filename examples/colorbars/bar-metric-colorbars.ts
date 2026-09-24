import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Bars colored by a second metric, each panel with its own colorbar (plan E5.3, E9.8): a service
 * fleet's p95 latency (top) and monthly cloud cost (bottom).
 *
 * Top: fills encode the error rate through a stepped three-band scale over a fixed 0–3 % domain
 * (`cmin` / `cmax`). Its colorbar names the bands instead of numbering them: ticks sit on the band
 * edges (`tickmode: 'array'`, `tickvals`) and each label (`ticktext`) is drawn just above its tick
 * (`ticklabelposition: 'outside top'`), inside the band it names. The bar outlines carry a third
 * value, the week-over-week latency change: `marker.line.color` numbers through a
 * `marker.line.colorscale` centred on no change (`cmid: 0`), so regressions get a white rim and
 * improvements a cyan one.
 *
 * Bottom: fills encode cost per million requests. That colorbar counts in dollars
 * (`tickprefix: '$'`, `separatethousands` so 4-digit values get a comma) with a tick every $500
 * from $0 (`tick0`, `dtick`) but a label on every other one (`ticklabelstep: 2`).
 *
 * Each bar is placed beside its own panel (`y` / `yanchor`, `len` as a fraction of the plot height),
 * with a slimmer strip (`thickness` in px) and a lighter outline than the default look's.
 */
export const meta: ExampleMeta = {
  title: 'Colorbar: bars colored by a metric, one colorbar per panel',
  description:
    'Latency bars filled by error-rate bands with named band ticks and outlines colored by week-over-week change; cost bars with a dollar colorbar.',
  tags: ['colorbar', 'bar', 'colorscale', 'subplots'],
  size: { width: 760, height: 500 },
  testTolerance: 0.004,
};

/** Per service: p95 latency (ms), error rate (%), week-over-week p95 change (ms), monthly cost ($), cost per 1M requests ($). */
const FLEET: [string, number, number, number, number, number][] = [
  ['auth', 216, 0.16, -19, 9000, 420],
  ['search', 94, 0.52, -23, 11000, 610],
  ['checkout', 303, 2.64, 14, 12000, 1850],
  ['catalog', 235, 1.69, 3, 4000, 380],
  ['payments', 117, 1.44, 32, 33000, 2650],
  ['media', 344, 2.0, -24, 23000, 1240],
  ['notify', 363, 1.22, 26, 21000, 980],
  ['reports', 331, 0.16, -12, 26000, 2100],
];

/** Stepped scale: healthy / degraded / breaching bands at 1 % and 2 % error rate. */
const BANDS: [number, string][] = [
  [0, '#2f7de1'],
  [1 / 3, '#2f7de1'],
  [1 / 3, '#ff9e00'],
  [2 / 3, '#ff9e00'],
  [2 / 3, '#ff2bd6'],
  [1, '#ff2bd6'],
];

/** Outline scale for the week-over-week change: improved → unchanged → regressed. */
const CHANGE: [number, string][] = [
  [0, '#6fe3ff'],
  [0.5, 'rgba(75, 71, 92, 0.4)'],
  [1, '#ffffff'],
];

export function run(el: HTMLElement): ExampleHandle {
  const services = FLEET.map((r) => r[0]);
  const latency = FLEET.map((r) => r[1]);
  const errorRate = FLEET.map((r) => r[2]);
  const weekChange = FLEET.map((r) => r[3]);
  const cost = FLEET.map((r) => r[4]);
  const perMillion = FLEET.map((r) => r[5]);

  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: 'p95 latency',
        x: services,
        y: latency,
        marker: {
          color: errorRate,
          colorscale: BANDS,
          cmin: 0,
          cmax: 3,
          line: { color: weekChange, colorscale: CHANGE, cmid: 0, width: 2.5 },
          showscale: true,
          colorbar: {
            len: 0.46,
            y: 1,
            yanchor: 'top',
            thickness: 14,
            outlinecolor: '#4b475c',
            tickmode: 'array',
            tickvals: [0, 1, 2, 3],
            ticktext: ['healthy', 'degraded', 'breach', ''],
            ticklabelposition: 'outside top',
            tickwidth: 1,
            tickcolor: '#4b475c',
            tickfont: { size: 10, color: '#c8cbd6' },
            title: { text: 'Error rate', font: { size: 11, weight: 'bold', color: '#e6e8ef' } },
          },
        },
        hovertemplate: '%{x}: %{y} ms<extra></extra>',
      },
      {
        type: 'bar',
        name: 'monthly cost',
        x: services,
        y: cost,
        xaxis: 'x2',
        yaxis: 'y2',
        marker: {
          color: perMillion,
          showscale: true,
          colorbar: {
            len: 0.46,
            y: 0,
            yanchor: 'bottom',
            thickness: 14,
            outlinewidth: 0,
            tickmode: 'linear',
            tick0: 0,
            dtick: 500,
            ticklabelstep: 2,
            tickprefix: '$',
            separatethousands: true,
            tickfont: { size: 10, color: '#c8cbd6' },
            title: {
              text: 'Per 1M req',
              font: { size: 11, weight: 'bold', color: '#e6e8ef' },
            },
          },
        },
        hovertemplate: '%{x}: $%{y:,}<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Service fleet: latency and cost, colored by error rate and unit cost' },
      showlegend: false,
      xaxis: { anchor: 'y', showticklabels: false },
      yaxis: { domain: [0.54, 1], title: { text: 'p95 latency (ms)' } },
      xaxis2: { anchor: 'y2' },
      yaxis2: {
        domain: [0, 0.46],
        title: { text: 'Monthly cost' },
        tickprefix: '$',
        tickformat: '~s',
      },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
