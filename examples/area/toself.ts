import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Closed shapes (plan E9.4): `fill: 'toself'` joins the last point of a line back to the first and
 * fills the shape.
 *
 * - A triangle: three points are enough, the closing edge is implied.
 * - A pentagram whose edges cross: like SVG, fills use the nonzero rule, so the center is filled.
 * - Two squares in one trace, separated by a `null`: each line segment is filled on its own.
 *
 * Without markers or text, `'toself'` traces hover on the fill (`hoveron: 'fills'`) and report the
 * trace name.
 */
export const meta: ExampleMeta = {
  title: "Area: fill 'toself'",
  description:
    "Closed shapes with fill: 'toself': a triangle, a self-intersecting pentagram (nonzero rule), and two segments split by a null.",
  tags: ['area', 'fill', 'toself', 'shapes', 'scatter'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // Pentagram: the five outer vertices of a regular pentagon, visited every second one.
  const star = Array.from({ length: 5 }, (_, k) => Math.PI / 2 + (k * 4 * Math.PI) / 5);

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'triangle',
        x: [0, 2, 1],
        y: [0, 0, 1.8],
        fill: 'toself',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'pentagram',
        x: star.map((a) => 4 + Math.cos(a)),
        y: star.map((a) => 0.9 + Math.sin(a)),
        fill: 'toself',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'two squares',
        x: [6, 7, 7, 6, null, 7.4, 8.4, 8.4, 7.4],
        y: [0, 0, 1, 1, null, 0.8, 0.8, 1.8, 1.8],
        fill: 'toself',
      },
    ],
    layout: {
      font: { family: 'Inter', size: 12 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { range: [-0.5, 9], zeroline: false },
      yaxis: { range: [-0.4, 2.2], zeroline: false },
      margin: { l: 40, r: 24, t: 40, b: 36 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
