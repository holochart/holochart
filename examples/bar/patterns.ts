import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Pattern fills (plan E8.10): every `marker.pattern.shape`, one per bar (`shape` is arrayOk, like
 * `size` and `solidity`). With the default `fillmode: 'replace'` the hatch is drawn in the bar
 * color on a transparent background, so bars read as outlines filled with lines or dots; the
 * outline (`marker.line`) keeps the bar's edge.
 */
export const meta: ExampleMeta = {
  title: 'Bar: pattern shapes',
  description:
    'Every marker.pattern.shape, one per bar: diagonal, straight and crossed lines, dots.',
  tags: ['bar', 'chart', 'pattern', 'customization'],
};

const QUIET_MS = 500;

/** Resolves once frames have stopped for a while (tick labels typeset asynchronously). */
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
  const shapes = ['', '/', '\\', 'x', '-', '|', '+', '.'];
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: ['none', '/', '\\', 'x', '-', '|', '+', '.'],
        y: [9, 14, 12, 17, 11, 15, 13, 16],
        marker: {
          color: '#5e74d5',
          line: { width: 1, color: '#5e74d5' },
          pattern: { shape: shapes },
        },
      },
    ],
    layout: {
      title: { text: 'marker.pattern.shape' },
      xaxis: { title: { text: 'shape' } },
    },
    config: { responsive: true },
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
