import type { PerspectiveCamera } from 'three';
import {
  createRenderRoot,
  loadLinesMarkers3D,
  type Colorscale,
  type Line3D,
  type Markers3D,
  type SphereSet,
} from '@mk7s/holochart-render';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Manual perf check for E14.2 (target: 1M points interactive while orbiting). One million points
 * as opaque sprites, lit sphere impostors, or one million-vertex 3D polyline; each "Orbit …"
 * button switches to that mode and orbits the camera continuously (one instanced draw call; the
 * camera moves, no buffer is re-uploaded). `pnpm bench:gpu --only scatter3d-1m` measures it.
 */
export const meta: ExampleMeta = {
  title: '1M points 3D orbit benchmark',
  description:
    'One million 3D points as sprites, spheres or a polyline, with camera-orbit toggles and an FPS readout.',
  tags: ['perf', 'no-visual-test', 'dev', '3d'],
};

const COUNT = 1_000_000;
const VIRIDIS: Colorscale = [
  [0, [0.267, 0.005, 0.329, 1]],
  [0.5, [0.128, 0.567, 0.551, 1]],
  [1, [0.993, 0.906, 0.144, 1]],
];
const MODES = ['sprites', 'spheres', 'lines'] as const;
type Mode = (typeof MODES)[number];

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const root = createRenderRoot(el, { background: [1, 1, 1, 1] });
  const viewport = root.addViewport({
    kind: '3d',
    rect: { x: 0, y: 0, width: root.size.width, height: root.size.height },
    fov: 45,
  });
  const camera = viewport.camera as PerspectiveCamera;
  let azimuth = 0.6;
  const place = (): void => {
    camera.position.set(4.2 * Math.sin(azimuth) * 0.92, 1.6, 4.2 * Math.cos(azimuth) * 0.92);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  };
  place();

  // Data: a gaussian cloud (markers) and a smoothed random walk (line).
  const t0 = performance.now();
  const random = rng(3);
  const normal = gaussian(random);
  const x = new Float64Array(COUNT);
  const y = new Float64Array(COUNT);
  const z = new Float64Array(COUNT);
  const value = new Float64Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    x[i] = normal() * 0.6;
    y[i] = normal() * 0.35;
    z[i] = normal() * 0.6;
    value[i] = y[i]!;
  }
  const wx = new Float64Array(COUNT);
  const wy = new Float64Array(COUNT);
  const wz = new Float64Array(COUNT);
  const walkColor = new Float32Array(COUNT * 4);
  let vx = 0;
  let vy = 0;
  let vz = 0;
  for (let i = 1; i < COUNT; i++) {
    vx = 0.999 * vx + normal() * 2e-4;
    vy = 0.999 * vy + normal() * 2e-4;
    vz = 0.999 * vz + normal() * 2e-4;
    wx[i] = Math.max(-1, Math.min(1, wx[i - 1]! + vx));
    wy[i] = Math.max(-1, Math.min(1, wy[i - 1]! + vy));
    wz[i] = Math.max(-1, Math.min(1, wz[i - 1]! + vz));
    const t = i / COUNT;
    walkColor.set([0.2 + 0.7 * t, 0.3, 0.9 - 0.7 * t, 1], i * 4);
  }
  const generateMs = performance.now() - t0;

  // Controls (DOM overlay).
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;top:8px;left:8px;padding:6px 8px;background:rgba(255,255,255,.85);' +
    'font:12px system-ui,sans-serif;border-radius:4px;display:flex;gap:8px;align-items:center';
  const buttons = new Map<Mode, HTMLButtonElement>();
  for (const mode of MODES) {
    const b = document.createElement('button');
    b.textContent = `Orbit ${mode}`;
    buttons.set(mode, b);
    panel.append(b);
  }
  const fps = document.createElement('span');
  fps.textContent = `– fps · data ${generateMs.toFixed(0)} ms`;
  panel.append(fps);
  el.appendChild(panel);

  let shown: Line3D | Markers3D | SphereSet | null = null;
  let shownMode: Mode | null = null;
  let orbiting: Mode | null = null;
  let release: (() => void) | null = null;

  const ready = loadLinesMarkers3D().then((m3d) => {
    const show = (mode: Mode): void => {
      if (mode === shownMode) return;
      shown?.dispose();
      const t = performance.now();
      if (mode === 'sprites') {
        shown = m3d.createMarkers3D(root.context, {
          x,
          y,
          z,
          colorValues: value,
          colorscale: VIRIDIS,
          cmin: -0.8,
          cmax: 0.8,
          size: 3,
        });
      } else if (mode === 'spheres') {
        shown = m3d.createSpheres(root.context, {
          x,
          y,
          z,
          colorValues: value,
          colorscale: VIRIDIS,
          cmin: -0.8,
          cmax: 0.8,
          size: 4,
        });
      } else {
        shown = m3d.createLine3D(root.context, {
          x: wx,
          y: wy,
          z: wz,
          color: walkColor,
          width: 1.5,
        });
      }
      viewport.add(shown);
      shownMode = mode;
      fps.textContent = `${mode}: built in ${(performance.now() - t).toFixed(0)} ms`;
      root.renderNow();
    };
    show('sprites');
    return show;
  });

  const offBefore = root.on('beforerender', (info) => {
    if (!orbiting) return;
    azimuth += (info.delta / 1000) * 0.6;
    place();
  });
  let frames = 0;
  let windowStart = performance.now();
  const offAfter = root.on('afterrender', () => {
    if (!orbiting) return;
    frames++;
    const now = performance.now();
    if (now - windowStart >= 500) {
      const rate = (frames * 1000) / (now - windowStart);
      fps.textContent = `${orbiting}: ${rate.toFixed(0)} fps · ${root.renderer.info.render.calls} draw calls`;
      frames = 0;
      windowStart = now;
    }
  });
  const stop = (): void => {
    release?.();
    release = null;
    if (orbiting) buttons.get(orbiting)!.textContent = `Orbit ${orbiting}`;
    orbiting = null;
  };
  const onClick = (mode: Mode) => async (): Promise<void> => {
    if (orbiting === mode) {
      stop();
      return;
    }
    stop();
    (await ready)(mode);
    frames = 0;
    windowStart = performance.now();
    orbiting = mode;
    buttons.get(mode)!.textContent = 'Stop';
    release = root.requestAnimation();
  };
  const handlers = MODES.map((mode) => {
    const h = onClick(mode);
    buttons.get(mode)!.addEventListener('click', h);
    return [mode, h] as const;
  });
  const offResize = root.on('resize', (size) =>
    viewport.setRect({ x: 0, y: 0, width: size.width, height: size.height }),
  );

  return {
    renderer: root.renderer,
    ready: ready.then(() => undefined),
    dispose() {
      stop();
      for (const [mode, h] of handlers) buttons.get(mode)!.removeEventListener('click', h);
      offBefore();
      offAfter();
      offResize();
      shown?.dispose();
      panel.remove();
      root.destroy();
    },
  };
}
