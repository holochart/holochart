import { Vector3, type PerspectiveCamera } from 'three';
import {
  createPicker,
  createRenderRoot,
  loadLinesMarkers3D,
  type Line3D,
  type Markers3D,
} from '@mk7s/holochart-render';
import { gaussian, rng } from '../_lib/rng.ts';
import { createReadout, expectValue } from '../_lib/readout.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3D sprite markers (E14.2, render part): every Plotly scatter3d symbol in rows running into the
 * depth, opaque (depth-writing with alpha to coverage) so a thick line weaving through the rows is
 * hidden behind nearer markers and hides farther ones; below, a translucent cloud sorted back to
 * front (`depthSort`). A GPU pick at a fixed point reports the data index.
 */
export const meta: ExampleMeta = {
  title: '3D markers: symbols, depth, sorting',
  description:
    'Screen-facing SDF sprites of every scatter3d symbol, depth-interleaved with a line, and a depth-sorted translucent cloud.',
  tags: ['dev', 'primitives', 'markers', '3d'],
  size: { width: 640, height: 400 },
};

const SYMBOLS = [
  'circle',
  'circle-open',
  'cross',
  'diamond',
  'diamond-open',
  'square',
  'square-open',
  'x',
] as const;

const PALETTE: readonly [number, number, number][] = [
  [0.12, 0.47, 0.71],
  [1.0, 0.5, 0.05],
  [0.17, 0.63, 0.17],
  [0.84, 0.15, 0.16],
  [0.58, 0.4, 0.74],
  [0.55, 0.34, 0.29],
  [0.89, 0.47, 0.76],
  [0.5, 0.5, 0.5],
];

function orbit(camera: PerspectiveCamera, azimuth: number, elevation: number, distance: number) {
  camera.position.set(
    distance * Math.cos(elevation) * Math.sin(azimuth),
    distance * Math.sin(elevation),
    distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const root = createRenderRoot(el, { background: [1, 1, 1, 1] });
  const viewport = root.addViewport({
    kind: '3d',
    rect: { x: 0, y: 0, width: root.size.width, height: root.size.height },
    fov: 40,
  });
  const camera = viewport.camera as PerspectiveCamera;
  orbit(camera, 0.3, 0.38, 4.8);

  const readout = createReadout(el, 'right');

  const owned: (Line3D | Markers3D)[] = [];
  let disposed = false;
  const picker = createPicker(root);

  const ready = loadLinesMarkers3D().then(async (m3d) => {
    if (disposed) return;
    // A column of every symbol, running from z = -0.9 (far) to z = 0.9 (near).
    const perRow = 4;
    const n = SYMBOLS.length * perRow;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const z = new Float64Array(n);
    const symbol: string[] = [];
    const color = new Float32Array(n * 4);
    for (let s = 0; s < SYMBOLS.length; s++) {
      for (let k = 0; k < perRow; k++) {
        const i = s * perRow + k;
        x[i] = -1.4 + s * 0.4;
        y[i] = 0.3;
        z[i] = -0.9 + (1.8 * k) / (perRow - 1);
        symbol.push(SYMBOLS[s]!);
        color.set([...PALETTE[s]!, 1], i * 4);
      }
    }
    const sprites = m3d.createMarkers3D(root.context, {
      x,
      y,
      z,
      symbol,
      color,
      size: 22,
      lineWidth: 2,
      lineColor: color,
    });
    owned.push(sprites);
    viewport.add(sprites);
    picker.add(viewport, sprites, { traceIndex: 0 });

    // A thick line weaving through the rows at the markers' height (depth interleaving).
    const line = m3d.createLine3D(root.context, {
      x: [-1.7, 1.7],
      y: [0.3, 0.3],
      z: [0.25, 0.25],
      width: 8,
      color: [0.1, 0.1, 0.12, 1],
    });
    owned.push(line);
    viewport.add(line);

    // A translucent cloud below, sorted back to front whenever the view changes.
    const random = rng(5);
    const normal = gaussian(random);
    const m = 600;
    const cx = new Float64Array(m);
    const cy = new Float64Array(m);
    const cz = new Float64Array(m);
    const cc = new Float32Array(m * 4);
    for (let i = 0; i < m; i++) {
      cx[i] = normal() * 0.5;
      cy[i] = -0.75 + normal() * 0.12;
      cz[i] = normal() * 0.35;
      const t = Math.min(1, Math.max(0, (cz[i]! + 1) / 2));
      cc.set([0.95 - 0.8 * t, 0.3 + 0.3 * t, 0.2 + 0.75 * t, 0.55], i * 4);
    }
    const cloud = m3d.createMarkers3D(
      root.context,
      { x: cx, y: cy, z: cz, color: cc, size: 16, symbol: 'circle' },
      { depthSort: true },
    );
    owned.push(cloud);
    viewport.add(cloud);
    picker.add(viewport, cloud, { traceIndex: 1 });

    root.renderNow();
    // Wait for the first frame (the cloud's first depth sort), then pick a front marker.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    root.renderNow();
    // Pick at the nearest diamond (the pick id is its data index, 3 * 4 + 3 = 15).
    const at = new Vector3(x[15]!, y[15]!, z[15]!).project(camera);
    const px = ((at.x + 1) / 2) * root.size.width;
    const py = ((1 - at.y) / 2) * root.size.height;
    const hit = (await picker.pick(px, py, { radius: 4 }))[0];
    // Pick at the cloud's nearest point: sorted back to front it is drawn last, and the pick id
    // is its data index (not its sorted instance slot).
    let nearest = 0;
    let best = -Infinity;
    const view = new Vector3();
    for (let i = 0; i < m; i++) {
      view.set(cx[i]!, cy[i]!, cz[i]!).applyMatrix4(camera.matrixWorldInverse);
      if (view.z > best) [best, nearest] = [view.z, i];
    }
    const near = new Vector3(cx[nearest]!, cy[nearest]!, cz[nearest]!).project(camera);
    const cloudHit = (
      await picker.pick(((near.x + 1) / 2) * root.size.width, ((1 - near.y) / 2) * root.size.height)
    )[0];
    readout.textContent =
      (hit ? `pick: ${SYMBOLS[Math.floor(hit.pointIndex / perRow)]} #${hit.pointIndex}` : 'none') +
      ` · cloud #${cloudHit?.traceIndex === 1 ? cloudHit.pointIndex : '–'} (nearest #${nearest})`;
    expectValue('markers-3d diamond pick', hit?.pointIndex, 15);
    expectValue(
      'markers-3d cloud pick',
      cloudHit?.traceIndex === 1 ? cloudHit.pointIndex : undefined,
      nearest,
    );
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
