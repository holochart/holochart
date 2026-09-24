import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * One legend for a multi-region dashboard (plan E5.2): request-rate lines, stacked error bars and a
 * client-mix pie share a single legend, grouped by region.
 *
 * Every trace of a region carries the same `legendgroup`, and `traceorder: 'grouped'` gathers them
 * into blocks separated by `tracegroupgap`. `legendrank` orders the blocks by traffic (EMEA,
 * AMER, APAC) although the traces are declared alphabetically; the pie's slices form the last block
 * (`legendgroup: 'clients'`, a high `legendrank`). The line entries have a second line listing the
 * region's data centers; `valign: 'top'` keeps their glyph level with the first line.
 *
 * Interaction is tuned for comparing regions: a click isolates the item (`itemclick:
 * 'toggleothers'`), a double click toggles only it (`itemdoubleclick: 'toggle'`), and clicks act
 * on the item, not its whole group (`groupclick: 'toggleitem'`).
 *
 * The legend is a vertical column (`orientation: 'v'`; the default look's is a row above the plot)
 * pinned to the figure's right edge rather than to the plot (`xref` / `yref:
 * 'container'`, right / middle anchors) in a margin reserved for it, with items indented under a
 * centered small-caps heading (`indentation`, `title.side: 'top center'`, `title.font`) and
 * slightly larger, brighter item text (`font`).
 */
export const meta: ExampleMeta = {
  title: 'Legend: grouped and ranked across a dashboard',
  description:
    'Lines, stacked bars and a pie in one legend: legendgroup blocks ordered by legendrank, two-line entries, container-anchored placement and a styled heading.',
  tags: ['legend', 'scatter', 'bar', 'pie', 'subplots'],
  size: { width: 860, height: 460 },
  testTolerance: 0.004,
};

interface Region {
  id: string;
  sites: string;
  base: number;
  peak: number;
  rank: number;
  color: string;
}

const REGIONS: Region[] = [
  { id: 'AMER', sites: 'us-east, us-west', base: 900, peak: 16, rank: 2, color: '#5e74d5' },
  { id: 'APAC', sites: 'ap-south, ap-east', base: 500, peak: 6, rank: 3, color: '#118e36' },
  { id: 'EMEA', sites: 'eu-west, eu-central', base: 1200, peak: 11, rank: 1, color: '#ea2a37' },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(91));
  const random = rng(92);

  const traces = REGIONS.flatMap((r) => {
    const rate = HOURS.map((h) => {
      const daily = 1 + 0.6 * Math.sin(((h - r.peak + 6) / 24) * 2 * Math.PI);
      return Math.round(r.base * daily * (1 + normal() * 0.04));
    });
    const errors = rate.map((v) => Math.round((v / 100) * (0.5 + random())));
    return [
      {
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: `${r.id} requests/s<br><span style="font-size:8px">${r.sites}</span>`,
        x: HOURS,
        y: rate,
        line: { color: r.color, width: 2 },
        legendgroup: r.id,
        legendrank: r.rank,
      },
      {
        type: 'bar' as const,
        name: `${r.id} errors/h`,
        x: HOURS,
        y: errors,
        xaxis: 'x2',
        yaxis: 'y2',
        marker: { color: r.color },
        legendgroup: r.id,
        legendrank: r.rank,
      },
    ];
  });

  const chart = createChart(el, {
    data: [
      ...traces,
      {
        type: 'pie',
        labels: ['Web', 'Mobile', 'Partner API'],
        values: [52, 33, 15],
        hole: 0.55,
        domain: { x: [0.72, 1], y: [0.2, 0.8] },
        marker: { colors: ['#128b8b', '#997600', '#b8267e'] },
        textinfo: 'percent',
        legendgroup: 'clients',
        legendrank: 100,
      },
    ],
    layout: {
      title: { text: 'Traffic by region, last 24 h' },
      barmode: 'stack',
      margin: { r: 170 },
      xaxis: { domain: [0, 0.64], anchor: 'y', showticklabels: false },
      yaxis: { domain: [0.44, 1], title: { text: 'Requests/s' } },
      xaxis2: { domain: [0, 0.64], anchor: 'y2', title: { text: 'Hour (UTC)' } },
      yaxis2: { domain: [0, 0.36], title: { text: 'Errors/h' } },
      legend: {
        orientation: 'v',
        xref: 'container',
        x: 0.99,
        xanchor: 'right',
        yref: 'container',
        y: 0.5,
        yanchor: 'middle',
        traceorder: 'grouped',
        tracegroupgap: 8,
        valign: 'top',
        indentation: 6,
        itemclick: 'toggleothers',
        itemdoubleclick: 'toggle',
        groupclick: 'toggleitem',
        font: { size: 10, color: '#d7d9e2' },
        title: {
          text: 'Region / client',
          side: 'top center',
          font: { size: 11, weight: 'bold', variant: 'small-caps', color: '#e6e8ef' },
        },
      },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
