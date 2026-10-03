import { createChart, type Chart, type Figure, type Scatter3dTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  angleDeg,
  ATOM_COLOR,
  ATOM_NAME,
  ATOM_SIZE,
  tetrahedron,
  type Atom,
} from './atoms-mechanics.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * Ball-and-stick models of four small molecules with `scatter3d`: the atoms are lit sphere markers
 * (`marker.render: 'sphere'`, a Holochart extension) colored and sized by element, and the bonds
 * are one `lines` trace with a gap (`null`) between bonds. Positions are computed from the
 * measured bond lengths and angles: water (O–H 0.96 Å, 104.5°), carbon dioxide (straight, C=O
 * 1.16 Å, each double bond drawn as two lines), ammonia (N–H 1.01 Å, 107°) and methane (C–H
 * 1.09 Å, 109.5°). All three axes share one range and `scene.aspectmode` is `'cube'`, so an
 * ångström is the same length in every direction; the axes themselves are hidden. Hover names each atom;
 * the toolbar toggle swaps the molecule with `chart.react(…)`. Drag to turn the model.
 */
export const meta: ExampleMeta = {
  title: 'Molecules: ball-and-stick models',
  description:
    'Water, carbon dioxide, ammonia and methane as 3D ball-and-stick models built from their bond lengths and angles.',
  tags: ['demo', 'scatter3d', '3d', 'markers', 'lines', 'spheres', 'react'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

type Name = 'water' | 'co2' | 'ammonia' | 'methane';

interface Molecule {
  label: string;
  formula: string;
  atoms: Atom[];
  /** Pairs of atom indices; `order` 2 is a double bond. */
  bonds: [number, number][];
  order: 1 | 2;
  /** What the bond angle is measured between: atom indices (corner first). */
  angle: [number, number, number];
  shape: string;
  bond: string;
}

const RAD = Math.PI / 180;

function water(): Molecule {
  const d = 0.96;
  const half = (104.5 / 2) * RAD;
  return {
    label: 'Water',
    formula: 'H<sub>2</sub>O',
    atoms: [
      { kind: 'O', at: [0, 0, 0.3] },
      { kind: 'H', at: [d * Math.sin(half), 0, 0.3 - d * Math.cos(half)] },
      { kind: 'H', at: [-d * Math.sin(half), 0, 0.3 - d * Math.cos(half)] },
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
    order: 1,
    angle: [0, 1, 2],
    shape: 'bent',
    bond: 'O–H 0.96 Å',
  };
}

function co2(): Molecule {
  return {
    label: 'Carbon dioxide',
    formula: 'CO<sub>2</sub>',
    atoms: [
      { kind: 'C', at: [0, 0, 0] },
      { kind: 'O', at: [1.16, 0, 0] },
      { kind: 'O', at: [-1.16, 0, 0] },
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
    order: 2,
    angle: [0, 1, 2],
    shape: 'a straight line',
    bond: 'C=O 1.16 Å',
  };
}

function ammonia(): Molecule {
  const d = 1.01;
  // Three N–H bonds 107° apart around the vertical axis: sin² of their tilt is (1 − cos 107°) / 1.5.
  const s = Math.sqrt((1 - Math.cos(107 * RAD)) / 1.5);
  const rho = d * s;
  const drop = d * Math.sqrt(1 - s * s);
  const h = (deg: number): Atom => ({
    kind: 'H',
    at: [rho * Math.cos(deg * RAD), rho * Math.sin(deg * RAD), 0.25 - drop],
  });
  return {
    label: 'Ammonia',
    formula: 'NH<sub>3</sub>',
    atoms: [{ kind: 'N', at: [0, 0, 0.25] }, h(-90), h(30), h(150)],
    bonds: [
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    order: 1,
    angle: [0, 1, 2],
    shape: 'a low pyramid',
    bond: 'N–H 1.01 Å',
  };
}

function methane(): Molecule {
  return {
    label: 'Methane',
    formula: 'CH<sub>4</sub>',
    atoms: [
      { kind: 'C', at: [0, 0, 0] },
      ...tetrahedron(1.09).map((at): Atom => ({ kind: 'H', at })),
    ],
    bonds: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
    order: 1,
    angle: [0, 1, 2],
    shape: 'a tetrahedron',
    bond: 'C–H 1.09 Å',
  };
}

const MOLECULES: Record<Name, Molecule> = {
  water: water(),
  co2: co2(),
  ammonia: ammonia(),
  methane: methane(),
};

/** Half the gap between the two lines of a double bond, Å. */
const DOUBLE = 0.07;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const figure = (name: Name): Figure => {
    const m = MOLECULES[name];
    const [corner, a, b] = m.angle;
    const angle = angleDeg(m.atoms[corner]!.at, m.atoms[a]!.at, m.atoms[b]!.at);

    const bx: (number | null)[] = [];
    const by: (number | null)[] = [];
    const bz: (number | null)[] = [];
    for (const [i, j] of m.bonds) {
      for (const shift of m.order === 2 ? [-DOUBLE, DOUBLE] : [0]) {
        const p = m.atoms[i]!.at;
        const q = m.atoms[j]!.at;
        bx.push(p[0], q[0], null);
        by.push(p[1], q[1], null);
        bz.push(p[2] + shift, q[2] + shift, null);
      }
    }
    const bonds: Scatter3dTrace = {
      type: 'scatter3d',
      mode: 'lines',
      x: bx,
      y: by,
      z: bz,
      line: { color: LOOK.text, width: 6 },
      hoverinfo: 'skip',
      showlegend: false,
    };
    const atoms: Scatter3dTrace = {
      type: 'scatter3d',
      mode: 'markers',
      x: m.atoms.map((p) => p.at[0]),
      y: m.atoms.map((p) => p.at[1]),
      z: m.atoms.map((p) => p.at[2]),
      text: m.atoms.map((p) => `${ATOM_NAME[p.kind]} (${p.kind})`),
      marker: {
        render: 'sphere',
        color: m.atoms.map((p) => ATOM_COLOR[p.kind]),
        size: m.atoms.map((p) => ATOM_SIZE[p.kind]),
        sizemode: 'diameter',
        opacity: 1,
      },
      hovertemplate: `<b>%{text}</b><br>in ${m.label.toLowerCase()}, ${m.formula}<extra></extra>`,
      showlegend: false,
    };
    const axis = { visible: false, range: [-1.4, 1.4] };
    return {
      data: [bonds, atoms],
      layout: {
        title: {
          text: narrow
            ? ''
            : `${m.label}, ${m.formula}: ${m.shape}, bond angle ${angle.toFixed(angle === 180 ? 0 : 1)}°`,
        },
        margin: { t: narrow ? 8 : 48, l: 0, r: 0, b: 0 },
        scene: {
          aspectmode: 'cube',
          xaxis: axis,
          yaxis: axis,
          zaxis: axis,
          // Flat molecules face the viewer; the others are turned a little to show their depth.
          camera: {
            eye:
              name === 'water' || name === 'co2'
                ? { x: 0, y: -1.3, z: 0.15 }
                : { x: 0.4, y: -1.2, z: 0.3 },
          },
        },
        annotations: [
          {
            xref: 'paper',
            yref: 'paper',
            x: 0.5,
            y: 0.02,
            yanchor: 'bottom',
            showarrow: false,
            text:
              `Bond length ${m.bond} (1 Å is a ten-billionth of a metre). ` +
              'Hydrogen light grey, carbon grey, nitrogen blue, oxygen red.',
            font: { size: 11, color: LOOK.text },
          },
        ],
      },
      config: chartConfig(narrow),
    };
  };

  const chart: Chart = createChart(chartEl, figure('water'));

  segmented<Name>(
    toolbar,
    'Molecule',
    [
      { value: 'water', text: 'Water' },
      { value: 'co2', text: 'Carbon dioxide' },
      { value: 'ammonia', text: 'Ammonia' },
      { value: 'methane', text: 'Methane' },
    ],
    (value) => void chart.react(figure(value)),
    'water',
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
