import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import { linspace, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Several scenes and a 2D subplot in one figure (plan E14.1a): each scene has its own viewport
 * and camera (`scene` turntable, `scene2` orbit with a tilted `up`) and sits in its `domain`
 * (here `layout.grid` cells); the cartesian subplot shares the page as usual. Left, `scatter3d`
 * points on a sphere; middle, the `surface` `sin(a) · cos(2b)` over the same angles; right, the
 * points' angles as a 2D `scatter`.
 */
export const meta: ExampleMeta = {
  title: '3D scene: several scenes and a 2D subplot',
  description: 'Two 3D scenes with their own cameras in grid cells, next to a cartesian scatter.',
  tags: ['scene', '3d', 'subplots', 'grid', 'scatter3d', 'surface'],
  size: { width: 900, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(13);
  const n = 200;
  const a = Array.from({ length: n }, () => random() * 2 * Math.PI);
  const b = Array.from({ length: n }, () => Math.acos(2 * random() - 1));
  const ga = linspace(0, 2 * Math.PI, 40);
  const gb = linspace(0, Math.PI, 30);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        x: a.map((v, i) => Math.cos(v) * Math.sin(b[i]!)),
        y: a.map((v, i) => Math.sin(v) * Math.sin(b[i]!)),
        z: b.map((v) => Math.cos(v)),
        marker: { size: 3 },
      },
      {
        type: 'surface',
        scene: 'scene2',
        x: ga,
        y: gb,
        z: sample(ga, gb, (u, v) => Math.sin(u) * Math.cos(v * 2)),
        showscale: false,
      },
      {
        type: 'scatter',
        x: a,
        y: b,
        mode: 'markers',
        xaxis: 'x',
        yaxis: 'y',
      },
    ],
    layout: {
      title: { text: 'Two scenes and a 2D subplot' },
      showlegend: false,
      grid: { rows: 1, columns: 3, pattern: 'independent' },
      scene: { domain: { row: 0, column: 0 } },
      scene2: {
        domain: { row: 0, column: 1 },
        camera: { up: { x: 0.3, y: 0, z: 1 }, eye: { x: 2.4, y: 0.8, z: 0.7 } },
      },
      xaxis: { domain: [0.72, 1], title: { text: 'angle a' } },
      yaxis: { title: { text: 'angle b' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
