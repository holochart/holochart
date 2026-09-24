import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Bubble chart (plan E9.5): `marker.size` holds one value per point. With `sizemode: 'area'` the
 * marker area, not its diameter, is proportional to the value, and `sizeref` sets the scale: a
 * value `v` draws `2·sqrt(v / 2 / sizeref)` px across. All three traces use the same `sizeref`, so
 * sizes compare across traces. `sizemin` keeps the smallest bubbles visible. Bubbles default to
 * `marker.opacity: 0.7` and a 1 px white outline, so overlaps stay readable.
 */
export const meta: ExampleMeta = {
  title: 'Bubble: basic',
  description:
    "Three groups of bubbles sized by value with sizemode: 'area' and one shared sizeref.",
  tags: ['bubble', 'scatter', 'markers', 'size'],
  testTolerance: 0.004,
};

const REGIONS = ['Americas', 'Europe', 'Asia-Pacific'];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(307);
  // Per store: advertising spend (k$), revenue (k$), and customers (the bubble size).
  const groups = REGIONS.map((name, k) => {
    const n = 12;
    const spend = Array.from({ length: n }, () => 10 + random() * 90);
    const revenue = spend.map((s) => 80 + s * (2.2 + k * 0.5) + (random() - 0.5) * 90);
    const customers = spend.map((s) => Math.round(200 + s * 30 * random() + 400 * random()));
    return { name, spend, revenue, customers };
  });
  // Draw the largest value 50 px across (Plotly's formula: 2 · max / maxPx²).
  const maxCustomers = Math.max(...groups.flatMap((g) => g.customers));
  const sizeref = (2 * maxCustomers) / 50 ** 2;

  useExampleFonts();
  const chart = createChart(el, {
    data: groups.map((g) => ({
      type: 'scatter',
      mode: 'markers',
      name: g.name,
      x: g.spend,
      y: g.revenue,
      marker: { size: g.customers, sizemode: 'area', sizeref, sizemin: 4 },
      hovertemplate: 'Spend %{x:.0f}k$<br>Revenue %{y:.0f}k$<br>%{marker.size} customers',
    })),
    layout: {
      font: { family: 'Inter', size: 12 },
      xaxis: { title: { text: 'Advertising spend (k$)' } },
      yaxis: { title: { text: 'Revenue (k$)' } },
      margin: { l: 64, r: 24, t: 24, b: 48 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
