import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Grouped bars (plan E9.9): `barmode: 'group'` (the default) puts the traces of one position side
 * by side; `bargap` spaces the groups and `bargroupgap` the bars within a group. The third trace
 * shares an `offsetgroup` with the first, so it overlays it (targets behind the actuals, with a
 * narrower `width`). The 2024 bars carry error bars (E9.7).
 */
export const meta: ExampleMeta = {
  title: 'Bar: grouped',
  description:
    'Three traces grouped per quarter with bargap and bargroupgap; an offsetgroup overlays targets; error bars.',
  tags: ['bar', 'chart', 'group', 'barmode', 'error-bars'],
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
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: '2025 target',
        x: quarters,
        y: [24, 28, 30, 34],
        offsetgroup: 'a',
        // The 2025 color, translucent: targets read as a backdrop to the actuals.
        marker: { color: 'rgba(234, 42, 55, 0.3)' },
      },
      {
        type: 'bar',
        name: '2024',
        x: quarters,
        y: [18, 22, 19, 27],
        offsetgroup: 'b',
        error_y: { array: [2, 1.5, 3, 2.5], thickness: 1.5, width: 6 },
      },
      {
        type: 'bar',
        name: '2025',
        x: quarters,
        y: [21, 25, 31, 29],
        offsetgroup: 'a',
        width: 0.2,
        marker: { color: '#ea2a37' },
      },
    ],
    layout: {
      barmode: 'group',
      bargap: 0.25,
      bargroupgap: 0.1,
    },
    config: { responsive: true },
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
