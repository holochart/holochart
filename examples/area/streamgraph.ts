import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Streamgraph (plan E9.4 recipe): a stack group centered on y = 0. The group's FIRST trace is an
 * invisible baseline at −total/2 for every x (`fill: 'none'`, `line.width: 0`, no legend entry, no
 * hover); the series stack on top of it, so the stack is symmetric around zero. `line.shape:
 * 'spline'` smooths the edges, and the fills follow the smoothed lines. The y values carry no
 * meaning here, so the y tick labels are hidden.
 */
export const meta: ExampleMeta = {
  title: 'Area: streamgraph',
  description:
    'A stack group centered on zero by an invisible first baseline trace (−total/2), with spline-smoothed bands.',
  tags: ['area', 'stacked', 'streamgraph', 'spline', 'fill', 'scatter'],
  testTolerance: 0.004,
};

const GENRES = ['Rock', 'Pop', 'Hip-hop', 'Electronic', 'Jazz'];

export function run(el: HTMLElement): ExampleHandle {
  // Closed-form bumps: each genre peaks at a different time.
  const x = Array.from({ length: 41 }, (_, i) => 1985 + i);
  const bump = (center: number, width: number, height: number, floor: number) => (v: number) =>
    floor + height * Math.exp(-(((v - center) / width) ** 2));
  const shapes = [
    bump(1992, 9, 30, 6),
    bump(2008, 12, 26, 10),
    bump(2016, 8, 32, 3),
    bump(2012, 6, 18, 2),
    bump(1990, 14, 8, 4),
  ];
  const ys = shapes.map((f) => x.map(f));
  const baseline = x.map((_, i) => -ys.reduce((sum, y) => sum + y[i]!, 0) / 2);

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        name: 'baseline',
        x,
        y: baseline,
        stackgroup: 'stream',
        fill: 'none',
        line: { width: 0, shape: 'spline' },
        showlegend: false,
        hoverinfo: 'skip',
      },
      ...GENRES.map((name, k) => ({
        type: 'scatter',
        name,
        x,
        y: ys[k]!,
        stackgroup: 'stream',
        line: { width: 0.5, shape: 'spline' },
        hovertemplate: '%{y:.1f}',
      })),
    ],
    layout: {
      font: { family: 'Inter', size: 12 },
      hovermode: 'x unified',
      title: { text: 'Listening by genre' },
      yaxis: { showticklabels: false, showgrid: false, zeroline: false },
      margin: { l: 24, r: 24, t: 48, b: 40 },
      plot_bgcolor: '#ffffff',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
