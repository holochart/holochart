import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeInteraction } from './spikes-hook.mts';

/**
 * Linked axes (plan E3.9): four independent subplots (`layout.grid`, `pattern: 'independent'`)
 * whose axes are linked with `matches`: every x axis matches `x` and every y axis matches `y`.
 * Each panel has its own axis (and draws its own ticks), but the ranges are one: the group
 * autoranges over all four cities' data together, so the panels compare at a glance, and a zoom
 * or pan in any panel moves all four.
 */
export const meta: ExampleMeta = {
  title: 'Linked axes: matches across a grid',
  description:
    'Four subplots with separate axes linked by matches: one autorange over all the data, shared zoom and pan.',
  tags: ['dev', 'axes', 'matches', 'grid', 'subplots', 'scatter'],
  size: { width: 760, height: 480 },
  testTolerance: 0.004,
};

const CITIES = [
  { name: 'Oslo', mean: 6, swing: 9 },
  { name: 'Madrid', mean: 15, swing: 9 },
  { name: 'Singapore', mean: 27.5, swing: 1 },
  { name: 'Buenos Aires', mean: 17, swing: -6 },
];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(5));
  const weeks = Array.from({ length: 52 }, (_, i) => i + 1);
  const ids = ['', '2', '3', '4'];
  const chart = createChart(el, {
    data: CITIES.map((c, k) => ({
      type: 'scatter',
      mode: 'lines',
      name: c.name,
      x: weeks,
      y: weeks.map(
        (w) =>
          Math.round((c.mean - c.swing * Math.cos((2 * Math.PI * (w - 3)) / 52) + normal()) * 10) /
          10,
      ),
      xaxis: `x${ids[k]}`,
      yaxis: `y${ids[k]}`,
      hovertemplate: `${c.name}, week %{x}: %{y:.1f} °C<extra></extra>`,
    })),
    layout: {
      title: { text: 'Weekly mean temperature (°C), one range for every panel' },
      showlegend: false,
      grid: { rows: 2, columns: 2, pattern: 'independent' },
      annotations: CITIES.map((c, k) => ({
        text: c.name,
        xref: `x${ids[k]} domain`,
        yref: `y${ids[k]} domain`,
        x: 0.02,
        y: 0.98,
        xanchor: 'left',
        yanchor: 'top',
        showarrow: false,
      })),
      xaxis2: { matches: 'x' },
      xaxis3: { matches: 'x' },
      xaxis4: { matches: 'x' },
      yaxis2: { matches: 'y' },
      yaxis3: { matches: 'y' },
      yaxis4: { matches: 'y' },
    },
  });
  const dispose = exposeInteraction(chart);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      dispose();
      chart.destroy();
    },
  };
}
