import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Pattern fill modes (plan E8.10). `fillmode: 'replace'` (the default) draws the hatch in the bar
 * color on a transparent background (`bgcolor`); `'overlay'` keeps the bar color as the background
 * and draws the hatch over it in the contrast color (white on dark colors, dark grey on light
 * ones) at `fgopacity` 0.5. `size` sets the tile (line spacing) in px and `solidity` the covered
 * fraction; both are arrayOk, like `shape`.
 */
export const meta: ExampleMeta = {
  title: 'Bar: pattern fill modes',
  description:
    "Grouped bars with fillmode 'replace' and 'overlay', and per-bar pattern size and solidity.",
  tags: ['bar', 'chart', 'pattern', 'grouped', 'customization'],
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
  const x = ['Q1', 'Q2', 'Q3', 'Q4'];
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: 'replace',
        x,
        y: [20, 14, 23, 17],
        marker: { line: { width: 1 }, pattern: { shape: '/', fillmode: 'replace' } },
      },
      {
        type: 'bar',
        name: 'overlay',
        x,
        y: [12, 18, 29, 21],
        marker: { pattern: { shape: '/', fillmode: 'overlay' } },
      },
      {
        type: 'bar',
        name: 'size, solidity',
        x,
        y: [16, 11, 19, 25],
        marker: {
          pattern: {
            shape: 'x',
            fillmode: 'overlay',
            size: [4, 6, 10, 14],
            solidity: [0.2, 0.4, 0.3, 0.6],
            fgopacity: 0.7,
          },
        },
      },
    ],
    layout: {
      barmode: 'group',
      title: { text: 'Pattern fill modes' },
    },
    config: { responsive: true },
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
