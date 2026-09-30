import { createChart, sceneFor } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A 256³ ray-marched volume (plan E14.7 target: interactive at ≥ 30 fps): 16.7 million grid
 * points as float32 columns, a gyroid lattice fading out from the center, drawn with `render:
 * 'raymarch'` — the values go to the GPU as one 8-bit 3D texture (16 MB) and every pixel marches
 * its ray through it. "Orbit" turns the camera every frame and shows the frame rate.
 * `pnpm bench:gpu --only volume/perf-256` measures it.
 */
export const meta: ExampleMeta = {
  title: 'Volume: 256³ ray-marched (benchmark)',
  description:
    'A 16.7M-point volume ray-marched on the GPU from a 3D texture, with an orbit button and fps readout.',
  tags: ['volume', '3d', 'perf', 'no-visual-test', 'large-data', 'raymarch'],
};

const N = 256;

declare global {
  interface Window {
    __volumePerf?: { generateMs: number; firstDrawMs: number };
  }
}

/** The grid columns (x fastest) of `(1.2 + gyroid(6p)) · exp(−2|p|²)` over [-1, 1]³. */
function field(): { x: Float32Array; y: Float32Array; z: Float32Array; value: Float32Array } {
  const n = N * N * N;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const value = new Float32Array(n);
  const a = Float64Array.from({ length: N }, (_, i) => (i / (N - 1)) * 2 - 1);
  // Separable pieces: the gyroid is sin·cos products, the Gaussian a product per axis.
  const s = a.map((v) => Math.sin(6 * v));
  const c = a.map((v) => Math.cos(6 * v));
  const e = a.map((v) => Math.exp(-2 * v * v));
  let o = 0;
  for (let k = 0; k < N; k++) {
    for (let j = 0; j < N; j++) {
      const ejk = e[j]! * e[k]!;
      const syz = s[j]! * c[k]!;
      for (let i = 0; i < N; i++, o++) {
        x[o] = a[i]!;
        y[o] = a[j]!;
        z[o] = a[k]!;
        value[o] = (1.2 + s[i]! * c[j]! + syz + s[k]! * c[i]!) * e[i]! * ejk;
      }
    }
  }
  return { x, y, z, value };
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const t0 = performance.now();
  const grid = field();
  const generateMs = performance.now() - t0;
  const t1 = performance.now();
  const chart = createChart(el, {
    data: [
      {
        type: 'volume',
        ...grid,
        render: 'raymarch',
        isomin: 0.5,
        opacity: 0.08,
        opacityscale: 'max',
        colorscale: 'Viridis',
      },
    ],
    layout: {
      title: { text: `${N}³ volume, ray-marched` },
      margin: { l: 10, r: 10, t: 40, b: 10 },
    },
  });
  const ready = chart.ready.then(() => {
    window.__volumePerf = { generateMs, firstDrawMs: performance.now() - t1 };
  });

  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;bottom:8px;left:8px;padding:6px 8px;background:rgba(255,255,255,.85);' +
    'font:12px system-ui,sans-serif;border-radius:4px;display:flex;gap:8px;align-items:center';
  const orbit = document.createElement('button');
  orbit.textContent = 'Orbit';
  const status = document.createElement('span');
  status.textContent = `data ${generateMs.toFixed(0)} ms`;
  panel.append(orbit, status);
  if (new URLSearchParams(location.search).get('test') === '1') panel.style.display = 'none';
  el.appendChild(panel);

  const root = chart.three.root;
  let release: (() => void) | null = null;
  let azimuth = Math.PI / 4;
  let frames = 0;
  let windowStart = performance.now();
  const offBefore = root.on('beforerender', (info) => {
    if (!release) return;
    const scene = sceneFor(chart.fullLayout!, chart.fullData[0]!);
    if (!scene) return;
    azimuth += (info.delta / 1000) * 0.6;
    const r = Math.hypot(1.25, 1.25);
    scene.setCamera({ ...scene.camera, eye: [r * Math.cos(azimuth), r * Math.sin(azimuth), 1.1] });
  });
  const offAfter = root.on('afterrender', () => {
    if (!release) return;
    frames++;
    const now = performance.now();
    if (now - windowStart >= 500) {
      status.textContent = `${((frames * 1000) / (now - windowStart)).toFixed(0)} fps`;
      frames = 0;
      windowStart = now;
    }
  });
  const onOrbit = (): void => {
    if (release) {
      release();
      release = null;
      orbit.textContent = 'Orbit';
      return;
    }
    frames = 0;
    windowStart = performance.now();
    orbit.textContent = 'Stop';
    release = root.requestAnimation();
  };
  orbit.addEventListener('click', onOrbit);

  return {
    ready,
    renderer: chart.three.renderer,
    dispose() {
      release?.();
      orbit.removeEventListener('click', onOrbit);
      offBefore();
      offAfter();
      panel.remove();
      chart.destroy();
      delete window.__volumePerf;
    },
  };
}
