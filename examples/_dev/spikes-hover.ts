import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeInteraction } from './spikes-hook.mts';

/**
 * Spike lines (plan E3.10): crosshair lines from the hovered point to the axes. The x axis spikes
 * `across` the plot with a `marker` dot on the axis line; the y axis spikes `toaxis` in its own
 * color, solid. Spikes are drawn in the hover layer over the canvas, so moving them never
 * re-renders a trace. For the static image the example hovers a point programmatically with
 * `chart.hover` once the chart is ready; move the pointer over the plot to see the spikes follow
 * it, or toggle them with the modebar's spike button.
 */
export const meta: ExampleMeta = {
  title: 'Spike lines on hover',
  description:
    'Hovered point with an across+marker spike to the x axis and a solid toaxis spike to the y axis.',
  tags: ['dev', 'axes', 'spikes', 'hover', 'interaction', 'scatter'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(3));
  const x = Array.from({ length: 40 }, (_, i) => i);
  const a = x.map((i) => Math.round((50 + 12 * Math.sin(i / 6) + normal() * 2) * 10) / 10);
  const b = x.map((i) => Math.round((30 + 0.6 * i + normal() * 3) * 10) / 10);
  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'lines+markers', name: 'Signal', x, y: a },
      { type: 'scatter', mode: 'lines+markers', name: 'Trend', x, y: b },
    ],
    layout: {
      title: { text: 'Spike lines: across+marker on x, toaxis on y' },
      hovermode: 'closest',
      xaxis: { showspikes: true, spikemode: 'across+marker', spikethickness: 1, spikedash: 'dot' },
      yaxis: {
        showspikes: true,
        spikemode: 'toaxis',
        spikethickness: 1.5,
        spikedash: 'solid',
        spikecolor: '#5e74d5',
      },
    },
    // Plotly's spike toggle is opt-in: add it to the modebar.
    config: { modeBarButtonsToAdd: ['togglespikelines'] },
  });
  const dispose = exposeInteraction(chart);
  return {
    ready: chart.ready.then(() => {
      chart.hover([{ curveNumber: 0, pointNumber: 23 }]);
    }),
    renderer: chart.three.renderer,
    dispose: () => {
      dispose();
      chart.destroy();
    },
  };
}
