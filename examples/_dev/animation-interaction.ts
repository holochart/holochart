import { createChart } from '@mk7s/holochart';
import { gapminderFigure } from '../animation/gapminder.mts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Frames, `animate` and the controls (plan E7.4, E5.11) for the interaction suite
 * (tests/interaction/animation.spec.ts): the Gapminder-style figure with short frames (250 ms),
 * its Play / Pause update menu and year slider. Animation events and slider changes are logged to
 * `window.__interaction.events`.
 *
 * Not a visual test: its point is playback and the controls following it.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: play, pause and a slider following animate',
  description:
    'Gapminder-style frames with Play / Pause buttons and a year slider; animation events logged to window.__interaction.',
  tags: ['dev', 'chart', 'animation', 'sliders', 'updatemenus', 'interaction', 'no-visual-test'],
  size: { width: 720, height: 520 },
};

const EVENTS = [
  'animating',
  'animatingframe',
  'animated',
  'animationinterrupted',
  'transitioning',
  'transitioned',
  'transitioninterrupted',
  'sliderchange',
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, gapminderFigure({ frameDuration: 250, transitionDuration: 150 }));
  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      const p = payload as Record<string, unknown> | undefined;
      const step = p?.['step'] as { label?: unknown } | undefined;
      hook.events.push({
        name,
        payload:
          name === 'animatingframe'
            ? { name: p?.['name'] }
            : name === 'sliderchange'
              ? { label: step?.label, interaction: p?.['interaction'] }
              : null,
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
