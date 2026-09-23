import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Manual perf check for E7.2 (plan target: 60 fps). Ten line traces stream 100 points each per
 * frame through `chart.extendTraces` with `maxPoints: 10_000` (a rolling window of 100k points in
 * all). Per frame, only the new points are converted (`calcAppend`), the autorange is merged
 * incrementally, and each trace uploads ~100 line vertices instead of rebuilding its buffers.
 * "Stream" toggles the loop; the readout shows frames per second and the update's CPU time.
 */
export const meta: ExampleMeta = {
  title: 'Streaming benchmark (extendTraces)',
  description:
    '10 traces × 10k-point rolling windows, 100 points appended per trace per frame, with an FPS readout.',
  tags: ['perf', 'no-visual-test', 'dev', 'streaming', 'scatter'],
};

const TRACES = 10;
const PER_FRAME = 100;
const MAX_POINTS = 10_000;

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const normal = gaussian(rng(11));
  const levels = new Float64Array(TRACES);
  let t = 0;

  // Seed each trace with a full window so the benchmark starts in steady state.
  const data = Array.from({ length: TRACES }, (_, k) => {
    const x = new Float64Array(MAX_POINTS);
    const y = new Float64Array(MAX_POINTS);
    for (let i = 0; i < MAX_POINTS; i++) {
      x[i] = i;
      levels[k] = levels[k]! + normal();
      y[i] = levels[k]! + k * 40;
    }
    return { type: 'scatter', mode: 'lines', x, y, line: { width: 1 }, name: `series ${k + 1}` };
  });
  t = MAX_POINTS;

  const chart = createChart(el, {
    data,
    layout: {
      margin: { l: 48, r: 16, t: 40, b: 36 },
      showlegend: false,
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#f4f6fa',
    },
    config: { responsive: true },
  });

  // Reused per frame: one array of new values per trace.
  const xs = Array.from({ length: TRACES }, () => new Float64Array(PER_FRAME));
  const ys = Array.from({ length: TRACES }, () => new Float64Array(PER_FRAME));
  const indices = Array.from({ length: TRACES }, (_, k) => k);
  const nextBatch = (): void => {
    for (let k = 0; k < TRACES; k++) {
      const bx = xs[k]!;
      const by = ys[k]!;
      for (let i = 0; i < PER_FRAME; i++) {
        bx[i] = t + i;
        levels[k] = levels[k]! + normal();
        by[i] = levels[k]! + k * 40;
      }
    }
    t += PER_FRAME;
  };

  // Controls (DOM overlay).
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;top:6px;left:56px;padding:4px 8px;background:rgba(255,255,255,.9);' +
    'font:12px system-ui,sans-serif;border-radius:4px;display:flex;gap:8px;align-items:center';
  const button = document.createElement('button');
  button.textContent = 'Stream';
  const readout = document.createElement('span');
  readout.textContent = `${TRACES} × ${MAX_POINTS.toLocaleString('en-US')} points`;
  panel.append(button, readout);
  el.appendChild(panel);

  let running = false;
  let raf = 0;
  let frames = 0;
  let cpu = 0;
  let windowStart = 0;
  const frame = (): void => {
    if (!running) return;
    const start = performance.now();
    nextBatch();
    // The update runs in a microtask; the promise resolves after the frame is drawn.
    chart
      .extendTraces({ x: xs, y: ys }, indices, MAX_POINTS)
      .then(() => {
        cpu += performance.now() - start;
        frames++;
        const now = performance.now();
        if (now - windowStart >= 500) {
          const fps = (frames * 1000) / (now - windowStart);
          readout.textContent = `${fps.toFixed(0)} fps · ${(cpu / frames).toFixed(1)} ms/update · ${TRACES} × ${MAX_POINTS.toLocaleString('en-US')} points`;
          frames = 0;
          cpu = 0;
          windowStart = now;
        }
        raf = requestAnimationFrame(frame);
      })
      .catch((error: unknown) => {
        running = false;
        readout.textContent = String(error);
      });
  };
  const onClick = (): void => {
    running = !running;
    button.textContent = running ? 'Stop' : 'Stream';
    if (running) {
      frames = 0;
      cpu = 0;
      windowStart = performance.now();
      raf = requestAnimationFrame(frame);
    } else cancelAnimationFrame(raf);
  };
  button.addEventListener('click', onClick);

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      button.removeEventListener('click', onClick);
      panel.remove();
      chart.destroy();
    },
  };
}
