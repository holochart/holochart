import {
  AmbientLight,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import { createLatestQueue } from '@mk7s/holochart';
import {
  createMarkers,
  createPicker,
  createRenderRoot,
  type Colorscale,
  type PickResult,
} from '@mk7s/holochart-render';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * GPU ID picking in a 3D viewport (E2.13, ADR-010): 50k instanced markers and a surface mesh.
 * Hovering renders only a small window of pick ids around the cursor and reads it back
 * asynchronously; the hit marker gets a ring, a hit on the surface tints it and rings the picked
 * vertex. Markers below the surface are occluded for picking exactly as they are on screen.
 * Drag to orbit. The visual test captures the initial frame (no hover).
 *
 * Picks go through the runtime's latest-wins queue (E2.17): one pick in flight, the newest pointer
 * position waiting, and every finished pick shown, so the readout keeps up while the pointer moves
 * instead of freezing until it stops.
 */
export const meta: ExampleMeta = {
  title: 'GPU picking (3D)',
  description:
    '50k instanced markers plus a surface mesh in a perspective viewport; hover to pick.',
  tags: ['dev', 'picking', '3d', 'markers'],
  size: { width: 640, height: 400 },
};

const COUNT = 50_000;
const GRID = 64;
const MAGMA: Colorscale = [
  [0, [0.02, 0.02, 0.1, 1]],
  [0.35, [0.45, 0.12, 0.51, 1]],
  [0.7, [0.93, 0.35, 0.37, 1]],
  [1, [0.99, 0.87, 0.55, 1]],
];
const SURFACE_COLOR = 0x8fb8de;
const SURFACE_HOVER = 0xf2b441;

/** Height of the surface at (x, z). */
function surface(x: number, z: number): number {
  return 0.28 * Math.sin(2.6 * x) * Math.cos(2.2 * z) - 0.1;
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const root = createRenderRoot(el, { background: [0.96, 0.97, 0.98, 1] });
  const viewport = root.addViewport({
    kind: '3d',
    rect: { x: 0, y: 0, width: root.size.width, height: root.size.height },
    fov: 40,
  });
  const offResize = root.on('resize', (size) =>
    viewport.setRect({ x: 0, y: 0, width: size.width, height: size.height }),
  );

  // Surface mesh (indexed grid): picked per vertex.
  const geometry = new PlaneGeometry(2.4, 2.4, GRID, GRID);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, surface(pos.getX(i), pos.getZ(i)));
  geometry.computeVertexNormals();
  const material = new MeshLambertMaterial({ color: SURFACE_COLOR, side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'surface';
  viewport.scene.add(mesh);
  viewport.scene.add(new AmbientLight(0xffffff, 1.1));
  const sun = new DirectionalLight(0xffffff, 1.8);
  sun.position.set(2, 4, 3);
  viewport.scene.add(sun);

  // 50k markers: three gaussian clusters and a helix, spread above and below the surface.
  const random = rng(11);
  const normal = gaussian(random);
  const x = new Float64Array(COUNT);
  const y = new Float64Array(COUNT);
  const z = new Float64Array(COUNT);
  const centres = [
    [-0.6, 0.35, -0.3],
    [0.55, 0.15, 0.4],
    [0.1, -0.35, -0.1],
  ] as const;
  for (let i = 0; i < COUNT; i++) {
    if (i % 5 === 0) {
      const t = (i / COUNT) * Math.PI * 10;
      x[i] = Math.cos(t) * 0.95 + normal() * 0.02;
      z[i] = Math.sin(t) * 0.95 + normal() * 0.02;
      y[i] = (i / COUNT) * 1.2 - 0.6;
    } else {
      const c = centres[i % 3]!;
      x[i] = c[0] + normal() * 0.18;
      y[i] = c[1] + normal() * 0.12;
      z[i] = c[2] + normal() * 0.18;
    }
  }
  const markers = createMarkers(root.context, {
    x,
    y,
    z,
    origin: [0, 0, 0],
    colorValues: y,
    colorscale: MAGMA,
    cmin: -0.7,
    cmax: 0.7,
    size: 4,
    symbol: 'circle',
  });
  viewport.add(markers);

  // Hover ring: one open marker drawn on top of everything.
  const ring = createMarkers(
    root.context,
    {
      x: [NaN],
      y: [NaN],
      z: [NaN],
      origin: [0, 0, 0],
      size: 16,
      symbol: 'circle-open',
      color: [0.9, 0.1, 0.2, 1],
      lineWidth: 2.5,
    },
    { depthTest: false, renderOrder: 10 },
  );
  viewport.add(ring);

  // Camera orbit (drag).
  let azimuth = 0.75;
  let elevation = 0.5;
  const distance = 4.2;
  const placeCamera = (): void => {
    const c = viewport.camera;
    c.position.set(
      distance * Math.cos(elevation) * Math.sin(azimuth),
      distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld();
    root.invalidate();
  };
  placeCamera();

  // Picking + readout.
  const picker = createPicker(root);
  picker.add(viewport, markers, { traceIndex: 0 });
  picker.add(viewport, mesh, { traceIndex: 1, element: 'vertex' });

  const readout = document.createElement('div');
  readout.className = 'pick-readout';
  readout.style.cssText =
    'position:absolute;top:8px;left:8px;padding:4px 8px;border-radius:4px;display:none;' +
    'background:rgba(255,255,255,.92);font:12px/1.4 ui-monospace,monospace;color:#223;' +
    'pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.15)';
  el.appendChild(readout);

  const vertex = new Vector3();
  const show = (hit: PickResult | undefined): void => {
    material.color.setHex(hit?.traceIndex === 1 ? SURFACE_HOVER : SURFACE_COLOR);
    if (!hit) {
      ring.update({ x: [NaN], y: [NaN], z: [NaN] });
      readout.style.display = 'none';
      root.invalidate();
      return;
    }
    if (hit.traceIndex === 0) {
      const i = hit.pointIndex;
      ring.update({ x: [x[i]!], y: [y[i]!], z: [z[i]!] });
      readout.textContent =
        `markers · point ${i} · (${x[i]!.toFixed(2)}, ${y[i]!.toFixed(2)}, ` +
        `${z[i]!.toFixed(2)}) · ${hit.distance.toFixed(1)} px`;
    } else {
      vertex.fromBufferAttribute(pos, hit.pointIndex).applyMatrix4(mesh.matrixWorld);
      ring.update({ x: [vertex.x], y: [vertex.y], z: [vertex.z] });
      readout.textContent = `surface · vertex ${hit.pointIndex} · ${hit.distance.toFixed(1)} px`;
    }
    readout.style.display = 'block';
    root.invalidate();
  };

  // One pick in flight; the newest position waits; every finished pick is shown (E2.17). The old
  // queue dropped a finished pick whenever a newer one was waiting, so a moving pointer starved
  // the readout.
  // `data-pick-pending` on the container tells tests (and devtools) when the readout is final.
  const picks = createLatestQueue(
    (p: { x: number; y: number }) => picker.pick(p.x, p.y, { radius: 6, mode: 'closest' }),
    (hits: PickResult[]) => {
      show(hits[0]);
      // The waiting pick (if any) starts right after this callback.
      queueMicrotask(() => {
        if (!picks.busy) el.dataset['pickPending'] = 'false';
      });
    },
  );
  const pickAt = (px: number, py: number): void => {
    el.dataset['pickPending'] = 'true';
    picks.push({ x: px, y: py });
  };

  const canvas = root.canvas;
  let drag: { x: number; y: number } | null = null;
  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent): void => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (drag) {
      azimuth -= (e.clientX - drag.x) * 0.01;
      elevation = Math.max(-1.4, Math.min(1.4, elevation + (e.clientY - drag.y) * 0.01));
      drag = { x: e.clientX, y: e.clientY };
      placeCamera();
      return;
    }
    const p = local(e);
    pickAt(p.x, p.y);
  };
  const onUp = (e: PointerEvent): void => {
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  const onLeave = (): void => {
    // A pick still in flight must not bring the readout back after the pointer left.
    picks.cancel();
    el.dataset['pickPending'] = 'false';
    if (!drag) show(undefined);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  root.renderNow();

  return {
    renderer: root.renderer,
    ready: Promise.resolve(),
    dispose() {
      picks.dispose();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      offResize();
      // Pick render target and pick materials first, then the viewport contents and the context.
      picker.dispose();
      readout.remove();
      root.destroy();
    },
  };
}
