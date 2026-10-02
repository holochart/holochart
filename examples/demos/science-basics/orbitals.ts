import { createChart, type Chart, type Figure, type IsosurfaceTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * Shapes of three hydrogen orbitals as `isosurface` traces. An orbital is a map of where the
 * electron is likely to be: the probability density |ψ|² is computed on a 61 × 61 × 61 grid from
 * the textbook formulas (not normalised, r in Bohr radii, 1 a₀ = 0.053 nm): 1s ∝ e^(−2r), a ball;
 * 2p_z ∝ z² e^(−r), a dumbbell; 3d_z² ∝ (3z² − r²)² e^(−2r/3), a dumbbell with a ring. One
 * iso-level is drawn (`isomin` = `isomax`, `surface.count: 1`, caps off): the level is chosen by
 * sorting the grid values so that the surface encloses 90% of the density, that is, the electron
 * is found inside it 90% of the time. A one-color `colorscale`, no color bar. The toolbar toggle
 * swaps the orbital with `chart.react(…)`; the axes rescale, as the orbitals differ a lot in size.
 */
export const meta: ExampleMeta = {
  title: 'Atoms: shapes of hydrogen orbitals',
  description:
    'The 1s, 2p and 3d orbitals of hydrogen as surfaces that enclose 90% of the electron density, computed on a 3D grid.',
  tags: ['demo', 'isosurface', '3d', 'scientific', 'react'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

type Orbital = '1s' | '2p' | '3d';

interface Spec {
  label: string;
  shape: string;
  /** Half-width of the grid, Bohr radii. */
  half: number;
  color: string;
  density: (x: number, y: number, z: number) => number;
}

const SPECS: Record<Orbital, Spec> = {
  '1s': {
    label: '1s',
    shape: 'a ball',
    half: 5,
    color: LOOK.colorway[1],
    density: (x, y, z) => Math.exp(-2 * Math.hypot(x, y, z)),
  },
  '2p': {
    label: '2p',
    shape: 'a dumbbell',
    half: 12,
    color: LOOK.colorway[5],
    density: (x, y, z) => z * z * Math.exp(-Math.hypot(x, y, z)),
  },
  '3d': {
    label: '3d',
    shape: 'a dumbbell with a ring',
    half: 26,
    color: LOOK.colorway[2],
    density: (x, y, z) => {
      const r = Math.hypot(x, y, z);
      return (3 * z * z - r * r) ** 2 * Math.exp((-2 * r) / 3);
    },
  },
};

const N = 61;
/** Share of the density inside the drawn surface. */
const INSIDE = 0.9;

interface Grid {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  value: Float32Array;
  level: number;
}

/** The density on the grid (x fastest) and the iso-level that encloses `INSIDE` of it. */
function grid(spec: Spec): Grid {
  const a = linspace(-spec.half, spec.half, N);
  const n = N ** 3;
  const out = {
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    value: new Float32Array(n),
  };
  let o = 0;
  for (const z of a) {
    for (const y of a) {
      for (const x of a) {
        out.x[o] = x;
        out.y[o] = y;
        out.z[o] = z;
        out.value[o++] = spec.density(x, y, z);
      }
    }
  }
  // Densest cells first: add them up until they hold 90% of the total.
  const sorted = Float32Array.from(out.value).sort().reverse();
  const total = sorted.reduce((s, v) => s + v, 0);
  let sum = 0;
  let level = 0;
  for (const v of sorted) {
    sum += v;
    level = v;
    if (sum >= INSIDE * total) break;
  }
  return { ...out, level };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const grids = new Map<Orbital, Grid>();

  const figure = (orbital: Orbital): Figure => {
    const spec = SPECS[orbital];
    let g = grids.get(orbital);
    if (!g) grids.set(orbital, (g = grid(spec)));
    const trace: IsosurfaceTrace = {
      type: 'isosurface',
      name: `${spec.label} orbital`,
      x: g.x,
      y: g.y,
      z: g.z,
      value: g.value,
      isomin: g.level,
      isomax: g.level,
      surface: { count: 1 },
      caps: { x: { show: false }, y: { show: false }, z: { show: false } },
      colorscale: [
        [0, spec.color],
        [1, spec.color],
      ],
      showscale: false,
      hovertemplate:
        `${spec.label} orbital<br>x %{x:.1f}, y %{y:.1f}, z %{z:.1f} Bohr radii` +
        '<br>the electron is inside this surface 90% of the time<extra></extra>',
    };
    const axis = (letter: string): Record<string, unknown> => ({
      title: { text: `${letter} (Bohr radii)` },
      range: [-spec.half, spec.half],
    });
    return {
      data: [trace],
      layout: {
        title: {
          text: narrow
            ? ''
            : `The ${spec.label} orbital, ${spec.shape}: where the electron is most likely to be found`,
        },
        margin: { t: narrow ? 8 : 48, l: 0, r: 0, b: 0 },
        scene: {
          aspectmode: 'cube',
          xaxis: axis('x'),
          yaxis: axis('y'),
          zaxis: axis('z'),
          camera: { eye: { x: 1.55, y: -1.55, z: 0.75 }, center: { x: 0, y: 0, z: -0.08 } },
        },
      },
      config: chartConfig(narrow),
    };
  };

  const chart: Chart = createChart(chartEl, figure('2p'));

  segmented<Orbital>(
    toolbar,
    'Orbital',
    [
      { value: '1s', text: '1s' },
      { value: '2p', text: '2p' },
      { value: '3d', text: '3d (z²)' },
    ],
    (value) => void chart.react(figure(value)),
    '2p',
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
