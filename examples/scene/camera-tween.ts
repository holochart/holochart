import {
  createChart,
  interpolateCamera,
  type Scatter3dTrace,
  type SceneCamera,
} from '@mk7s/holochart';
import { createReadout, expectValue } from '../_lib/readout.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The path of a camera animation (plan E7.5), frozen: the first, middle and last frame of a flight
 * from a view like Plotly's default to the opposite side, each in its own scene around the same
 * `scatter3d` spiral. The camera orbits about the z axis at the same height and distance (the
 * middle frame looks along the y axis), instead of flying over the top as a straight or
 * great-circle path would. `chart.animateCamera` and camera transitions follow this path
 * (`interpolateCamera`, used here to compute the middle frame).
 */
export const meta: ExampleMeta = {
  title: '3D scene: camera animation path',
  description:
    'Start, middle and end of a camera animation between opposite views: it orbits around the z axis rather than over the top.',
  tags: ['scene', '3d', 'camera', 'animation', 'scatter3d'],
  size: { width: 720, height: 320 },
  testTolerance: 0.004,
};

const vec = (v: readonly number[]) => ({ x: v[0], y: v[1], z: v[2] });

export function run(el: HTMLElement): ExampleHandle {
  const from: SceneCamera = { eye: [1.7, 1.7, 1.2], center: [0, 0, 0], up: [0, 0, 1] };
  const to: SceneCamera = { eye: [-1.7, -1.7, 1.2], center: [0, 0, 0], up: [0, 0, 1] };
  const t = Array.from({ length: 80 }, (_, i) => (i / 80) * 4 * Math.PI);
  const spiral = (scene: Scatter3dTrace['scene']): Scatter3dTrace => ({
    type: 'scatter3d',
    mode: 'lines+markers',
    scene,
    x: t.map((v) => Math.cos(v) * (1 + v / 12)),
    y: t.map((v) => Math.sin(v) * (1 + v / 12)),
    z: t.map((v) => v / 6),
    marker: { size: 4, color: '#5e74d5' },
    line: { width: 2, color: '#5e74d5' },
  });
  const scene = (i: number, camera: SceneCamera) => ({
    domain: { x: [i / 3, (i + 1) / 3] },
    camera: { eye: vec(camera.eye), center: vec(camera.center), up: vec(camera.up) },
  });
  const mid = interpolateCamera(from, to, 0.5);
  const chart = createChart(el, {
    data: [spiral('scene'), spiral('scene2'), spiral('scene3')],
    layout: {
      margin: { l: 0, r: 0, t: 30, b: 0 },
      title: { text: 'Start, middle and end of a camera flight' },
      showlegend: false,
      scene: scene(0, from),
      scene2: scene(1, mid),
      scene3: scene(2, to),
    },
  });
  // The middle frame keeps the eye's height: printed in the sandbox, checked in the visual test.
  const readout = createReadout(el);
  const height = Math.round(mid.eye[2] * 1000) / 1000;
  readout.textContent = `middle eye z = ${height}`;
  return {
    ready: chart.ready.then(() => expectValue('middle eye height', height, 1.2)),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
