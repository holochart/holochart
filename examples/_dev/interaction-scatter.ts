import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Interaction playground (plan E6.1–E6.4, E5.7): hover labels, box zoom, pan, box / lasso
 * selection, click and double-click on a small deterministic scatter. Every chart event is logged
 * to `window.__interaction.events`, which the Playwright interaction suite (tests/interaction,
 * E20.4) reads; try `__interaction.chart.setDragmode('lasso')` in the console.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: scatter',
  description:
    'Hover, zoom, pan, select, lasso, click and double-click on a 3×10 grid; events are logged to window.__interaction.',
  tags: ['dev', 'chart', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

/** What the example exposes to the interaction tests. */
export interface InteractionHook {
  chart: Chart;
  events: { name: string; payload: unknown }[];
}

declare global {
  interface Window {
    __interaction?: InteractionHook;
  }
}

const EVENTS = [
  'hover',
  'unhover',
  'click',
  'doubleclick',
  'relayout',
  'relayouting',
  'selecting',
  'selected',
  'deselect',
] as const;

/** Keep what tests assert on (points without their trace objects) so payloads stay small. */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p['points'])) return payload;
  return {
    ...p,
    event: undefined,
    points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
      curveNumber: pt['curveNumber'],
      pointNumber: pt['pointNumber'],
      x: pt['x'],
      y: pt['y'],
      customdata: pt['customdata'],
    })),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 10 }, (_, i) => i);
  const chart = createChart(el, {
    data: [0, 1, 2].map((k) => ({
      type: 'scatter',
      mode: 'markers',
      name: ['low', 'mid', 'high'][k],
      x,
      y: x.map((v) => v * 10 + k * 3),
      customdata: x.map((v) => `p${k}-${v}`),
      marker: { size: 10 },
      hovertemplate: 'x=%{x} y=%{y:.1f} %{customdata}<extra>%{fullData.name}</extra>',
    })),
    layout: {
      margin: { l: 60, r: 20, t: 20, b: 50 },
      xaxis: { range: [-1, 10] },
      yaxis: { range: [-10, 100] },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#e5ecf6',
      showlegend: false,
    },
    config: { scrollZoom: true },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({ name, payload: summarize(payload) });
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
