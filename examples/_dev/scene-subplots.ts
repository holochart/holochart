import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import { registerScenePoints } from '../_lib/scene-points.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Several scenes and a 2D subplot in one figure (plan E14.1a): each scene has its own viewport
 * and camera (`scene` turntable, `scene2` orbit with a tilted `up`) and sits in its `domain`
 * (here `layout.grid` cells); the cartesian subplot shares the page as usual.
 */
export const meta: ExampleMeta = {
  title: '3D scene: several scenes and a 2D subplot',
  description: 'Two 3D scenes with their own cameras in grid cells, next to a cartesian scatter.',
  tags: ['dev', 'scene', '3d', 'subplots', 'grid'],
  size: { width: 900, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  registerScenePoints();
  const random = rng(13);
  const n = 200;
  const a = Float64Array.from({ length: n }, () => random() * 2 * Math.PI);
  const b = Float64Array.from({ length: n }, () => Math.acos(2 * random() - 1));
  const chart = createChart(el, {
    data: [
      {
        type: 'scenepoints',
        x: Float64Array.from(a, (v, i) => Math.cos(v) * Math.sin(b[i]!)),
        y: Float64Array.from(a, (v, i) => Math.sin(v) * Math.sin(b[i]!)),
        z: Float64Array.from(b, (v) => Math.cos(v)),
        size: 3,
      },
      {
        type: 'scenepoints',
        scene: 'scene2',
        x: Float64Array.from(a, (v) => v),
        y: Float64Array.from(b, (v) => v),
        z: Float64Array.from(a, (v, i) => Math.sin(v) * Math.cos(b[i]! * 2)),
        size: 3,
      },
      {
        type: 'scatter',
        x: Array.from(a),
        y: Array.from(b),
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
