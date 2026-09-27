import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeChart } from './selections-hook.mts';

/**
 * Manual perf check for E12.1 / E16.2 (plan target: 10 years of 1-minute bars, ~2.6M points,
 * panned at 60 fps). Ten years of one-minute closes, 12 trading hours a day (3,653 days × 720
 * minutes = 2,630,160 points), as one line on a date axis. The line is min/max decimated per
 * pixel column from a cached multi-resolution pyramid (`line.simplify`, on by default), so a pan
 * or zoom frame re-reads only the few thousand pyramid entries in view.
 *
 * "Pan" scrolls a one-month window through the decade with `chart.previewRanges` (the preview
 * path zoom and pan drags use); "Zoom" sweeps from the whole decade down to one day and back. The
 * readout shows frames per second and the preview's CPU time per frame.
 */
export const meta: ExampleMeta = {
  title: 'Time series: 2.6M-point pan benchmark',
  description:
    'Ten years of one-minute bars (2.6M points) on a date axis, with pan and zoom sweeps and an FPS readout.',
  tags: ['perf', 'no-visual-test', 'dev', 'line', 'time-series', 'date'],
};

const DAYS = 3653;
const MINUTES_PER_DAY = 720;
const MINUTE = 60_000;
const DAY = 86_400_000;
const COUNT = DAYS * MINUTES_PER_DAY;

/** Deterministic one-minute closes: a geometric random walk, 06:00–18:00 UTC each day. */
function series(): { x: Float64Array; y: Float64Array } {
  const normal = gaussian(rng(2026));
  const x = new Float64Array(COUNT);
  const y = new Float64Array(COUNT);
  const start = Date.UTC(2015, 0, 1, 6);
  let price = 100;
  let i = 0;
  for (let d = 0; d < DAYS; d++) {
    const open = start + d * DAY;
    for (let m = 0; m < MINUTES_PER_DAY; m++, i++) {
      price *= 1 + normal() * 0.0006 + 0.000_000_4;
      x[i] = open + m * MINUTE;
      y[i] = price;
    }
  }
  return { x, y };
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const { x, y } = series();
  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'lines', name: 'Close', x, y, line: { width: 1 }, hoverinfo: 'x+y' },
    ],
    layout: {
      title: { text: '10 years of 1-minute bars (2.6M points)' },
      xaxis: { type: 'date' },
      yaxis: { title: { text: 'Price' } },
      hovermode: 'x',
    },
  });
  const unexpose = exposeChart(chart);

  // Controls (DOM overlay).
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;top:6px;left:48px;padding:4px 8px;background:rgba(21,21,29,.9);color:#a4a7b5;' +
    'font:12px system-ui,sans-serif;border-radius:4px;display:flex;gap:8px;align-items:center';
  const panButton = document.createElement('button');
  panButton.textContent = 'Pan';
  const zoomButton = document.createElement('button');
  zoomButton.textContent = 'Zoom';
  const readout = document.createElement('span');
  readout.textContent = `${COUNT.toLocaleString('en-US')} points`;
  panel.append(panButton, zoomButton, readout);
  el.appendChild(panel);

  const x0 = x[0]!;
  const x1 = x[COUNT - 1]!;
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
      // A 30-day window moving 6 hours per frame, wrapping at the end of the data.
      const width = 30 * DAY;
      const left = x0 + (((step * DAY) / 4) % (x1 - x0 - width));
      chart.previewRanges({ x: [left, left + width] });
    } else {
      // Whole decade → one day → whole decade, 240 frames each way, around the middle.
      const t = (step % 480) / 240;
      const f = t <= 1 ? t : 2 - t;
      const width = (x1 - x0) * Math.pow(DAY / (x1 - x0), f);
      const mid = (x0 + x1) / 2;
      chart.previewRanges({ x: [mid - width / 2, mid + width / 2] });
    }
    step++;
    cpu += performance.now() - start;
    frames++;
    const now = performance.now();
    if (now - windowStart >= 500) {
      const fps = (frames * 1000) / (now - windowStart);
      readout.textContent = `${fps.toFixed(0)} fps · ${(cpu / frames).toFixed(2)} ms/preview · ${COUNT.toLocaleString('en-US')} points`;
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
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose() {
      mode = null;
      cancelAnimationFrame(raf);
      panButton.removeEventListener('click', onPan);
      zoomButton.removeEventListener('click', onZoom);
      panel.remove();
      unexpose();
      chart.destroy();
    },
  };
}
