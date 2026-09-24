import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A 2×3 `layout.grid` with `pattern: 'independent'` (plan E4.4): every cell gets its own axis
 * pair, `xy`, `x2y2`, … `x6y6` in row-major order from the top-left, so each panel autoranges on
 * its own data and bar panels keep category x axes next to numeric scatter panels. Independent
 * subplots default to wider gaps (`xgap: 0.2`, `ygap: 0.3`) than coupled ones, leaving room for
 * every panel's tick labels.
 */
export const meta: ExampleMeta = {
  title: 'Grid: independent 2×3',
  description:
    'layout.grid with pattern independent: six panels on xy … x6y6, mixing scatter and bar traces with their own ranges.',
  tags: ['dev', 'grid', 'subplots', 'layout', 'scatter', 'bar'],
  size: { width: 800, height: 480 },
  testTolerance: 0.004,
};

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const REGIONS = ['North', 'South', 'East', 'West', 'Online'];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(7);
  const normal = gaussian(random);
  const t = Array.from({ length: 50 }, (_, i) => i / 5);

  const chart = createChart(el, {
    data: [
      // Row 1: xy, x2y2, x3y3.
      { type: 'scatter', mode: 'lines', x: t, y: t.map((v) => Math.sin(v)) },
      { type: 'bar', x: QUARTERS, y: [42, 55, 38, 61], xaxis: 'x2', yaxis: 'y2' },
      {
        type: 'scatter',
        mode: 'markers',
        x: t.map(() => normal()),
        y: t.map(() => normal()),
        xaxis: 'x3',
        yaxis: 'y3',
        marker: { size: 6, opacity: 0.8 },
      },
      // Row 2: x4y4, x5y5, x6y6.
      {
        type: 'bar',
        x: REGIONS,
        y: REGIONS.map(() => Math.round(200 + random() * 800)),
        xaxis: 'x4',
        yaxis: 'y4',
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        x: t.slice(0, 12),
        y: t.slice(0, 12).map((v) => 1000 * Math.exp(v / 1.5)),
        xaxis: 'x5',
        yaxis: 'y5',
      },
      {
        type: 'bar',
        x: QUARTERS,
        y: [-3.2, 1.4, 4.8, -0.6],
        xaxis: 'x6',
        yaxis: 'y6',
      },
    ],
    layout: {
      grid: { rows: 2, columns: 3, pattern: 'independent' },
      showlegend: false,
    },
    config: { responsive: true },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
