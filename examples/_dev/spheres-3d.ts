import { Vector3, type OrthographicCamera, type PerspectiveCamera } from 'three';
import {
  createPicker,
  createRenderRoot,
  loadLinesMarkers3D,
  type Colorscale,
  type Line3D,
  type Markers3D,
  type SphereSet,
} from '@mk7s/holochart-render';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Instanced lit spheres (E14.2 `marker.render: 'sphere'`, render part). Left, perspective: a 5³
 * grid of px-sized spheres colored through a colorscale, a row of world-sized spheres (they shrink
 * with distance), a translucent depth-sorted row, sprites and a line passing *through* spheres
 * (gl_FragDepth from the ray hit: the line disappears inside them). Right, the same grid through an
 * orthographic camera. A GPU pick at a fixed point reports the sphere's data index.
 */
export const meta: ExampleMeta = {
  title: '3D spheres: lit impostors',
  description:
    'Ray-cast sphere impostors: px and world sizing, colorscale, translucency, intersections with lines and sprites, perspective and orthographic.',
  tags: ['dev', 'primitives', 'markers', '3d'],
  size: { width: 640, height: 400 },
};

const PLASMA: Colorscale = [
  [0, [0.05, 0.03, 0.53, 1]],
  [0.5, [0.8, 0.28, 0.47, 1]],
  [1, [0.94, 0.98, 0.13, 1]],
];

