import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic vertical bars (plan E9.8): one trace over category positions, including a negative value
 * (bars grow from zero both ways and the autorange includes zero). A lighter outline and rounded
 * ends style the bars, which take the first colorway color.
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
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        y: [12, 18, 7, -5, 21, 15, 9],
        marker: { line: { width: 1.5, color: '#ff9aa2' }, cornerradius: 4 },
      },
    ],
    layout: {},
    config: { responsive: true },
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
