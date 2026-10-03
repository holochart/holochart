import { createChart, type Chart, type Scatter3dTrace, type VolumeTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The inverse-square law: the light of a lamp spreads over a sphere whose area grows with the
 * square of the distance, so its brightness falls as `1 / r²`. The brightness on a 46³ grid around
 * the lamp, relative to the brightness at 1 m, is a `volume` drawn as seven nested translucent
 * shells (`surface.count`), one each time the brightness halves twice over: the shells of
 * brightness 1, 1/4 and 1/16 lie at 1 m, 2 m and 4 m. The grid holds the base-2 logarithm of the
 * brightness, so that the shells are evenly spaced in "halvings" (the colorbar's tick text gives
 * the brightness itself), and an `opacityscale` leaves the faint far shells nearly clear and makes
 * the bright core dense. The lamp is a `scatter3d` marker.
 */
export const meta: ExampleMeta = {
  title: 'Light: twice as far, a quarter as bright',
  description:
    'A translucent 3D volume of the brightness around a lamp, falling with the square of the distance.',
  tags: ['demo', 'volume', 'scatter3d', '3d', 'opacityscale', 'physics'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

const HALF = 4.5; // m
const NEAREST = 0.5; // m: the innermost shell
const FARTHEST = 4; // m: the outermost shell

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const nodes = linspace(-HALF, HALF, 46);
  const n = nodes.length ** 3;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const value = new Float32Array(n);
  let o = 0;
  for (const zz of nodes) {
    for (const yy of nodes) {
      for (const xx of nodes) {
        x[o] = xx;
        y[o] = yy;
        z[o] = zz;
        // log2 of the brightness 1 / r² (capped close to the lamp).
        value[o++] = -2 * Math.log2(Math.max(Math.hypot(xx, yy, zz), NEAREST / 2));
      }
    }
  }

  const glow: VolumeTrace = {
    type: 'volume',
    name: 'Brightness',
    x,
    y,
    z,
    value,
    // From the brightness 4 m away (1/16 = 2⁻⁴) to that at 0.5 m (4 = 2²), a shell every factor of 2.
    isomin: -2 * Math.log2(FARTHEST),
    isomax: -2 * Math.log2(NEAREST),
    surface: { count: 7 },
    caps: { x: { show: false }, y: { show: false }, z: { show: false } },
    opacity: 0.7,
    opacityscale: [
      [0, 0.16],
      [0.5, 0.35],
      [1, 1],
    ],
    colorscale: [
      [0, '#5a3f12'],
      [0.35, '#b5822e'],
      [0.7, '#f0c860'],
      [1, '#fff6d6'],
    ],
    colorbar: {
      title: { text: 'Brightness (1 = at 1 m)', side: 'right' },
      tickvals: [-4, -2, 0, 2],
      ticktext: ['1/16 (4 m away)', '1/4 (2 m away)', '1 (1 m away)', '4 (0.5 m away)'],
      thickness: 12,
      len: 0.7,
    },
    hovertemplate: 'x %{x:.1f} m, y %{y:.1f} m, z %{z:.1f} m<extra></extra>',
  };
  const lamp: Scatter3dTrace = {
    type: 'scatter3d',
    mode: 'markers',
    name: 'Lamp',
    x: [0],
    y: [0],
    z: [0],
    marker: { color: '#ffffff', size: 5 },
    hovertemplate: 'Lamp<extra></extra>',
    showlegend: false,
  };

  const chart: Chart = createChart(chartEl, {
    data: [glow, lamp],
    layout: {
      title: {
        text: narrow ? '' : 'Light from a lamp: twice as far, a quarter as bright',
      },
      margin: { l: 0, r: 0, t: 48, b: 0 },
      scene: {
        aspectmode: 'cube',
        camera: { eye: { x: 1.4, y: -1.4, z: 0.85 } },
        xaxis: { title: { text: 'x (m)' } },
        yaxis: { title: { text: 'y (m)' } },
        zaxis: { title: { text: 'z (m)' } },
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.01,
          y: 0.99,
          xanchor: 'left',
          yanchor: 'top',
          showarrow: false,
          align: 'left',
          text: 'Shells at 0.5, 0.7, 1, 1.4, 2, 2.8 and 4 m: each is half as bright as the one inside it',
          font: { size: 11, color: LOOK.text },
        },
      ],
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