function place(
  camera: PerspectiveCamera | OrthographicCamera,
  azimuth: number,
  elevation: number,
  d = 4.6,
) {
  camera.position.set(
    d * Math.cos(elevation) * Math.sin(azimuth),
    d * Math.sin(elevation),
    d * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
}

function grid(): { x: Float64Array; y: Float64Array; z: Float64Array } {
  const n = 5;
  const x = new Float64Array(n ** 3);
  const y = new Float64Array(n ** 3);
  const z = new Float64Array(n ** 3);
  let i = 0;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      for (let c = 0; c < n; c++) {
        x[i] = -0.8 + (1.6 * a) / (n - 1);
        y[i] = -0.8 + (1.6 * b) / (n - 1);
        z[i] = -0.8 + (1.6 * c) / (n - 1);
        i++;
      }
    }
  }
  return { x, y, z };
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const root = createRenderRoot(el, { background: [1, 1, 1, 1] });
  const { width, height } = root.size;
  const left = root.addViewport({
    kind: '3d',
    rect: { x: 0, y: 0, width: Math.round(width * 0.6), height },
    fov: 40,
  });
  const right = root.addViewport({
    kind: '3d',
    projection: 'orthographic',
    orthoHalfHeight: 1.6,
    rect: { x: Math.round(width * 0.6), y: 0, width: width - Math.round(width * 0.6), height },
    background: [0.95, 0.96, 0.98, 1],
  });
  place(left.camera, 0.55, 0.3, 5.4);
  place(right.camera, -0.5, 0.5);

  const readout = document.createElement('div');
  readout.style.cssText =
    'position:absolute;left:8px;bottom:8px;padding:2px 6px;font:12px/1.4 monospace;' +
    'background:rgba(255,255,255,.9);color:#223';
  el.appendChild(readout);

  const owned: (Line3D | Markers3D | SphereSet)[] = [];
  let disposed = false;
  const picker = createPicker(root);

  const ready = loadLinesMarkers3D().then(async (m3d) => {
    if (disposed) return;
    const g = grid();
    // px-sized spheres through a colorscale (both views: one set per viewport).
    for (const view of [left, right]) {
      const spheres = m3d.createSpheres(root.context, {
        ...g,
        size: 22,
        colorValues: g.y,
        colorscale: PLASMA,
        cmin: -0.8,
        cmax: 0.8,
      });
      owned.push(spheres);
      view.add(spheres);
      if (view === left) picker.add(left, spheres, { traceIndex: 0 });
    }

    // World-sized spheres (diameter 0.3 scene units): smaller when farther away.
    const world = m3d.createSpheres(
      root.context,
      {
        x: [-1.2, -0.6, 0, 0.6, 1.2],
        y: [1.1, 1.1, 1.1, 1.1, 1.1],
        z: [-1.2, -0.6, 0, 0.6, 1.2],
        size: 0.22,
        color: [0.2, 0.62, 0.35, 1],
      },
      { sizing: 'world' },
    );
    owned.push(world);
    left.add(world);

    // Translucent spheres, sorted back to front, in front of the grid.
    const glass = m3d.createSpheres(
      root.context,
      {
        x: [-0.9, -0.45, 0, 0.45, 0.9],
        y: [-1.05, -1.05, -1.05, -1.05, -1.05],
        z: [1.1, 0.9, 0.7, 0.5, 0.3],
        size: 34,
        color: [0.25, 0.55, 0.95, 0.45],
      },
      { depthSort: true },
    );
    owned.push(glass);
    left.add(glass);
    picker.add(left, glass, { traceIndex: 1 });

    // A line through the middle row of spheres, and sprites half inside spheres.
    const line = m3d.createLine3D(root.context, {
      x: [-1.3, 1.3],
      y: [0, 0],
      z: [0, 0],
      width: 5,
      color: [0.1, 0.1, 0.1, 1],
    });
    owned.push(line);
    left.add(line);
    const sprites = m3d.createMarkers3D(root.context, {
      x: [-0.8, 0, 0.8],
      y: [0.8, 0.8, 0.8],
      z: [0.84, 0.84, 0.84],
      symbol: 'diamond',
      size: 24,
      color: [0.1, 0.75, 0.3, 1],
      lineWidth: 1.5,
      lineColor: [1, 1, 1, 1],
    });
    owned.push(sprites);
    left.add(sprites);

    // The orthographic view gets a line and sprites through its grid too (w = 1 clip space).
    const orthoLine = m3d.createLine3D(root.context, {
      x: [0, 0],
      y: [-1.3, 1.3],
      z: [0, 0],
      width: 5,
      color: [0.1, 0.1, 0.1, 1],
      dash: 'dash',
    });
    const orthoSprites = m3d.createMarkers3D(root.context, {
      x: [-0.8, 0.8],
      y: [0, 0],
      z: [0.8, 0.8],
      symbol: 'square-open',
      size: 26,
      lineWidth: 2,
      color: [0.1, 0.5, 0.9, 1],
    });
    owned.push(orthoLine, orthoSprites);
    right.add(orthoLine);
    right.add(orthoSprites);
    orthoLine.syncCamera(right.camera);

    root.renderNow();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    root.renderNow();
    // Pick at the grid's front-middle sphere (a = 2, b = 2, c = 4: data index 64).
    const at = new Vector3(g.x[64]!, g.y[64]!, g.z[64]!).project(left.camera);
    const px = ((at.x + 1) / 2) * left.rect.width;
    const py = ((1 - at.y) / 2) * left.rect.height;
    const hit = (await picker.pick(px, py, { radius: 2 }))[0];
    // And at the nearest translucent (depth-sorted) sphere, data index 0.
    const g0 = new Vector3(-0.9, -1.05, 1.1).project(left.camera);
    const glassHit = (
      await picker.pick(((g0.x + 1) / 2) * left.rect.width, ((1 - g0.y) / 2) * left.rect.height)
    )[0];
    readout.textContent =
      `pick: sphere ${hit ? hit.pointIndex : '–'}` +
      ` · glass ${glassHit?.traceIndex === 1 ? glassHit.pointIndex : '–'}`;
  });

  return {
    renderer: root.renderer,
    ready,
    dispose() {
      disposed = true;
      picker.dispose();
      for (const p of owned) p.dispose();
      readout.remove();
      root.destroy();
    },
  };
}
