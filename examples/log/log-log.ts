import { componentsReady, createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Log–log (plan E11.11): the populations of 300 synthetic cities against their rank, on two log
 * axes. Zipf's law says population ∝ rank⁻¹, a power law, which a log–log plot turns into a
 * straight line whose slope is the exponent; the fitted line shows it.
 */
export const meta: ExampleMeta = {
  title: 'Log: log–log power law',
  description:
    'City population against rank on log–log axes, where the power law of Zipf is a straight line, with a fitted line.',
  tags: ['log', 'axes', 'scatter', 'markers'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(1949);
  const rank = Array.from({ length: 300 }, (_, i) => i + 1);
  const population = rank.map((r) => Math.round(9.2e6 * r ** -1.04 * (0.75 + random() * 0.5)));
  // Least-squares fit of log(population) = a + k·log(rank).
  const lx = rank.map(Math.log10);
  const ly = population.map(Math.log10);
  const mx = lx.reduce((s, v) => s + v, 0) / lx.length;
  const my = ly.reduce((s, v) => s + v, 0) / ly.length;
  let sxy = 0;
  let sxx = 0;
  lx.forEach((v, i) => {
    sxy += (v - mx) * (ly[i]! - my);
    sxx += (v - mx) ** 2;
  });
  const k = sxy / sxx;
  const a = my - k * mx;

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Cities',
        x: rank,
        y: population,
        marker: { size: 6, opacity: 0.75 },
        hovertemplate: 'Rank %{x}: %{y:,}<extra></extra>',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: `Fit: rank^${k.toFixed(2)}`,
        x: [1, 300],
        y: [10 ** a, 10 ** (a + k * Math.log10(300))],
        line: { width: 2, dash: 'dash' },
      },
    ],
    layout: {
      title: { text: 'City size against rank' },
      legend: { x: 0.98, xanchor: 'right', y: 0.98 },
      xaxis: { type: 'log', title: { text: 'Rank' } },
      yaxis: { type: 'log', title: { text: 'Population' }, exponentformat: 'SI' },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
