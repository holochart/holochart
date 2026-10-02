import {
  createChart,
  type Chart,
  type Scatter3dTrace,
  type StreamtubeTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Magnetic field lines of a bar magnet. Seen from outside, a small magnet is a dipole: with the
 * magnet at the origin pointing along z, `B ∝ (3(m·r̂)r̂ − m) / r³` on a 25³ grid (only the direction matters for
 * the lines; the vectors' length is the cube root of the strength, and zero inside the magnet). `streamtube` follows the field from two
 * rings of starting points just above the north pole (`starts`), so each tube leaves the north
 * pole, loops round and comes back in at the south pole, colored by the field strength relative to
 * that at the poles. The magnet is two thick `scatter3d` line segments, red for north and blue for south.
 * Distances are in magnet lengths.
 */
export const meta: ExampleMeta = {
  title: 'Magnetism: field lines of a bar magnet',
  description:
    'Stream tubes following the dipole field of a bar magnet from its north pole round to its south pole.',
  tags: ['demo', 'streamtube', 'scatter3d', '3d', 'vector field', 'physics'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

/** Distance from the magnet's center at which the field strength counts as 100%. */
const POLE = 0.6;
/** Inside this distance the field is set to zero, so the tubes end inside the magnet. */
const CORE = 0.45;

/**
 * The dipole field at a point: its true direction, with a length of the cube root of the strength
 * relative to that at `POLE` on the axis (at most 1). The strength falls with the cube of the
 * distance; the cube root keeps the far field from fading to nothing, and the tubes follow the
 * same lines whatever the length.
 */
function dipole(x: number, y: number, z: number): [number, number, number] {
  const r = Math.hypot(x, y, z);
  if (r < CORE) return [0, 0, 0];
  const c = z / r; // m·r̂ for m along z
  const b = [(3 * c * x) / r, (3 * c * y) / r, 3 * c * c - 1] as const;
  const norm = Math.hypot(...b);
  const relative = Math.min(1, ((norm / 2) * (POLE / r) ** 3) ** (1 / 3));
  return [(b[0] / norm) * relative, (b[1] / norm) * relative, (b[2] / norm) * relative];
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const grid = { x: [] as number[], y: [] as number[], z: [] as number[] };
  const field = { u: [] as number[], v: [] as number[], w: [] as number[] };
  const nodes = linspace(-3, 3, 25);
  for (const z of nodes) {
    for (const y of nodes) {
      for (const x of nodes) {
        const [u, v, w] = dipole(x, y, z);
        grid.x.push(x);
        grid.y.push(y);
        grid.z.push(z);
        field.u.push(u);
        field.v.push(v);
        field.w.push(w);
      }
    }
  }

  // Two rings of starting points just above the north pole.
  const starts = { x: [] as number[], y: [] as number[], z: [] as number[] };
  for (const [radius, count, turn] of [
    [0.42, 8, 0],
    [0.62, 8, 0.5],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const a = (2 * Math.PI * (i + turn)) / count;
      // Rounded: the tube radius scales with the smallest gap between start coordinates.
      starts.x.push(Math.round(radius * Math.cos(a) * 100) / 100);
      starts.y.push(Math.round(radius * Math.sin(a) * 100) / 100);
      starts.z.push(0.62);
    }
  }

  const tubes: StreamtubeTrace = {
    type: 'streamtube',
    name: 'Field lines',
    ...grid,
    ...field,
    starts,
    sizeref: 7,
    cmin: 0.2,
    cmax: 1,
    colorscale: [
      [0, '#3b4bb0'],
      [0.4, '#12a38a'],
      [1, '#ffe08a'],
    ],
    colorbar: {
      title: { text: 'Field strength (100% = at the poles)', side: 'right' },
      // The tube color follows the cube root of the strength.
      tickvals: [0.01 ** (1 / 3), 0.03 ** (1 / 3), 0.1 ** (1 / 3), 0.3 ** (1 / 3), 1],
      ticktext: ['1%', '3%', '10%', '30%', '100%'],
      thickness: 12,
      len: 0.7,
    },
    hovertemplate: 'Field line at x %{x:.1f}, y %{y:.1f}, z %{z:.1f}<extra></extra>',
  };
  const pole = (name: string, z0: number, z1: number, color: string): Scatter3dTrace => ({
    type: 'scatter3d',
    mode: 'lines+text',
    name,
    x: [0, 0],
    y: [0, 0],
    z: [z0, z1],
    text: ['', name === 'North pole' ? 'N' : 'S'],
    textposition: name === 'North pole' ? 'top center' : 'bottom center',
    textfont: { color: LOOK.title, size: 13 },
    line: { color, width: 16 },
    hovertemplate: `${name}<extra></extra>`,
    showlegend: false,
  });

  const chart: Chart = createChart(chartEl, {
    data: [tubes, pole('North pole', 0, 0.5, '#ea2a37'), pole('South pole', 0, -0.5, '#5e74d5')],
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Field lines of a bar magnet: out at the north pole, back in at the south',
      },
      margin: { l: 0, r: 0, t: 48, b: 0 },
      scene: {
        aspectmode: 'cube',
        camera: { eye: { x: 1.5, y: -1.5, z: 0.55 } },
        xaxis: { title: { text: 'x' }, range: [-2.6, 2.6] },
        yaxis: { title: { text: 'y' }, range: [-2.6, 2.6] },
        zaxis: { title: { text: 'z' }, range: [-2.6, 2.6] },
      },
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
