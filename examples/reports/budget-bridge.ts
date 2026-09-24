import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A finance report page with two bar panels:
 *
 * - Left, a budget bridge from last year's actual to this year's plan. Every change floats from
 *   the running total: `base` per bar, with negative `y` for savings. The three traces share one
 *   `offsetgroup` so each takes the full slot. Labels use `texttemplate` with `textposition:
 *   'auto'`: large bars carry theirs inside (`insidetextfont`), the thin ones outside
 *   (`outsidetextfont`); totals get a bold white `textfont`. `hovertext` explains each change.
 * - Right, half-year spend per department against the half-year budget. The budget is its own
 *   `alignmentgroup`, so it spans the whole slot behind the two half-year bars, which split the
 *   slot of the other alignment group. It is listed last (so it comes last in the legend) but drawn
 *   first with `zorder: -1`. `selectedpoints` marks the halves over budget: `selected` recolors
 *   them and their labels, `unselected` fades the rest. The unit lives in `meta`, read by
 *   the hover templates.
 */
export const meta: ExampleMeta = {
  title: 'Reports: budget bridge and spend vs budget',
  description:
    'A floating-bar budget bridge (base, inside/outside label fonts) next to half-year spend against a full-slot budget (alignmentgroup, zorder, selectedpoints).',
  tags: ['reports', 'bar', 'waterfall', 'finance', 'text', 'selection'],
  testTolerance: 0.004,
  size: { width: 820, height: 440 },
};

const STEPS = ['FY24 actual', 'Headcount', 'Cloud', 'Vendors', 'Travel', 'Marketing', 'FY25 plan'];

const DEPTS = ['Platform', 'Data', 'Sales', 'Support'];
const HALF_BUDGET = [6.5, 4.0, 5.5, 3.0];
const H1 = [6.1, 4.3, 5.0, 2.8];
const H2 = [6.8, 3.9, 5.9, 3.1];

/** Indices of the halves that went over the half-year budget. */
const over = (spend: readonly number[]): number[] =>
  spend.flatMap((v, i) => (v > HALF_BUDGET[i]! ? [i] : []));

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: 'Total',
        offsetgroup: 'bridge',
        x: ['FY24 actual', 'FY25 plan'],
        y: [48.0, 52.4],
        marker: { color: '#80838f' },
        texttemplate: '%{y:.1f}',
        textposition: 'inside',
        insidetextanchor: 'end',
        textfont: { color: '#ffffff', weight: 'bold' },
        hovertext: ['Audited, US$ M', 'Board-approved plan, US$ M'],
        hovertemplate: '%{x}: %{y:.1f}<br>%{hovertext}<extra></extra>',
        showlegend: false,
      },
      {
        type: 'bar',
        name: 'Increase',
        offsetgroup: 'bridge',
        x: ['Headcount', 'Cloud', 'Marketing'],
        y: [4.2, 1.8, 1.1],
        base: [48.0, 52.2, 51.3],
        marker: { color: '#3f9b64' },
        texttemplate: '+%{y:.1f}',
        textposition: 'auto',
        insidetextfont: { color: '#0b2416', size: 12, weight: 'bold' },
        outsidetextfont: { color: '#6cc48b', size: 11 },
        hovertext: [
          'Six platform engineers, full year',
          'Usage growth, net of committed-use discount',
          'Two regional launches',
        ],
        hovertemplate: '%{x}: +%{y:.1f}<br>%{hovertext}<extra></extra>',
      },
      {
        type: 'bar',
        name: 'Saving',
        offsetgroup: 'bridge',
        x: ['Vendors', 'Travel'],
        y: [-2.1, -0.6],
        base: [54.0, 51.9],
        marker: { color: '#cc540a' },
        texttemplate: '%{y:.1f}',
        textposition: 'auto',
        insidetextfont: { color: '#2a1103', size: 12, weight: 'bold' },
        outsidetextfont: { color: '#e8a070', size: 11 },
        hovertext: ['Consolidated three analytics vendors', 'Travel policy change'],
        hovertemplate: '%{x}: %{y:.1f}<br>%{hovertext}<extra></extra>',
      },
      ...[
        { name: 'H1 spend', y: H1, color: '#5e74d5' },
        { name: 'H2 spend', y: H2, color: '#8fa2e8' },
      ].map((half, k) => ({
        type: 'bar' as const,
        name: half.name,
        xaxis: 'x2',
        yaxis: 'y2',
        x: DEPTS,
        y: half.y,
        offsetgroup: `h${k + 1}`,
        alignmentgroup: 'spend',
        marker: { color: half.color },
        texttemplate: '%{y:.1f}',
        textposition: 'outside' as const,
        meta: 'US$ M',
        hovertemplate: '%{x}, %{fullData.name}: %{y:.1f} %{meta}<extra></extra>',
        selectedpoints: over(half.y),
        selected: { marker: { color: '#cc540a' }, textfont: { color: '#e8a070' } },
        unselected: { marker: { opacity: 0.75 }, textfont: { color: '#80838f' } },
      })),
      {
        type: 'bar',
        name: 'Half-year budget',
        xaxis: 'x2',
        yaxis: 'y2',
        x: DEPTS,
        y: HALF_BUDGET,
        offsetgroup: 'budget',
        alignmentgroup: 'budget',
        zorder: -1,
        marker: { color: 'rgba(128, 131, 143, 0.18)', line: { color: '#80838f', width: 1 } },
        meta: 'US$ M',
        hovertemplate: '%{x} budget: %{y:.1f} %{meta}<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'FY25 operating budget' },
      xaxis: { domain: [0, 0.5], categoryorder: 'array', categoryarray: STEPS },
      yaxis: { range: [40, 56], title: { text: 'US$ M' } },
      xaxis2: { domain: [0.6, 1], anchor: 'y2' },
      yaxis2: { anchor: 'x2', range: [0, 8], title: { text: 'US$ M per half' } },
      legend: { orientation: 'h', x: 0, y: -0.14 },
      annotations: [
        {
          xref: 'x2 domain',
          yref: 'y2 domain',
          x: 0,
          y: 1,
          yanchor: 'bottom',
          xanchor: 'left',
          text: 'Orange: over the half-year budget',
          font: { size: 11, color: '#e8a070' },
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
