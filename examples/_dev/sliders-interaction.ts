import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * A slider (plan E5.11) for the interaction suite (tests/interaction/sliders.spec.ts): ten steps
 * restyling `marker.size`, then pointer and keyboard input. `sliderchange`, `sliderstart`,
 * `sliderend`, `restyle` and `relayout` are logged to `window.__interaction.events`.
 *
 * Not a visual test: its point is the pointer and keyboard behavior.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: slider',
  description:
    'A ten-step slider restyling marker size, for pointer and keyboard tests; events logged to window.__interaction.',
  tags: ['dev', 'chart', 'sliders', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 420 },
};

const EVENTS = ['sliderchange', 'sliderstart', 'sliderend', 'restyle', 'relayout'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'markers', x: [1, 2, 3, 4], y: [2, 1, 3, 2], marker: { size: 4 } },
    ],
    layout: {
      sliders: [
        {
          currentvalue: { prefix: 'Size: ' },
          transition: { duration: 0 },
          steps: Array.from({ length: 10 }, (_, i) => ({
            label: String(4 + 2 * i),
            method: 'restyle',
            args: ['marker.size', 4 + 2 * i],
          })),
        },
      ],
    },
  });

  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      const p = payload as Record<string, unknown>;
      const step = p['step'] as { label?: unknown } | undefined;
      hook.events.push({
        name,
        payload: name.startsWith('slider')
          ? {
              active: (p['slider'] as { active?: unknown }).active,
              label: step?.label,
              interaction: p['interaction'],
              previousActive: p['previousActive'],
            }
          : JSON.parse(JSON.stringify(p)),
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
