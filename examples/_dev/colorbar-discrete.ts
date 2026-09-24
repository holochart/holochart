import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A discrete (stepped) colorscale (E5.3): stops repeated at the same position make hard edges, so
 * the colorbar draws one block per class; `tickvals`/`ticktext` label the middle of each block.
 */
export const meta: ExampleMeta = {
  title: 'Colorbar: discrete classes',
  description:
    'Four-class stepped colorscale on a scatter; the colorbar draws blocks labelled by tickvals/ticktext.',
  tags: ['dev', 'chart', 'colorbar', 'scatter'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

/** Brighter means riskier, reading on the dark background. */
const CLASSES = ['#6a00f4', '#ff2bd6', '#ff9e00', '#f9f871'];

function stepped(colors: readonly string[]): [number, string][] {
  return colors.flatMap((c, i): [number, string][] => [
    [i / colors.length, c],
    [(i + 1) / colors.length, c],
  ]);
}

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(31);
  const n = 160;
  const x = Float64Array.from({ length: n }, () => random() * 10);
  const y = Float64Array.from({ length: n }, () => random() * 10);
  const cls = Array.from(x, (v, i) => Math.min(3, Math.floor((v + (y[i] as number)) / 5)));

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x,
        y,
        marker: {
          size: 10,
          color: cls,
          cmin: -0.5,
          cmax: 3.5,
          colorscale: stepped(CLASSES),
          showscale: true,
          colorbar: {
            tickvals: [0, 1, 2, 3],
            ticktext: ['low', 'medium', 'high', 'extreme'],
            outlinewidth: 0,
            thickness: 20,
            len: 0.7,
            yanchor: 'top',
            y: 1,
            title: { text: '<b>Risk</b>' },
          },
        },
      },
    ],
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
