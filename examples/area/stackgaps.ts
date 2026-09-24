import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Stack gaps (plan E9.4): trace B has no values at x = 3, 4, 5 and 8, where trace A has. The same
 * data is stacked twice, in two subplots:
 *
 * - left, `stackgaps: 'infer zero'` (the default): B counts as 0 where it has no position, so its
 *   band collapses onto A there.
 * - right, `stackgaps: 'interpolate'`: B's value is interpolated linearly between its neighbors.
 *
 * `stackgaps` is set on the first trace of each group, which decides for the group.
 */
export const meta: ExampleMeta = {
  title: 'Area: stackgaps',
  description:
    "The same stack with a trace missing some x positions: stackgaps 'infer zero' (left) vs 'interpolate' (right).",
  tags: ['area', 'stacked', 'fill', 'scatter', 'subplots'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const ax = Array.from({ length: 11 }, (_, i) => i);
  const ay = ax.map((v) => 3 + Math.sin(v / 2));
  const bx = ax.filter((v) => ![3, 4, 5, 8].includes(v));
  const by = bx.map((v) => 2 + v * 0.15);

  const pair = (side: 'left' | 'right') => {
    const axes = side === 'left' ? {} : { xaxis: 'x2', yaxis: 'y2' };
    return [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'A',
        x: ax,
        y: ay,
        stackgroup: side,
        stackgaps: side === 'left' ? 'infer zero' : 'interpolate',
        line: { color: '#ea2a37' },
        legendgroup: 'a',
        showlegend: side === 'left',
        ...axes,
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'B (no x = 3–5, 8)',
        x: bx,
        y: by,
        stackgroup: side,
        line: { color: '#5e74d5' },
        legendgroup: 'b',
        showlegend: side === 'left',
        ...axes,
      },
    ];
  };

  // Panel labels sit inside the top of each plot: the legend row is above the plots.
  const panel = (n: string, text: string) => ({
    xref: `${n} domain`,
    yref: `y${n.slice(1)} domain`,
    x: 0.5,
    y: 1,
    yanchor: 'top',
    text,
    showarrow: false,
  });

  const chart = createChart(el, {
    data: [...pair('left'), ...pair('right')],
    layout: {
      xaxis: { domain: [0, 0.47] },
      yaxis: { range: [0, 8] },
      xaxis2: { domain: [0.53, 1], anchor: 'y2' },
      yaxis2: { anchor: 'x2', range: [0, 8] },
      annotations: [panel('x', "stackgaps: 'infer zero'"), panel('x2', "stackgaps: 'interpolate'")],
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
