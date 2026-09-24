import { componentsReady, createChart } from '@mk7s/holochart';
import { INTER, registerInter } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An on-call dashboard: four independent panels in a `layout.grid` with explicit `subplots`. With
 * `roworder: 'bottom to top'` the first row of `subplots` is the bottom row, so the breakdowns
 * are listed first and the time series above them; `xgap` / `ygap` space the cells.
 *
 * The time series step every 3 hours but label every other tick (`ticklabelstep: 2`), and the
 * latency axis likewise draws a grid line every 100 ms but labels every 200 ms. Their y
 * labels sit inside the plot (`ticklabelposition: 'inside'`), lifted above the grid lines with
 * `ticklabelshift` and kept off the axis line with `ticklabelstandoff`, with a `shadow` halo so
 * they stay legible over the data. Throughput is in bytes, so `exponentformat: 'SI'` writes
 * `1.5G` (not `1.5B`) and `ticksuffix` completes it to `1.5GB/s`.
 *
 * Status codes are numeric strings: `autotypenumbers: 'strict'` keeps them categories (instead of
 * a numeric axis from 200 to 503), ordered by `categoryarray`. The regional latency bars use a
 * two-level (multicategory) x axis with colored dividers between regions. The log count axis
 * labels decades only (`nticks: 4`), and the breakdowns' category axes are `fixedrange`, so zooming
 * only acts along the value axes. The title (in the
 * registered Inter font) and its upper-case subtitle get extra `pad`ding, `margin.pad` separates the axes
 * from the plot areas, and `margin.autoexpand: false` keeps the margins fixed so the panel grid
 * lines up with other dashboard tiles.
 */
export const meta: ExampleMeta = {
  title: 'Layout: service health grid',
  description:
    'A 2×2 grid with explicit subplots and bottom-to-top row order: inside y labels, SI byte units, strict numeric categories, multicategory dividers.',
  tags: ['layout', 'grid', 'subplots', 'axes', 'monitoring', 'bar', 'line'],
  size: { width: 860, height: 560 },
  testTolerance: 0.004,
};

const MINUTE = 60_000;
const START = Date.UTC(2025, 2, 10, 0, 0);

export function run(el: HTMLElement): ExampleHandle {
  registerInter();
  const random = rng(42);
  const normal = gaussian(random);

  // 24 h in 5-minute samples: a daily traffic cycle with a deploy incident at 14:20.
  const n = 288;
  const t = Array.from({ length: n }, (_, i) => new Date(START + i * 5 * MINUTE).toISOString());
  const load = Array.from({ length: n }, (_, i) => {
    const h = (i * 5) / 60;
    return 0.55 + 0.4 * Math.sin(((h - 9) / 24) * 2 * Math.PI);
  });
  const incident = (i: number) => (i >= 172 && i < 184 ? 1 : 0);
  const p99 = load.map((l, i) => 180 + 140 * l + incident(i) * 420 + normal() * 12);
  const throughput = load.map((l, i) => (1.9e9 * l + normal() * 6e7) * (1 - incident(i) * 0.35));

  const codes = ['200', '304', '404', '429', '500', '503'];
  const counts = [1_840_000, 212_000, 38_400, 9_100, 2_300, 5_600];

  const regions = ['us', 'us', 'us', 'eu', 'eu', 'ap', 'ap'];
  const zones = ['east-1', 'east-2', 'west-2', 'west-1', 'central-1', 'south-1', 'northeast-1'];
  const regionP99 = [212, 224, 247, 231, 219, 288, 265];

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'p99 latency',
        x: t,
        y: p99,
        line: { width: 1.5 },
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Throughput',
        x: t,
        y: throughput,
        xaxis: 'x2',
        yaxis: 'y2',
        fill: 'tozeroy',
        line: { width: 1.5, color: '#3fd0e0' },
      },
      {
        type: 'bar',
        name: 'Responses',
        orientation: 'h',
        x: counts,
        y: codes,
        xaxis: 'x3',
        yaxis: 'y3',
        marker: { color: ['#5e74d5', '#5e74d5', '#e8a33d', '#e8a33d', '#d85c5c', '#d85c5c'] },
      },
      {
        type: 'bar',
        name: 'p99 by zone',
        x: [regions, zones],
        y: regionP99,
        xaxis: 'x4',
        yaxis: 'y4',
        marker: { color: '#8e6fd8' },
      },
    ],
    layout: {
      showlegend: false,
      title: {
        text: 'checkout-api · service health',
        font: { family: INTER, size: 15, weight: 700 },
        pad: { t: 10, l: 10 },
        subtitle: {
          text: 'Last 24 h, all regions, 5-minute resolution',
          font: { family: INTER, size: 9, textcase: 'upper', color: '#8b8e9c' },
        },
      },
      margin: { l: 44, r: 20, t: 70, b: 52, pad: 4, autoexpand: false },
      grid: {
        rows: 2,
        columns: 2,
        roworder: 'bottom to top',
        subplots: [
          ['x3y3', 'x4y4'],
          ['xy', 'x2y2'],
        ],
        xgap: 0.1,
        ygap: 0.26,
      },
      xaxis: {
        type: 'date',
        dtick: 3 * 60 * MINUTE,
        ticklabelstep: 2,
        tickformat: '%H:%M',
        hoverformat: '%H:%M UTC',
      },
      yaxis: {
        title: { text: 'p99 latency' },
        ticksuffix: ' ms',
        dtick: 100,
        ticklabelstep: 2,
        ticklabelposition: 'inside',
        ticklabelshift: -6,
        ticklabelstandoff: 4,
        tickfont: { shadow: 'auto' },
      },
      xaxis2: {
        type: 'date',
        dtick: 3 * 60 * MINUTE,
        ticklabelstep: 2,
        tickformat: '%H:%M',
        hoverformat: '%H:%M UTC',
      },
      yaxis2: {
        ticklabelposition: 'inside',
        ticklabelshift: -6,
        ticklabelstandoff: 4,
        tickfont: { shadow: 'auto' },
        nticks: 5,
        title: { text: 'Egress throughput' },
        exponentformat: 'SI',
        ticksuffix: 'B/s',
        rangemode: 'tozero',
      },
      xaxis3: {
        title: { text: 'Responses by status (24 h)' },
        exponentformat: 'SI',
        type: 'log',
        nticks: 4,
      },
      yaxis3: {
        autotypenumbers: 'strict',
        fixedrange: true,
        categoryarray: ['503', '500', '429', '404', '304', '200'],
      },
      xaxis4: { dividercolor: '#8b8e9c', dividerwidth: 1.5, fixedrange: true },
      yaxis4: { title: { text: 'p99 by zone' }, ticksuffix: ' ms', nticks: 5 },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
