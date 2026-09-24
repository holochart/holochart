import { bubbleSizeref, createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Scaling bubbles for large values (plan E9.5): populations run from about 100 thousand to over a
 * billion, far beyond pixel sizes. `bubbleSizeref(sizes, maxPx)` returns the `marker.sizeref` that
 * draws the largest value `maxPx` px across; for `sizemode: 'area'` that is Plotly's documented
 * `2 · max(size) / maxPx²`. `sizemin` keeps the smallest countries visible. The x axis is
 * logarithmic.
 */
export const meta: ExampleMeta = {
  title: 'Bubble: sizeref for large values',
  description:
    'Population-sized bubbles scaled with bubbleSizeref(sizes, 56) so the largest is 56 px, on a log x axis.',
  tags: ['bubble', 'scatter', 'markers', 'size', 'log'],
  testTolerance: 0.004,
};

const CONTINENTS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(331);
  // Synthetic countries: population, GDP per capita (US$), and life expectancy (years).
  const groups = CONTINENTS.map((name, k) => {
    const n = [14, 10, 14, 12, 5][k]!;
    const pop = Array.from({ length: n }, () => Math.round(10 ** (5 + random() * 4.1)));
    const gdp = Array.from({ length: n }, () => 10 ** (2.8 + k * 0.25 + random() * 1.4));
    const life = gdp.map((g) => 40 + 8 * Math.log10(g) + (random() - 0.5) * 6);
    return { name, pop, gdp, life };
  });

  // One sizeref for all traces, so bubble sizes compare across continents.
  const sizeref = bubbleSizeref(
    groups.flatMap((g) => g.pop),
    56,
  );

  const chart = createChart(el, {
    data: groups.map((g) => ({
      type: 'scatter',
      mode: 'markers',
      name: g.name,
      x: g.gdp,
      y: g.life,
      marker: { size: g.pop, sizemode: 'area', sizeref, sizemin: 3 },
      hovertemplate: 'GDP/capita %{x:$,.0f}<br>Life exp. %{y:.1f}<br>Pop. %{marker.size:,}',
    })),
    layout: {
      // Label 1, 2 and 5 of each decade: the default look's dense `nticks` would label every digit.
      xaxis: { type: 'log', dtick: 'D2', title: { text: 'GDP per capita (US$)' } },
      yaxis: { title: { text: 'Life expectancy (years)' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
