import { createChart, sceneFor } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * One million `scatter3d` points in a chart (plan E14.2 target: 1M points interactive while
 * orbiting): a gaussian cloud as sprite markers colored through a colorscale, or as lit spheres.
 * Each "Orbit …" button switches to that marker mode and turns the scene's camera every frame (as
 * a drag would: no pipeline pass, no buffer upload; the axes redraw for the camera). Hover works
 * when the camera rests (GPU picking). `pnpm bench:gpu --only scatter3d/perf-1m` measures it.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: 1M points (orbit benchmark)',
  description:
    'One million scatter3d markers (sprites or spheres) with camera-orbit toggles and an FPS readout.',
  tags: ['scatter3d', '3d', 'perf', 'no-visual-test', 'large-data'],
};

const COUNT = 1_000_000;
const MODES = ['sprites', 'spheres'] as const;
type Mode = (typeof MODES)[number];

declare global {
  interface Window {
    __scatter3dPerf?: { generateMs: number; firstDrawMs: number };
  }
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const t0 = performance.now();
  const normal = gaussian(rng(3));
  const x = new Float64Array(COUNT);
  const y = new Float64Array(COUNT);
  const z = new Float64Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    x[i] = normal();
    y[i] = normal() * 0.6;
    z[i] = normal() * 0.8;
  }
  const generateMs = performance.now() - t0;
  const t1 = performance.now();
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers',
        x,
        y,
        z,
        marker: { size: 2, color: z, colorscale: 'Viridis', render: 'sprite' },
        hoverinfo: 'x+y+z',
      },
    ],
    layout: {
      title: { text: `${COUNT.toLocaleString('en-US')} points` },
      margin: { l: 10, r: 10, t: 40, b: 10 },
    },
  });
  const ready = chart.ready.then(() => {
    window.__scatter3dPerf = { generateMs, firstDrawMs: performance.now() - t1 };
  });

  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;top:8px;right:8px;padding:6px 8px;background:rgba(255,255,255,.85);' +
    'font:12px system-ui,sans-serif;border-radius:4px;display:flex;gap:8px;align-items:center';
  const buttons = new Map<Mode, HTMLButtonElement>();
  for (const mode of MODES) {
    const b = document.createElement('button');
    b.textContent = `Orbit ${mode}`;
    buttons.set(mode, b);
    panel.append(b);
  }
  const fps = document.createElement('span');
  fps.textContent = `data ${generateMs.toFixed(0)} ms`;
  panel.append(fps);
  if (new URLSearchParams(location.search).get('test') === '1') panel.style.display = 'none';
  el.appendChild(panel);

  const root = chart.three.root;
  let orbiting: Mode | null = null;
  let release: (() => void) | null = null;
  let azimuth = Math.PI / 4;
  let frames = 0;
  let windowStart = performance.now();
  const offBefore = root.on('beforerender', (info) => {
    if (!orbiting) return;
    const scene = sceneFor(chart.fullLayout!, chart.fullData[0]!);
    if (!scene) return;
    azimuth += (info.delta / 1000) * 0.6;
    const r = Math.hypot(1.25, 1.25);
    scene.setCamera({
      ...scene.camera,
      eye: [r * Math.cos(azimuth), r * Math.sin(azimuth), 1.25],
    });
  });
  const offAfter = root.on('afterrender', () => {
    if (!orbiting) return;
    frames++;
    const now = performance.now();
    if (now - windowStart >= 500) {
      fps.textContent = `${orbiting}: ${((frames * 1000) / (now - windowStart)).toFixed(0)} fps`;
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
  const handlers = MODES.map((mode) => {
    const h = async (): Promise<void> => {
      if (orbiting === mode) {
        stop();
        return;
      }
      stop();
      await chart.restyle({ 'marker.render': mode === 'spheres' ? 'sphere' : 'sprite' }, [0]);
      frames = 0;
      windowStart = performance.now();
      orbiting = mode;
      buttons.get(mode)!.textContent = 'Stop';
      release = root.requestAnimation();
    };
    buttons.get(mode)!.addEventListener('click', h);
    return [mode, h] as const;
  });

  return {
    ready,
    renderer: chart.three.renderer,
    dispose() {
      stop();
      for (const [mode, h] of handlers) buttons.get(mode)!.removeEventListener('click', h);
      offBefore();
      offAfter();
      panel.remove();
      chart.destroy();
    },
  };
}
