import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { logHierarchyEvents, TREE } from './interaction-treemap.ts';

/**
 * Icicle drill-down playground (plan E13.4, E20.4): hover cells, click one to drill into it, click
 * the entry or the path bar to go back up; an `icicleclick` or `click` listener returning `false`
 * cancels. Events are logged to `window.__interaction.events` for tests/interaction/icicle.spec.ts.
 *
 * The geometry is fixed: 640×400 px, 20 px margins (a 600×360 px domain at (20, 20)), the treemap
 * playground's tree with `total` values, three 200 px columns from the left: Eve (x 20–220), then
 * Seth (y 20–200), Cain (200–290), Awan (290–344) and Abel (344–380), then Enos (y 20–140), Noam and
 * Enoch. Leaves are opaque; the path bar (18 px) sits at y 0–18 once drilled in.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: icicle drill-down',
  description:
    'Hover cells, click to drill in and click the entry or path bar to go up, with an animated transition; events are logged to window.__interaction.',
  tags: ['dev', 'icicle', 'hierarchical', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [{ type: 'icicle', ...TREE, leaf: { opacity: 1 } }],
    layout: { margin: { l: 20, r: 20, t: 20, b: 20 } },
  });
  return logHierarchyEvents(chart);
}
