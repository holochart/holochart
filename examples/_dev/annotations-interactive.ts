import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Annotation pointer input (plan E5.4): drag a text-only annotation (`edits.annotationPosition`),
 * drag the text of an arrow annotation to move its tail (`edits.annotationTail`) or its head to
 * move the anchor, click a `captureevents` annotation (`clickannotation`), and click data points
 * to toggle `clicktoshow` annotations. Chart events are logged to `window.__interaction.events`
 * for the interaction suite (tests/interaction/annotations.spec.ts).
 *
 * Layout: one trace at (v, 10·v), x in [-1, 10], y in [-10, 100]; boxes have fixed sizes and
 * flat colors so the tests can sample their pixels away from the text.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: annotations',
  description:
    'Drag annotation text, tails and heads, click a captureevents annotation and toggle clicktoshow annotations; events are logged to window.__interaction.',
  tags: ['dev', 'chart', 'annotations', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['relayout', 'relayouting', 'click', 'clickannotation'] as const;

/** Drop DOM events and trace objects so payloads stay small and JSON-serializable. */
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
  const x = Array.from({ length: 10 }, (_, i) => i);
  const white = { color: '#ffffff' };
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x,
        y: x.map((v) => v * 10),
        marker: { size: 10, color: '#80838f' },
      },
    ],
    layout: {
      xaxis: { range: [-1, 10] },
      yaxis: { range: [-10, 100] },
      showlegend: false,
      annotations: [
        // 0: text only, dragging it moves x / y.
        {
          x: 1,
          y: 80,
          text: 'drag',
          showarrow: false,
          width: 80,
          height: 30,
          bgcolor: '#ea2a37',
          font: white,
        },
        // 1: arrow with a pixel tail; the text moves the tail, the head moves x / y.
        {
          x: 7,
          y: 10,
          ax: -60,
          ay: -50,
          text: 'tail',
          width: 60,
          height: 24,
          bgcolor: '#5e74d5',
          font: white,
        },
        // 2: emits clickannotation.
        {
          x: 1,
          y: 40,
          text: 'click me',
          showarrow: false,
          captureevents: true,
          bgcolor: '#cc540a',
          font: white,
        },
        // 3, 4: shown / hidden by clicks on the points below them.
        {
          x: 3,
          y: 30,
          yshift: 25,
          text: 'onoff',
          showarrow: false,
          visible: false,
          clicktoshow: 'onoff',
          width: 60,
          height: 24,
          bgcolor: '#118e36',
          font: white,
        },
        {
          x: 6,
          y: 60,
          yshift: 25,
          text: 'onout',
          showarrow: false,
          visible: false,
          clicktoshow: 'onout',
          width: 60,
          height: 24,
          bgcolor: '#9962c0',
          font: white,
        },
      ],
    },
    config: { edits: { annotationPosition: true, annotationTail: true } },
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
