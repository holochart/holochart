import { createChart, sceneFor } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A 1024 × 1024 surface (plan E14.3 target: a 1024² grid built in < 50 ms): the heights go to the
 * GPU as one float texture and the surface is built in the vertex shader (no vertex buffers, no
 * normals on the CPU). "Rebuild" sends new heights of the same size (`restyle`: calc, texture
 * rewrite, next frame) and shows how long it took; "Orbit" turns the camera every frame.
 * `pnpm bench:gpu --only surface/perf-1024` measures it.
 */
export const meta: ExampleMeta = {
  title: 'Surface: 1024² grid (benchmark)',
  description:
    'A million-point surface built on the GPU from a height texture, with rebuild and orbit buttons.',
  tags: ['surface', '3d', 'perf', 'no-visual-test', 'large-data'],
};

const N = 1024;

declare global {
  interface Window {
    __surfacePerf?: { generateMs: number; firstDrawMs: number; rebuildMs?: number };
  }
}

/** Rows of heights: interfering waves over a slope (`phase` shifts them). */
function heights(phase: number): Float64Array[] {
  const rows: Float64Array[] = [];
  for (let j = 0; j < N; j++) {
    const v = (j / N) * 8 - 4;
    const row = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const u = (i / N) * 8 - 4;
      row[i] =
        Math.sin(u * 2 + phase) * Math.cos(v * 1.5) * Math.exp(-(u * u + v * v) / 12) +
        0.15 * Math.sin(u * 9 + v * 7) +
        0.05 * u;
    }
    rows.push(row);
  }
  return rows;
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const t0 = performance.now();
  const z = heights(0);
  const axis = Float64Array.from({ length: N }, (_, i) => (i / N) * 8 - 4);
  const generateMs = performance.now() - t0;
  const t1 = performance.now();
  const chart = createChart(el, {
    data: [{ type: 'surface', x: axis, y: axis, z, colorbar: { title: { text: 'z' } } }],
    layout: {
      title: { text: `${N} × ${N} surface` },
      margin: { l: 10, r: 10, t: 40, b: 10 },
      scene: { aspectmode: 'manual', aspectratio: { x: 1, y: 1, z: 0.4 } },
    },
  });
  const ready = chart.ready.then(() => {
    window.__surfacePerf = { generateMs, firstDrawMs: performance.now() - t1 };
  });

  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;bottom:8px;left:8px;padding:6px 8px;background:rgba(255,255,255,.85);' +
    'font:12px system-ui,sans-serif;border-radius:4px;display:flex;gap:8px;align-items:center';
  const orbit = document.createElement('button');
  orbit.textContent = 'Orbit';
  const rebuild = document.createElement('button');
  rebuild.textContent = 'Rebuild';
  const status = document.createElement('span');
  status.textContent = `data ${generateMs.toFixed(0)} ms`;
  panel.append(orbit, rebuild, status);
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
  let phase = 0;
  const onRebuild = async (): Promise<void> => {
    const next = heights((phase += 0.7));
    const t = performance.now();
    await chart.restyle({ z: [next] }, [0]);
    await chart.ready;
    const ms = performance.now() - t;
    if (window.__surfacePerf) window.__surfacePerf.rebuildMs = ms;
    status.textContent = `rebuilt in ${ms.toFixed(0)} ms`;
  };
  orbit.addEventListener('click', onOrbit);
  rebuild.addEventListener('click', onRebuild);

  return {
    ready,
    renderer: chart.three.renderer,
    dispose() {
      release?.();
      orbit.removeEventListener('click', onOrbit);
      rebuild.removeEventListener('click', onRebuild);
      offBefore();
      offAfter();
      panel.remove();
      chart.destroy();
      delete window.__surfacePerf;
    },
  };
}
