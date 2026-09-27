import { createChart, symbols } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Hover on custom marker symbols and image sprites (plan E8.11): a trace of registered SVG-path
 * symbols and a trace of `marker.image` sprites, hovered by the interaction suite
 * (tests/interaction/custom-markers.spec.ts). Events are logged to `window.__interaction`.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: custom markers',
  description:
    'Hover a registered SVG-path symbol trace and an image-sprite trace; events are logged to window.__interaction.',
  tags: ['dev', 'chart', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['hover', 'unhover', 'click'] as const;

const DOT = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#118e36"/></svg>',
)}`;

function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p: Record<string, unknown> = { ...(payload as Record<string, unknown>), event: undefined };
  if (Array.isArray(p['points'])) {
    p['points'] = (p['points'] as Record<string, unknown>[]).map((pt) => ({
      curveNumber: pt['curveNumber'],
      pointNumber: pt['pointNumber'],
      x: pt['x'],
      y: pt['y'],
    }));
  }
  return p;
}

export function run(el: HTMLElement): ExampleHandle {
  symbols.register('hover-tri', { path: 'M12 1L23 23H1Z' });
  const x = Array.from({ length: 10 }, (_, i) => i);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'symbols',
        x,
        y: x.map((v) => v * 10),
        marker: { size: 18, symbol: 'hover-tri', color: '#ea2a37' },
        hovertemplate: 'tri %{x}<extra>%{fullData.name}</extra>',
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'images',
        x,
        y: x.map((v) => v * 10 + 30),
        marker: { size: 18, image: DOT },
        hovertemplate: 'img %{x}<extra>%{fullData.name}</extra>',
      },
    ],
    layout: { xaxis: { range: [-1, 10] }, yaxis: { range: [-10, 130] }, showlegend: false },
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
