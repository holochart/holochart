import { createChart } from '@mk7s/holochart';
import { registerScenePoints } from '../_lib/scene-points.ts';
import type { InteractionHook } from './interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3D scene interaction playground (plan E14.1c, E20.4): turntable, orbit, zoom and pan drags,
 * scroll and pinch zoom, double-click reset and the modebar's 3D buttons. Every chart event is
 * logged to `window.__interaction.events`, which tests/interaction/scene.spec.ts reads.
 *
 * The geometry is fixed: 640×400 px, 20 px margins, one scene over the whole plot area (a
 * 600×360 px rect at (20, 20)) with Plotly's default camera; the modebar is always shown.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: 3D scene',
  description:
    'Turntable, orbit, zoom and pan drags, scroll and pinch zoom, double-click reset and the 3D modebar buttons; events are logged to window.__interaction.',
  tags: ['dev', 'scene', '3d', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['doubleclick', 'relayout', 'relayouting'] as const;

export function run(el: HTMLElement): ExampleHandle {
  registerScenePoints();
  const t = Array.from({ length: 60 }, (_, i) => (i / 60) * 4 * Math.PI);
  const chart = createChart(el, {
    data: [
      {
        type: 'scenepoints',
        x: t.map((v) => Math.cos(v)),
        y: t.map((v) => Math.sin(v)),
        z: t.map((v) => v / 4),
        size: 6,
      },
    ],
    layout: { margin: { l: 20, r: 20, t: 20, b: 20 }, showlegend: false },
    config: { displayModeBar: true },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({ name, payload: JSON.parse(JSON.stringify(payload ?? null)) as unknown });
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
