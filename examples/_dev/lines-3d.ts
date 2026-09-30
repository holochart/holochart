import { Vector3, type PerspectiveCamera } from 'three';
import {
  createPicker,
  createRenderRoot,
  loadLinesMarkers3D,
  type Line3D,
} from '@mk7s/holochart-render';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3D line primitive (E14.2, render part) in a perspective viewport: screen-space widths, joins,
 * caps and dashes at every depth, per-vertex colors, NaN gaps, depth testing between lines, a
 * translucent line, and a dashed line that runs past the camera (clipped at the near plane before
 * the perspective divide, so it leaves the frame cleanly instead of exploding). A GPU pick at a
 * fixed point is shown in the corner (the pick id is the nearer vertex of the segment).
 */
export const meta: ExampleMeta = {
  title: '3D lines: joins, dashes, near plane',
  description:
    'Screen-space 3D polylines: per-vertex colors, joins, dashes, gaps, depth and near-plane clipping.',
  tags: ['dev', 'primitives', 'lines', '3d'],
  size: { width: 640, height: 400 },
};

const VIRIDIS = [
  [0.267, 0.005, 0.329],
  [0.229, 0.322, 0.546],
  [0.128, 0.567, 0.551],
  [0.369, 0.789, 0.383],
  [0.993, 0.906, 0.144],
] as const;

function viridis(t: number): [number, number, number] {
  const x = Math.min(0.9999, Math.max(0, t)) * (VIRIDIS.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = VIRIDIS[i]!;
  const b = VIRIDIS[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Place a camera on a sphere around the origin. */
function orbit(camera: PerspectiveCamera, azimuth: number, elevation: number, distance: number) {
  camera.position.set(
    distance * Math.cos(elevation) * Math.sin(azimuth),
    distance * Math.sin(elevation),
    distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
}

/** The 12 edges of the cube [-1, 1]³ as one polyline stream with NaN gaps. */
function cubeEdges(): { x: number[]; y: number[]; z: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const push = (a: number[], b: number[]) => {
    x.push(a[0]!, b[0]!, NaN);
    y.push(a[1]!, b[1]!, NaN);
    z.push(a[2]!, b[2]!, NaN);
  };
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      push([-1, s, t], [1, s, t]);
      push([s, -1, t], [s, 1, t]);
      push([s, t, -1], [s, t, 1]);
    }
  }
  return { x, y, z };
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const root = createRenderRoot(el, { background: [1, 1, 1, 1] });
  const viewport = root.addViewport({
    kind: '3d',
    rect: { x: 0, y: 0, width: root.size.width, height: root.size.height },
    fov: 45,
    near: 0.3,
  });
  const camera = viewport.camera as PerspectiveCamera;
  const azimuth = 0.6;
  const elevation = 0.35;
  const distance = 4.4;
  orbit(camera, azimuth, elevation, distance);

  const readout = document.createElement('div');
  readout.style.cssText =
    'position:absolute;right:8px;bottom:8px;padding:2px 6px;font:12px/1.4 monospace;' +
    'background:rgba(255,255,255,.9);color:#223';
  el.appendChild(readout);

  const lines: Line3D[] = [];
  let disposed = false;
  const picker = createPicker(root);

  const ready = loadLinesMarkers3D().then(async (m3d) => {
    if (disposed) return;
    const add = (line: Line3D): Line3D => {
      lines.push(line);
      viewport.add(line);
      return line;
    };

    // Cube wireframe: thin gray lines, NaN gaps between edges.
    add(m3d.createLine3D(root.context, { ...cubeEdges(), width: 1, color: [0.6, 0.63, 0.7, 1] }));

    // Helix with per-vertex colors (a colorscale mapped on the CPU), round joins and caps.
    const n = 160;
    const hx = new Float64Array(n);
    const hy = new Float64Array(n);
    const hz = new Float64Array(n);
    const colors = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      hx[i] = 0.75 * Math.cos(t * Math.PI * 6);
      hz[i] = 0.75 * Math.sin(t * Math.PI * 6);
      hy[i] = -0.9 + 1.8 * t;
      const [r, g, b] = viridis(t);
      colors.set([r, g, b, 1], i * 4);
    }
    const helix = add(
      m3d.createLine3D(root.context, {
        x: hx,
        y: hy,
        z: hz,
        color: colors,
        width: 7,
        join: 'round',
        cap: 'round',
      }),
    );
    picker.add(viewport, helix, { traceIndex: 0 });

    // A dashed zigzag with miter joins straight through the helix (depth crossings).
    add(
      m3d.createLine3D(root.context, {
        x: [-1.2, -0.6, 0, 0.6, 1.2],
        y: [-0.3, 0.4, -0.3, 0.4, -0.3],
        z: [0.2, -0.1, 0.2, -0.1, 0.2],
        width: 4,
        dash: 'dash',
        join: 'miter',
        color: [0.85, 0.2, 0.15, 1],
      }),
    );

    // Translucent thick line (blends, no depth write) behind the helix's front half.
    add(
      m3d.createLine3D(root.context, {
        x: [-1, 1],
        y: [0.75, -0.75],
        z: [-0.5, -0.5],
        width: 12,
        cap: 'square',
        color: [0.1, 0.45, 0.9, 0.45],
      }),
    );

    // Dash-dot line from the far corner past the camera: cut at the near plane.
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    add(
      m3d.createLine3D(root.context, {
        x: [1, cx * 1.6 + 0.35, cx * 2.5],
        y: [-1, cy * 1.6 - 0.25, cy * 2.5],
        z: [-1, cz * 1.6, cz * 2.5],
        width: 3,
        dash: 'dashdot',
        color: [0.95, 0.55, 0.05, 1],
      }),
    );

    for (const line of lines) line.syncCamera(camera);
    root.renderNow();
    // Pick just past helix vertex 40 towards 41: the id is the nearer vertex, 40.
    const at = new Vector3(
      hx[40]! * 0.8 + hx[41]! * 0.2,
      hy[40]! * 0.8 + hy[41]! * 0.2,
      hz[40]! * 0.8 + hz[41]! * 0.2,
    ).project(camera);
    const px = ((at.x + 1) / 2) * root.size.width;
    const py = ((1 - at.y) / 2) * root.size.height;
    const hit = (await picker.pick(px, py, { radius: 1 }))[0];
    readout.textContent = hit ? `pick: helix point ${hit.pointIndex}` : 'pick: none';
  });

  return {
    renderer: root.renderer,
    ready,
    dispose() {
      disposed = true;
      picker.dispose();
      for (const line of lines) line.dispose();
      readout.remove();
      root.destroy();
    },
  };
}
