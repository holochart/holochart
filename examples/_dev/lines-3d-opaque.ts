import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type PerspectiveCamera,
} from 'three';
import { createRenderRoot, loadLinesMarkers3D, type Line3D } from '@mk7s/holochart-render';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Opaque 3D lines (E14.2, the depth-writing, alpha-to-coverage path) at every angle to the view:
 * contour-like rings of many short segments lying on a floor and on two walls seen at grazing
 * angles, with round joins (like surface projections on a scene's walls), fans of straight lines
 * that run into the depth, and polylines that cross each other in depth. The floor and walls are
 * drawn after the lines in the transparent pass, depth-tested without writing depth, like a
 * scene's walls. Every line should be a clean band: before the exact-depth fix, each short
 * segment's depth tilted through the plane it lies on, and the walls cut the rings into dashed
 * "arrowheads" (one per segment).
 */
export const meta: ExampleMeta = {
  title: '3D lines: opaque at grazing angles',
  description:
    'Opaque (depth-writing) 3D lines at grazing angles, crossing in depth, with round joins.',
  tags: ['dev', 'primitives', 'lines', '3d'],
  size: { width: 640, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const root = createRenderRoot(el, { background: [0.06, 0.07, 0.09, 1] });
  const viewport = root.addViewport({
    kind: '3d',
    rect: { x: 0, y: 0, width: root.size.width, height: root.size.height },
    fov: 40,
    near: 0.1,
  });
  const camera = viewport.camera as PerspectiveCamera;
  camera.position.set(0.3, 0.55, 3.6);
  camera.lookAt(0, -0.1, 0);
  camera.updateMatrixWorld();

  const lines: Line3D[] = [];
  let disposed = false;

  // Translucent floor and walls, drawn after the (opaque) lines without writing depth.
  const planes: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  const plane = (w: number, h: number, rgb: number, place: (m: Mesh) => void): void => {
    const material = new MeshBasicMaterial({
      side: DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    material.color.setHex(rgb, SRGBColorSpace);
    const mesh = new Mesh(new PlaneGeometry(w, h), material);
    place(mesh);
    mesh.renderOrder = -3;
    planes.push(mesh);
    viewport.scene.add(mesh);
  };
  plane(3.4, 3, 0x1d2230, (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set(-0.2, -0.8, -0.4);
  });
  plane(2.2, 1.8, 0x262b3a, (m) => m.position.set(-0.5, 0.1, -1.6));
  plane(2.2, 1.8, 0x262b3a, (m) => {
    m.rotation.y = Math.PI / 2;
    m.position.set(1.3, 0.1, -0.6);
  });

  const ready = loadLinesMarkers3D().then((m3d) => {
    if (disposed) return;
    const add = (data: Parameters<typeof m3d.createLine3D>[1]): void => {
      const line = m3d.createLine3D(root.context, data, { blend: 'opaque' });
      lines.push(line);
      viewport.add(line);
    };

    // Contour rings on the floor y = -0.8, seen at a grazing angle: many short segments.
    const ringColors: [number, number, number, number][] = [
      [0.99, 0.91, 0.14, 1],
      [0.37, 0.79, 0.38, 1],
      [0.13, 0.57, 0.55, 1],
      [0.23, 0.32, 0.55, 1],
    ];
    for (let r = 0; r < 4; r++) {
      const n = 90;
      const x: number[] = [];
      const y: number[] = [];
      const z: number[] = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const rad = 0.35 + 0.28 * r + 0.06 * Math.sin(5 * a);
        x.push(rad * Math.cos(a) - 0.2);
        y.push(-0.8);
        z.push(rad * Math.sin(a) - 0.4);
      }
      add({ x, y, z, width: 2 + r, color: ringColors[r]!, join: 'round', cap: 'round' });
    }

    // Rings on a back wall z = -1.6 and a side wall x = 1.3 (walls seen edge-on).
    for (let r = 0; r < 3; r++) {
      const n = 60;
      const bx: number[] = [];
      const by: number[] = [];
      const bz: number[] = [];
      const sx: number[] = [];
      const sy: number[] = [];
      const sz: number[] = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const rad = 0.2 + 0.18 * r;
        bx.push(rad * Math.cos(a) - 0.5);
        by.push(rad * Math.sin(a) + 0.2);
        bz.push(-1.6);
        sx.push(1.3);
        sy.push(rad * Math.sin(a) + 0.1);
        sz.push(rad * Math.cos(a) - 0.6);
      }
      add({ x: bx, y: by, z: bz, width: 2, color: [0.9, 0.5, 0.2, 1], join: 'round' });
      add({ x: sx, y: sy, z: sz, width: 3, color: [0.4, 0.7, 1, 1], join: 'round', cap: 'round' });
    }

    // A fan of straight lines running into the depth, from near the camera to far away.
    for (let k = 0; k < 9; k++) {
      const a = -0.8 + (k / 8) * 1.6;
      add({
        x: [0.9 + 0.1 * a, 0.2 + 0.6 * a],
        y: [-0.5 + 0.15 * k, 0.9 - 0.1 * k],
        z: [2.2, -2.5],
        width: 1 + (k % 4),
        color: [0.85, 0.3 + 0.07 * k, 0.35, 1],
        cap: k % 2 ? 'round' : 'butt',
      });
    }

    // Zigzags crossing each other in depth, with miter and bevel joins.
    for (let k = 0; k < 3; k++) {
      const x: number[] = [];
      const y: number[] = [];
      const z: number[] = [];
      for (let i = 0; i < 12; i++) {
        x.push(-1.3 + i * 0.2);
        y.push(0.15 * k + (i % 2 ? 0.25 : -0.25));
        z.push((k - 1) * 0.5 + (i % 3) * 0.4 - 0.4);
      }
      add({
        x,
        y,
        z,
        width: 4,
        color: [0.95, 0.95, 0.95 - 0.3 * k, 1],
        join: k === 1 ? 'bevel' : 'miter',
      });
    }
    root.renderNow();
  });

  return {
    renderer: root.renderer,
    ready,
    dispose() {
      disposed = true;
      for (const line of lines) line.dispose();
      for (const m of planes) {
        m.geometry.dispose();
        m.material.dispose();
      }
      root.destroy();
    },
  };
}
