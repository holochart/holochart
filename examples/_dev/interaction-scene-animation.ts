import { createChart } from '@mk7s/holochart';
import { registerScenePoints } from '../_lib/scene-points.ts';
import type { InteractionHook } from './interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Camera animation playground (plan E7.5): "Tour" flies the camera through four views with
 * `chart.animateCamera` (each orbiting the scene, then committing `scene.camera` with a
 * `relayout`); "Spin" toggles `scene.autorotate` (15°/s about z, paused while you drag, carrying on
 * from where you let go). Drag the scene during a flight to interrupt it. With
 * `prefers-reduced-motion: reduce` flights jump and the scene doesn't spin. Events are logged to
 * `window.__interaction.events` for tests/interaction/scene-animation.spec.ts.
 *
 * The geometry is fixed: 640×400 px, 20 px margins, one scene over the plot area with Plotly's
 * default camera. Not a visual test: it moves.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: 3D camera animation',
  description:
    'animateCamera tours and scene.autorotate, interrupted by drags; events are logged to window.__interaction.',
  tags: ['dev', 'scene', '3d', 'camera', 'animation', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['relayout', 'relayouting'] as const;

const VIEWS = [
  { eye: { x: 2, y: 0, z: 0.4 } },
  { eye: { x: 0, y: -2, z: 1.2 } },
  { eye: { x: -1.4, y: 1.4, z: 0.2 }, center: { x: 0, y: 0, z: -0.2 } },
  { eye: { x: 1.25, y: 1.25, z: 1.25 }, center: { x: 0, y: 0, z: 0 } },
];

export function run(el: HTMLElement): ExampleHandle {
  registerScenePoints();
  const t = Array.from({ length: 90 }, (_, i) => (i / 90) * 6 * Math.PI);
  const chart = createChart(el, {
    data: [
      {
        type: 'scenepoints',
        x: t.map((v) => Math.cos(v)),
        y: t.map((v) => Math.sin(v)),
        z: t.map((v) => v / 6 - 1.5),
        size: 6,
      },
    ],
    layout: { margin: { l: 20, r: 20, t: 20, b: 20 }, showlegend: false },
    config: { displayModeBar: false },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({ name, payload: JSON.parse(JSON.stringify(payload ?? null)) as unknown });
    });
  }
  window.__interaction = hook;

  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;left:24px;top:24px;display:flex;gap:6px';
  const button = (label: string, onClick: () => void): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.font = '12px sans-serif';
    b.addEventListener('click', onClick);
    bar.appendChild(b);
  };
  button('Tour', () => {
    void (async () => {
      try {
        for (const view of VIEWS) await chart.animateCamera(view, { duration: 1200 });
      } catch {
        // Interrupted by a drag: the tour stops there.
      }
    })();
  });
  let spinning = false;
  button('Spin', () => {
    spinning = !spinning;
    void chart.relayout({ 'scene.autorotate': spinning ? { speed: 15 } : { speed: 0 } });
  });
  if (new URLSearchParams(location.search).get('test') !== '1') el.appendChild(bar);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      bar.remove();
      chart.destroy();
    },
  };
}
