import { createChart, type Chart, type Mesh3dTrace, type Scatter3dTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { angleDeg, ATOM_COLOR, ATOM_SIZE, tetrahedron } from './atoms-mechanics.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Why methane (CH₄) is a tetrahedron: the four C–H bonds push each other as far apart as they
 * can, and four directions in space are farthest apart when they point to the corners of a
 * tetrahedron, 109.5° from each other (a flat cross would only manage 90°).
 *
 * A translucent `mesh3d` with explicit triangles (`i`, `j`, `k`: the four faces, `opacity` 0.22,
 * `flatshading`) spans the four hydrogens; `scatter3d` draws the carbon and hydrogen atoms as lit
 * spheres (`marker.render: 'sphere'`), the bonds as thick lines and the edges of the tetrahedron
 * as thin ones. The C–H distance is 1.09 Å and all axes share one range, so `aspectmode: 'cube'`
 * keeps the shape true. Drag to turn it.
 */
export const meta: ExampleMeta = {
  title: 'Molecules: why methane is a tetrahedron',
  description:
    'Methane with its four hydrogens at the corners of a translucent tetrahedron, the carbon in the middle and the bonds 109.5° apart.',
  tags: ['demo', 'mesh3d', 'scatter3d', '3d', 'opacity', 'spheres'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

const TETRA = LOOK.colorway[5];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const h = tetrahedron(1.09);
  const c: [number, number, number] = [0, 0, 0];
  const angle = angleDeg(c, h[0]!, h[1]!);
  const column = (points: readonly (readonly number[] | null)[], k: number): (number | null)[] =>
    points.map((p) => (p ? (p[k] as number) : null));

  const faces: Mesh3dTrace = {
    type: 'mesh3d',
    name: 'Tetrahedron',
    x: column(h, 0) as number[],
    y: column(h, 1) as number[],
    z: column(h, 2) as number[],
    // The four faces: every choice of three corners.
    i: [0, 0, 0, 1],
    j: [1, 1, 2, 2],
    k: [2, 3, 3, 3],
    color: TETRA,
    opacity: 0.22,
    flatshading: true,
    hoverinfo: 'skip',
  };
  const edgePath: (readonly number[] | null)[] = [];
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) edgePath.push(h[a]!, h[b]!, null);
  const edges: Scatter3dTrace = {
    type: 'scatter3d',
    mode: 'lines',
    x: column(edgePath, 0),
    y: column(edgePath, 1),
    z: column(edgePath, 2),
    line: { color: TETRA, width: 2 },
    hoverinfo: 'skip',
    showlegend: false,
  };
  const bondPath = h.flatMap((p) => [c, p, null]);
  const bonds: Scatter3dTrace = {
    type: 'scatter3d',
    mode: 'lines',
    x: column(bondPath, 0),
    y: column(bondPath, 1),
    z: column(bondPath, 2),
    line: { color: LOOK.text, width: 6 },
    hoverinfo: 'skip',
    showlegend: false,
  };
  const atoms: Scatter3dTrace = {
    type: 'scatter3d',
    mode: 'markers',
    x: [c[0], ...column(h, 0)],
    y: [c[1], ...column(h, 1)],
    z: [c[2], ...column(h, 2)],
    text: ['Carbon (C), at the center', ...h.map(() => 'Hydrogen (H), at a corner')],
    marker: {
      render: 'sphere',
      color: [ATOM_COLOR.C, ...h.map(() => ATOM_COLOR.H)],
      size: [ATOM_SIZE.C, ...h.map(() => ATOM_SIZE.H)],
      sizemode: 'diameter',
      opacity: 1,
    },
    hovertemplate: '<b>%{text}</b><extra></extra>',
    showlegend: false,
  };

  const axis = { visible: false, range: [-1.2, 1.2] };
  const chart: Chart = createChart(chartEl, {
    data: [faces, edges, bonds, atoms],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Methane, CH<sub>4</sub>: four bonds, each ${angle.toFixed(1)}° from the other three`,
      },
      showlegend: false,
      margin: { t: narrow ? 8 : 48, l: 0, r: 0, b: 0 },
      scene: {
        aspectmode: 'cube',
        xaxis: axis,
        yaxis: axis,
        zaxis: axis,
        camera: { eye: { x: 1.05, y: -0.9, z: 0.4 } },
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.5,
          y: 0.02,
          yanchor: 'bottom',
          showarrow: false,
          text: 'The hydrogens sit at the corners of a tetrahedron: as far from each other as four atoms can get.',
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
