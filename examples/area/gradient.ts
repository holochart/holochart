import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
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

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        x: px,
        y: py,
        fill: 'tozeroy',
        line: { color: '#636efa', width: 2 },
        fillgradient: {
          type: 'vertical',
          colorscale: [
            [0, 'rgba(99, 110, 250, 0)'],
            [1, 'rgba(99, 110, 250, 0.7)'],
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
        line: { color: '#2a3f5f', width: 1.5 },
        fillgradient: {
          type: 'horizontal',
          colorscale: [
            [0, 'rgba(33, 102, 172, 0.8)'],
            [0.5, 'rgba(244, 165, 130, 0.8)'],
            [1, 'rgba(178, 24, 43, 0.8)'],
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
        line: { color: '#ab63fa', width: 1 },
        fillgradient: {
          type: 'radial',
          colorscale: [
            [0, 'rgba(255, 255, 255, 0.9)'],
            [1, 'rgba(171, 99, 250, 0.8)'],
          ],
        },
      },
    ],
    layout: {
      font: { family: 'Inter', size: 12 },
      showlegend: false,
      margin: { l: 40, r: 16, t: 40, b: 36 },
      plot_bgcolor: '#f4f6fa',
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
