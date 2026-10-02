import {
  createChart,
  type Chart,
  type Histogram2dcontourTrace,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { rng } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The electron cloud of a hydrogen atom in its lowest-energy state (1s), simulated: 20,000
 * electron positions drawn from the 1s probability density with a seeded generator. The distance
 * r from the nucleus is sampled from the radial distribution ∝ r² e^(−2r) (r in Bohr radii,
 * 1 a₀ = 0.053 nm) by rejection sampling, and the direction is uniform over the sphere. The plot
 * looks at the atom from the side, x against z.
 *
 * A `histogram2dcontour` bins the points and fills density contours (`contours.coloring: 'fill'`,
 * a dark-to-light `colorscale`, a color bar); a faint `scatter` of the first 4,000 positions sits
 * on top. `yaxis.scaleanchor: 'x'` keeps the scales equal so the cloud is round. A dashed circle
 * (a `shapes` circle) marks 1 Bohr radius, the single most likely distance: the cloud is densest
 * at the nucleus, but there is far more room farther out.
 */
export const meta: ExampleMeta = {
  title: 'Atoms: the electron cloud of hydrogen',
  description:
    'Twenty thousand simulated electron positions in a hydrogen atom, as filled density contours with a faint scatter on top.',
  tags: ['demo', 'histogram2dcontour', 'scatter', 'contour', 'statistical', 'simulated'],
  size: { width: 720, height: 600 },
  testTolerance: 0.004,
};

const N = 20_000;
const SHOWN = 4_000;

/** Simulated electron positions (x, z) in Bohr radii, from the 1s density. */
function sample(): { x: number[]; z: number[] } {
  const random = rng(1913);
  const x: number[] = [];
  const z: number[] = [];
  // The radial distribution r² e^(−2r) peaks at r = 1 with the value e^(−2).
  const top = Math.exp(-2);
  while (x.length < N) {
    const r = 10 * random();
    if (random() * top > r * r * Math.exp(-2 * r)) continue;
    const cos = 2 * random() - 1;
    const sin = Math.sqrt(1 - cos * cos);
    const phi = 2 * Math.PI * random();
    x.push(r * sin * Math.cos(phi));
    z.push(r * cos);
  }
  return { x, z };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const { x, z } = sample();

  const density: Histogram2dcontourTrace = {
    type: 'histogram2dcontour',
    name: 'Density',
    x,
    y: z,
    xbins: { start: -5, end: 5, size: 0.4 },
    ybins: { start: -5, end: 5, size: 0.4 },
    autocontour: false,
    contours: { coloring: 'fill', start: 20, end: 820, size: 80 },
    line: { width: 0 },
    colorscale: [
      [0, LOOK.bg],
      [0.25, '#252a5c'],
      [0.6, '#5e74d5'],
      [1, '#e8ecff'],
    ],
    colorbar: { title: { text: 'Positions<br>per cell' }, thickness: 12, len: 0.7 },
    hovertemplate:
      'x %{x:.2f}, z %{y:.2f} Bohr radii<br><b>%{z:.0f}</b> of 20,000 positions here<extra></extra>',
  };
  const points: ScatterTrace = {
    type: 'scatter',
    mode: 'markers',
    name: 'Positions',
    x: x.slice(0, SHOWN),
    y: z.slice(0, SHOWN),
    marker: { size: 2, color: '#ffffff', opacity: 0.22 },
    hoverinfo: 'skip',
  };

  const chart: Chart = createChart(chartEl, {
    data: [density, points],
    layout: {
      title: {
        text: narrow ? '' : 'Hydrogen atom: 20,000 simulated positions of its one electron',
      },
      showlegend: false,
      xaxis: {
        title: { text: 'x (Bohr radii; 1 Bohr radius = 0.053 nm)' },
        range: [-5, 5],
        constrain: 'domain',
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        title: { text: 'z (Bohr radii)' },
        range: [-5, 5],
        scaleanchor: 'x',
        constrain: 'domain',
        showgrid: false,
        zeroline: false,
      },
      shapes: [
        {
          type: 'circle',
          x0: -1,
          x1: 1,
          y0: -1,
          y1: 1,
          line: { color: LOOK.title, width: 1, dash: 'dash' },
        },
      ],
      annotations: [
        {
          x: Math.SQRT1_2,
          y: Math.SQRT1_2,
          ax: 70,
          ay: -70,
          text: 'Most likely distance from<br>the nucleus: 1 Bohr radius',
          align: 'left',
          arrowcolor: LOOK.title,
          arrowwidth: 1,
          font: { size: 11, color: LOOK.title },
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
