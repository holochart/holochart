import { bubbleSizeref, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `sizemode: 'area'` vs `'diameter'` (plan E9.5): the same doubling values (1, 2, 4, … 64) in two
 * rows, each scaled so that 64 draws 48 px across.
 *
 * - `'area'`: the marker area is proportional to the value, so each bubble has twice the area of
 *   the one before it. Readers judge bubbles by area, so this is the honest choice for data.
 * - `'diameter'` (the default): the diameter is proportional to the value, so the area grows with
 *   the square of the value and large values look much larger than they are.
 */
export const meta: ExampleMeta = {
  title: 'Bubble: area vs diameter',
  description:
    "The same values drawn with sizemode 'area' and 'diameter': doubling values double the area in one, the width in the other.",
  tags: ['bubble', 'scatter', 'markers', 'size'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const values = [1, 2, 4, 8, 16, 32, 64];
  const x = values.map(String);
  const row = (sizemode: 'area' | 'diameter', color: string) => ({
    type: 'scatter',
    mode: 'markers',
    name: `sizemode: '${sizemode}'`,
    x,
    y: values.map(() => sizemode),
    marker: {
      size: values,
      sizemode,
      sizeref: bubbleSizeref(values, 48, { sizemode }),
      color,
    },
    hovertemplate: `size %{marker.size} (${sizemode})<extra></extra>`,
  });

  const chart = createChart(el, {
    data: [row('diameter', '#ea2a37'), row('area', '#5e74d5')],
    layout: {
      showlegend: false,
      xaxis: { title: { text: 'marker.size' } },
      yaxis: { title: { text: 'marker.sizemode' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
