import { createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic vertical bars (plan E9.8): one trace over category positions, including a negative value
 * (bars grow from zero both ways and the autorange includes zero). Axes are drawn in M1 wave 2, so
 * the plot area shows as `plot_bgcolor`.
 */
export const meta: ExampleMeta = {
  title: 'Bar: basic',
  description: 'Vertical bars over categories with a negative value, outlines and rounded ends.',
  tags: ['bar', 'chart', 'basic'],
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
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        y: [12, 18, 7, -5, 21, 15, 9],
        marker: { line: { width: 1.5, color: '#1f3b5a' }, cornerradius: 4 },
      },
    ],
    layout: {
      font: { family: 'Inter' },
      margin: { l: 48, r: 24, t: 24, b: 40 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#e5ecf6',
    },
    config: { responsive: true },
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
