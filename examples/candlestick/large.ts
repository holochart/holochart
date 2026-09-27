import { createChart } from '@mk7s/holochart';
import { priceSeries } from '../_lib/prices.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Perf check for E12.3 (instanced bodies and wicks, two draw calls whatever the count): 100,000
 * one-minute candles (about ten months of a 6.5-hour session), with nights and weekends hidden by
 * range breaks. Every body is one instance of a rect primitive and every wick one segment of a
 * line batch, uploaded once; pan and zoom only set transform uniforms.
 *
 * The readout shows the data generation time, the time from `createChart` to `chart.ready` (calc,
 * upload, first frame) and — with "Pan" / "Zoom" — frames per second, the CPU time per
 * `chart.previewRanges` call and the draw calls of the last frame. The numbers are also on
 * `window.__candlePerf`.
 */
export const meta: ExampleMeta = {
  title: 'Candlestick: 100k candles benchmark',
  description:
    '100,000 one-minute candles on a range-break axis in two draw calls, with first-draw timing and pan / zoom sweeps.',
  tags: ['candlestick', 'financial', 'perf', 'large-data', 'no-visual-test'],
  size: { width: 900, height: 520 },
};

const N = 100_000;

declare global {
  interface Window {
    __candlePerf?: {
      generateMs: number;
      firstDrawMs: number;
      fps?: number;
      previewMs?: number;
      calls?: number;
    };
  }
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const t0 = performance.now();
  const data = priceSeries({
    seed: 100_000,
    bars: N,
    start: '2024-01-02 09:30',
    minutes: 1,
    session: [9.5, 16],
    price: 250,
    volatility: 0.02,
  });
  const { x, open, high, low, close } = data;
  const generateMs = performance.now() - t0;
  const t1 = performance.now();
  const chart = createChart(el, {
    data: [{ type: 'candlestick', name: 'ACME', x, open, high, low, close }],
    layout: {
      title: { text: '100,000 one-minute candles' },
      xaxis: {
        rangeslider: { visible: false },
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { bounds: [16, 9.5], pattern: 'hour' }],
      },
    },
  });
  const perf: NonNullable<Window['__candlePerf']> = { generateMs, firstDrawMs: NaN };
  window.__candlePerf = perf;

  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;top:6px;right:16px;padding:4px 8px;background:rgba(21,21,29,.9);color:#a4a7b5;' +
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
  // The x extent in linear coordinates (compressed by the range breaks: trading time only).
  let l0 = 0;
  let l1 = 1;
  const frame = (): void => {
    if (!mode) return;
    const start = performance.now();
    const span = l1 - l0;
    if (mode === 'pan') {
      // A window of 1/20 of the data moving 1/2000 of it per frame, bouncing at the ends.
      const width = span / 20;
      const room = span - width;
      const t = ((step * span) / 2000) % (2 * room);
      const left = l0 + (t <= room ? t : 2 * room - t);
      chart.previewRanges({ x: [left, left + width] });
    } else {
      // Everything → 1/500 of it → everything, 240 frames each way, around the middle.
      const t = (step % 480) / 240;
      const f = t <= 1 ? t : 2 - t;
      const width = span * Math.pow(1 / 500, f);
      const mid = l0 + span / 2;
      chart.previewRanges({ x: [mid - width / 2, mid + width / 2] });
    }
    step++;
    cpu += performance.now() - start;
    frames++;
    const now = performance.now();
    if (now - windowStart >= 500) {
      perf.fps = (frames * 1000) / (now - windowStart);
      perf.previewMs = cpu / frames;
      perf.calls = chart.three.renderer.info.render.calls;
      readout.textContent = `${perf.fps.toFixed(0)} fps · ${perf.previewMs.toFixed(2)} ms/preview · ${perf.calls} draw calls · first draw ${perf.firstDrawMs.toFixed(0)} ms`;
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
    const scale = chart.axes.get('x')?.scale;
    if (scale) {
      l0 = scale.d2l(x[0]);
      l1 = scale.d2l(x[N - 1]);
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
      delete window.__candlePerf;
      chart.destroy();
    },
  };
}
