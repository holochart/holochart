import { createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Horizontal bars on a log axis (plan E9.8): `orientation: 'h'` puts categories on y and lengths on
 * x. On a log axis bars have no zero to start from, so they start below the visible range (Plotly
 * semantics). Numeric `marker.color` maps through the Viridis colorscale.
 */
export const meta: ExampleMeta = {
  title: 'Bar: horizontal, log axis',
  description:
    'Horizontal bars spanning four decades on a log x axis, colored by value through a colorscale.',
  tags: ['bar', 'chart', 'horizontal', 'log', 'colorscale'],
};

const QUIET_MS = 500;

/**
 * `chart.ready` covers the first frame only; text (tick labels) typesets asynchronously and redraws
 * later. Resolve once frames have stopped for a while so visual tests capture the final frame.
 */
function settled(chart: Chart): Promise<void> {
  return chart.ready.then(
    () =>
      new Promise<void>((resolve) => {
        const done = (): void => {
          off();
          resolve();
        };
        let timer = setTimeout(done, QUIET_MS);
        const off = chart.on('afterrender', () => {
          clearTimeout(timer);
          timer = setTimeout(done, QUIET_MS);
        });
      }),
  );
}

export function run(el: HTMLElement): ExampleHandle {
  // Vendored Inter for axis labels: offline and deterministic (troika's default is a CDN font).
  useExampleFonts();
  const values = [3, 12, 45, 180, 720, 2900];
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        orientation: 'h',
        y: ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'],
        x: values,
        marker: { color: values.map(Math.log10), colorscale: 'Viridis' },
      },
    ],
    layout: {
      font: { family: 'Inter' },
      margin: { l: 48, r: 24, t: 24, b: 40 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#e5ecf6',
      xaxis: { type: 'log' },
      bargap: 0.3,
    },
    config: { responsive: true },
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
