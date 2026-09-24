import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Gradient fills (plan E9.4): `fillgradient` draws a colorscale instead of `fillcolor`.
 *
 * - `'vertical'`: along y, from `start` to `stop` (data values; by default the fill's own extent).
 *   Here a price area fades from transparent at y = 0 to opaque at the top.
 * - `'horizontal'`: along x, here from blue to red across a day of temperatures.
 * - `'radial'`: from the center of the fill's bounding box outwards, on a closed `'toself'` blob.
 *
 * The colorscale stops use rgba colors, so the gradient can fade to transparent.
 */
export const meta: ExampleMeta = {
  title: 'Area: gradient fills',
  description:
    'fillgradient in three directions: a vertical fade to transparent, a horizontal colorscale along x, and a radial glow.',
  tags: ['area', 'fill', 'gradient', 'colorscale', 'scatter'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // Panel 1: a smooth price curve.
  const px = Array.from({ length: 80 }, (_, i) => i);
  const py = px.map((i) => 60 + 25 * Math.sin(i / 11) + 10 * Math.sin(i / 3.7) + i * 0.4);
  // Panel 2: temperatures over a day, hour by hour.
  const hours = Array.from({ length: 25 }, (_, i) => i);
  const temp = hours.map((h) => 14 + 9 * Math.sin(((h - 9) / 24) * 2 * Math.PI));
  // Panel 3: a closed, wobbly blob around (0, 0).
  const angles = Array.from({ length: 73 }, (_, i) => (i / 72) * 2 * Math.PI);
  const radius = angles.map((a) => 1 + 0.18 * Math.sin(3 * a) + 0.08 * Math.cos(5 * a));

  const panel = (n: string, text: string) => ({
    xref: `${n} domain`,
    yref: `y${n.slice(1)} domain`,
    x: 0.5,
    y: 1,
    yanchor: 'bottom',
    text,
    showarrow: false,
  });

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        x: px,
        y: py,
        fill: 'tozeroy',
        line: { color: '#5e74d5', width: 1.5 },
        fillgradient: {
          type: 'vertical',
          colorscale: [
            [0, 'rgba(94, 116, 213, 0)'],
            [1, 'rgba(94, 116, 213, 0.7)'],
          ],
        },
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: hours,
        y: temp,
        xaxis: 'x2',
        yaxis: 'y2',
        fill: 'tozeroy',
        line: { color: '#a4a7b5', width: 1.25 },
        fillgradient: {
          type: 'horizontal',
          colorscale: [
            [0, 'rgba(47, 125, 225, 0.8)'],
            [0.5, 'rgba(153, 98, 192, 0.8)'],
            [1, 'rgba(234, 42, 55, 0.8)'],
          ],
        },
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: angles.map((a, i) => Math.cos(a) * radius[i]!),
        y: angles.map((a, i) => Math.sin(a) * radius[i]!),
        xaxis: 'x3',
        yaxis: 'y3',
        fill: 'toself',
        line: { color: '#9962c0', width: 1 },
        fillgradient: {
          type: 'radial',
          colorscale: [
            [0, 'rgba(255, 43, 214, 0.9)'],
            [1, 'rgba(106, 0, 244, 0.2)'],
          ],
        },
      },
    ],
    layout: {
      showlegend: false,
      xaxis: { domain: [0, 0.3] },
      xaxis2: { domain: [0.37, 0.67], anchor: 'y2', dtick: 6 },
      yaxis2: { anchor: 'x2', ticksuffix: '°' },
      xaxis3: { domain: [0.74, 1], anchor: 'y3', range: [-1.4, 1.4] },
      yaxis3: { anchor: 'x3', range: [-1.6, 1.6] },
      annotations: [panel('x', "'vertical'"), panel('x2', "'horizontal'"), panel('x3', "'radial'")],
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
