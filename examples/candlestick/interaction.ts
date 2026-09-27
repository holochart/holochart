import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Candlestick interaction playground (plan E12.3, E12.1): ten daily candles over two weeks with
 * the weekend hidden by range breaks, the default range slider, and round prices so hover labels
 * are easy to check. Chart events are logged to `window.__interaction.events` for the interaction
 * suite (tests/interaction/finance.spec.ts).
 *
 * Not a visual test: its point is the pointer behavior.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: candlestick hover, range slider and zoom',
  description:
    'Ten candles on a range-break axis with the default range slider; events are logged to window.__interaction.',
  tags: ['candlestick', 'financial', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 420 },
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'candlestick',
        name: 'ACME',
        x: [
          '2024-01-01',
          '2024-01-02',
          '2024-01-03',
          '2024-01-04',
          '2024-01-05',
          '2024-01-08',
          '2024-01-09',
          '2024-01-10',
          '2024-01-11',
          '2024-01-12',
        ],
        open: [10, 12, 11, 13, 14, 13, 15, 16, 15, 17],
        high: [13, 13, 14, 15, 15, 16, 17, 17, 18, 18],
        low: [9, 10, 10, 12, 12, 12, 14, 14, 14, 16],
        close: [12, 11, 13, 14, 13, 15, 16, 15, 17, 16],
      },
    ],
    layout: {
      title: { text: 'ACME' },
      xaxis: { rangebreaks: [{ bounds: ['sat', 'mon'] }] },
    },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of ['hover', 'unhover', 'click', 'relayout', 'relayouting'] as const) {
    chart.on(name, (payload: unknown) => {
      const p = payload as { points?: Record<string, unknown>[] } & Record<string, unknown>;
      hook.events.push({
        name,
        payload: p.points
          ? {
              points: p.points.map((pt) => ({
                curveNumber: pt['curveNumber'],
                pointNumber: pt['pointNumber'],
                x: pt['x'],
                open: pt['open'],
                high: pt['high'],
                low: pt['low'],
                close: pt['close'],
              })),
            }
          : (JSON.parse(JSON.stringify({ ...p, event: undefined })) as Record<string, unknown>),
      });
    });
  }
  window.__interaction = hook;
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      chart.destroy();
    },
  };
}
