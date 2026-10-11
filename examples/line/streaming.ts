import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Streaming: two lines fed by `chart.extendTraces` on a timer. Each tick appends one sample to
 * both traces, and `maxPoints` keeps the last 300 of each, so the window rolls: old points leave
 * on the left as new ones arrive on the right, and memory stays bounded. Only the new points are
 * converted and uploaded, and the autorange follows the window.
 *
 * The chart starts with the first 10 seconds, then receives ten samples per second. `dispose`
 * clears the timer before destroying the chart, as a page that streams into a chart has to.
 *
 * Not a visual test: the picture moves. `_dev/streaming-final` checks the result of a fixed
 * sequence of appends.
 */
export const meta: ExampleMeta = {
  title: 'Line: streaming with a rolling window',
  description:
    'Two lines that receive ten samples per second through extendTraces, with maxPoints keeping the last 30 seconds.',
  tags: ['line', 'scatter', 'streaming', 'live', 'extendtraces', 'animation', 'no-visual-test'],
};

/** Samples per second. */
const RATE = 10;
/** Points kept per trace: the last 30 seconds. */
const WINDOW = 30 * RATE;
/** Points the chart starts with. */
const SEED = 10 * RATE;

export function run(el: HTMLElement): ExampleHandle {
  // Seeded, so every run streams the same values.
  const normal = gaussian(rng(29));
  let inlet = 62;
  let outlet = 48;
  let n = 0;
  /** The next sample: time in seconds and the two readings. */
  const sample = (): { t: number; inlet: number; outlet: number } => {
    const t = n++ / RATE;
    inlet += normal() * 0.35 + (62 + 4 * Math.sin(t / 6) - inlet) * 0.04;
    outlet += normal() * 0.25 + (48 + 3 * Math.sin(t / 9 + 1) - outlet) * 0.04;
    return { t, inlet: Math.round(inlet * 100) / 100, outlet: Math.round(outlet * 100) / 100 };
  };

  const first = Array.from({ length: SEED }, sample);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Inlet',
        x: first.map((s) => s.t),
        y: first.map((s) => s.inlet),
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Outlet',
        x: first.map((s) => s.t),
        y: first.map((s) => s.outlet),
      },
    ],
    layout: {
      title: { text: 'Coolant temperature, last 30 seconds' },
      xaxis: { title: { text: 'Time (s)' } },
      yaxis: { title: { text: '°C' } },
      hovermode: 'x unified',
    },
  });

  const tick = (): void => {
    const s = sample();
    // One array of new values per trace; `WINDOW` drops the oldest points of both.
    chart
      .extendTraces({ x: [[s.t], [s.t]], y: [[s.inlet], [s.outlet]] }, [0, 1], WINDOW)
      // Rejects when the chart is destroyed while an update is pending: nothing to do.
      .catch(() => undefined);
  };

  let timer: number | undefined;
  let disposed = false;
  const ready = chart.ready.then(() => {
    // Start streaming once the first frame is drawn, unless the example is gone already.
    if (!disposed) timer = window.setInterval(tick, 1000 / RATE);
  });

  return {
    ready,
    renderer: chart.three.renderer,
    dispose() {
      disposed = true;
      if (timer !== undefined) window.clearInterval(timer);
      chart.destroy();
    },
  };
}
