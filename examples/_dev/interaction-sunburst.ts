import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from './interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Sunburst drill-down playground (plan E13.2, E20.4): hover sectors, click one to drill into it
 * (an animated zoom, `level` set by a GUI restyle), click the center to go back up; a
 * `sunburstclick` or `click` listener returning `false` cancels the drill. Every chart event is
 * logged to `window.__interaction.events`, which tests/interaction/sunburst.spec.ts reads.
 *
 * The geometry is fixed so the tests can find sectors from the public figure: 640×400 px, 20 px
 * margins, one sunburst over the whole plot area (a 600×360 px domain: radius 180 px around
 * (320, 200)), Plotly's Eve tree (three levels: a 60 px disc and two 60 px rings), sectors
 * counterclockwise from 3 o'clock, explicit first-level colors and opaque leaves.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: sunburst drill-down',
  description:
    'Hover sectors, click to drill in and click the center to go up, with an animated transition; events are logged to window.__interaction.',
  tags: ['dev', 'sunburst', 'hierarchical', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['hover', 'unhover', 'click', 'sunburstclick', 'restyle'] as const;

/** Keep what tests assert on (points without their trace objects). */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p['points'])) {
    const keys = [
      'curveNumber',
      'pointNumber',
      'label',
      'value',
      'id',
      'parent',
      'currentPath',
      'entry',
      'root',
      'percentParent',
      'percentEntry',
      'percentRoot',
    ];
    return {
      ...(p['nextLevel'] !== undefined ? { nextLevel: p['nextLevel'] } : {}),
      points: (p['points'] as Record<string, unknown>[]).map((pt) =>
        Object.fromEntries(keys.filter((k) => pt[k] !== undefined).map((k) => [k, pt[k]])),
      ),
    };
  }
  return JSON.parse(JSON.stringify(p)) as unknown;
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'sunburst',
        labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
        parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
        values: [10, 14, 12, 10, 2, 6, 6, 4, 4],
        marker: {
          colors: ['#ffffff', '#ea2a37', '#5e74d5', '', '', '#118e36', '#cc540a', '', '#8c3bd1'],
        },
        leaf: { opacity: 1 },
        textinfo: 'label',
        hoverinfo: 'label+value+percent parent',
      },
    ],
    layout: { margin: { l: 20, r: 20, t: 20, b: 20 } },
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
