import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Range band (plan E9.4): a forecast with an 80% interval. The lower bound is an invisible line
 * (`line.width: 0`); the upper bound fills down to it with `fill: 'tonexty'` and a semi-transparent
 * `fillcolor`. Both bounds share a `legendgroup` with one legend entry, so a single click hides the
 * whole band. The observed history and the forecast mean are ordinary lines drawn on top.
 */
export const meta: ExampleMeta = {
  title: 'Area: range band',
  description:
    "A forecast interval as a band between two bound traces (fill: 'tonexty'), under the history and the mean line.",
  tags: ['area', 'fill', 'band', 'scatter', 'forecast'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(223));
  // 60 observed weeks, then a 30-week forecast whose interval widens with the horizon.
  const hx = Array.from({ length: 60 }, (_, i) => i);
  let level = 40;
  const hy = hx.map((i) => (level += 0.35 + normal() * 1.4) + 4 * Math.sin(i / 4));
  const last = hy[hy.length - 1]!;
  const fx = Array.from({ length: 31 }, (_, i) => 59 + i);
  const mean = fx.map((v, i) => last + i * 0.35 + 4 * (Math.sin(v / 4) - Math.sin(59 / 4)));
  const spread = fx.map((_, i) => 1.28 * 1.4 * Math.sqrt(i));

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'lower',
        x: fx,
        y: mean.map((m, i) => m - spread[i]!),
        line: { width: 0 },
        legendgroup: 'interval',
        showlegend: false,
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: '80% interval',
        x: fx,
        y: mean.map((m, i) => m + spread[i]!),
        fill: 'tonexty',
        fillcolor: 'rgba(239, 85, 59, 0.2)',
        line: { width: 0 },
        legendgroup: 'interval',
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'history',
        x: hx,
        y: hy,
        line: { color: '#2a3f5f', width: 2 },
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'forecast',
        x: fx,
        y: mean,
        line: { color: '#ef553b', width: 2, dash: 'dash' },
      },
    ],
    layout: {
      font: { family: 'Inter', size: 12 },
      xaxis: { title: { text: 'Week' } },
      yaxis: { title: { text: 'Orders (thousands)' } },
      margin: { l: 56, r: 24, t: 24, b: 48 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
