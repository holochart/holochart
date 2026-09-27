import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Perf check for E11.1 (plan target: a 4096 × 4096 heatmap renders in < 100 ms, with pan and zoom
 * at 60 fps). 16.7 million cells given as 4096 `Float32Array` rows, drawn as one float texture
 * sampled through the colorscale LUT: the first draw converts the rows into the grid, packs and
 * uploads the texture once; pan and zoom only set transform uniforms.
 *
 * The readout shows the data generation time, the time from `createChart` to `chart.ready` (calc,
 * texture packing and upload, first frame), and — with "Pan" / "Zoom" — frames per second and the
 * CPU time per `chart.previewRanges` call. The timings are also on `window.__heatmapPerf`.
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: 4096 × 4096 benchmark',
  description:
    'A 16.7M-cell heatmap drawn as one GPU texture, with first-draw timing and pan / zoom sweeps.',
  tags: ['heatmap', 'scientific', 'perf', 'large-data', 'no-visual-test'],
  size: { width: 800, height: 600 },
};

const N = 4096;

/** Deterministic interference pattern: rows of float32 values. */
function field(): Float32Array[] {
  const rows: Float32Array[] = [];
  for (let j = 0; j < N; j++) {
    const row = new Float32Array(N);
    const y = (j / N) * 12 - 6;
    for (let i = 0; i < N; i++) {
      const x = (i / N) * 12 - 6;
      const r1 = Math.hypot(x - 1.5, y);
      const r2 = Math.hypot(x + 1.5, y);
      row[i] = Math.cos(r1 * 6) + Math.cos(r2 * 6) + 0.15 * Math.sin(x * 40) * Math.sin(y * 40);
    }
    rows.push(row);
  }
  return rows;
}

declare global {
  interface Window {
    __heatmapPerf?: { generateMs: number; firstDrawMs: number; fps?: number; previewMs?: number };
  }
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const t0 = performance.now();
  const z = field();
  const generateMs = performance.now() - t0;
  const t1 = performance.now();
  const chart = createChart(el, {
    data: [{ type: 'heatmap', z, colorbar: { title: { text: 'amplitude' } } }],
    layout: { title: { text: '4096 × 4096 heatmap (16.7M cells)' } },
  });
  const perf: NonNullable<Window['__heatmapPerf']> = { generateMs, firstDrawMs: NaN };
  window.__heatmapPerf = perf;

  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;top:6px;left:48px;padding:4px 8px;background:rgba(21,21,29,.9);color:#a4a7b5;' +
    'font:12px system-ui,sans-serif;border-radius:4px;display:flex;gap:8px;align-items:center';
  const panButton = document.createElement('button');
  panButton.textContent = 'Pan';
  const zoomButton = document.createElement('button');
  zoomButton.textContent = 'Zoom';
  const readout = document.createElement('span');
  readout.textContent = `data ${generateMs.toFixed(0)} ms · drawing…`;
  panel.append(panButton, zoomButton, readout);
  el.appendChild(panel);
  const ready = chart.ready.then(() => {
    perf.firstDrawMs = performance.now() - t1;
    readout.textContent = `data ${generateMs.toFixed(0)} ms · first draw ${perf.firstDrawMs.toFixed(0)} ms`;
  });

  let mode: 'pan' | 'zoom' | null = null;
  let raf = 0;
  let step = 0;
  let frames = 0;
  let cpu = 0;
  let windowStart = 0;
  const frame = (): void => {
    if (!mode) return;
    const start = performance.now();
    if (mode === 'pan') {
      // A 512-cell window moving 8 cells per frame, bouncing between the edges.
      const span = N - 512;
      const t = (step * 8) % (2 * span);
      const left = (t <= span ? t : 2 * span - t) - 0.5;
      chart.previewRanges({ x: [left, left + 512], y: [left, left + 512] });
    } else {
      // Whole grid → 16 cells → whole grid, 240 frames each way, around the middle.
      const t = (step % 480) / 240;
      const f = t <= 1 ? t : 2 - t;
      const width = N * Math.pow(16 / N, f);
      const mid = N / 2;
      chart.previewRanges({
        x: [mid - width / 2, mid + width / 2],
        y: [mid - width / 2, mid + width / 2],
      });
    }
    step++;
    cpu += performance.now() - start;
    frames++;
    const now = performance.now();
    if (now - windowStart >= 500) {
      perf.fps = (frames * 1000) / (now - windowStart);
      perf.previewMs = cpu / frames;
      readout.textContent = `${perf.fps.toFixed(0)} fps · ${perf.previewMs.toFixed(2)} ms/preview · first draw ${perf.firstDrawMs.toFixed(0)} ms`;
      frames = 0;
      cpu = 0;
      windowStart = now;
    }
    raf = requestAnimationFrame(frame);
  };
  const toggle = (next: 'pan' | 'zoom'): void => {
    cancelAnimationFrame(raf);
    mode = mode === next ? null : next;
    panButton.textContent = mode === 'pan' ? 'Stop' : 'Pan';
    zoomButton.textContent = mode === 'zoom' ? 'Stop' : 'Zoom';
    if (!mode) {
      void chart.resetAxes();
      return;
    }
    step = 0;
    frames = 0;
    cpu = 0;
    windowStart = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const onPan = (): void => toggle('pan');
  const onZoom = (): void => toggle('zoom');
  panButton.addEventListener('click', onPan);
  zoomButton.addEventListener('click', onZoom);

  return {
    ready,
    renderer: chart.three.renderer,
    dispose() {
      mode = null;
      cancelAnimationFrame(raf);
      panButton.removeEventListener('click', onPan);
      zoomButton.removeEventListener('click', onZoom);
      panel.remove();
      delete window.__heatmapPerf;
      chart.destroy();
    },
  };
}
