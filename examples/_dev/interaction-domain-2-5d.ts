import { createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { logHierarchyEvents, TREE } from './interaction-treemap.ts';

/**
 * Domain traces in 2.5D playground (plan E8.9, E9.12, E20.4): a tilted, extruded pie and a tilted
 * treemap in terraces, side by side. Hover and click the slices (on their tops or their front
 * walls) and the tiles; a click on a tile drills down, animated. Every chart event is logged to
 * `window.__interaction.events`; `window.__interaction.toScreen(trace, x, y, z)` gives the
 * container px where the trace draws its flat container point `(x, y)` raised `z` px (on a slice
 * or tile top: its height), which tests/interaction/domain-2-5d.spec.ts uses to aim.
 *
 * The geometry is fixed: 640×400 px, 20 px margins. The pie (`domain.x` [0, 0.45]: a 270×360 px
 * rect at (20, 20)) is centered at (155, 200) with radius 135; its slices A–D (40, 30, 20, 10, no
 * sort) run clockwise from 12 o'clock (A 0–144°, B 144–252°, C 252–324°, D 324–360°); `depth`
 * 30 px, `tilt` 45°. The treemap (`domain.x` [0.55, 1]: 270×360 px at (350, 20)) is the treemap
 * playground's family tree (`dice`, 20 px headers, no padding), `depth` 12 px per level, `tilt`
 * 30°: Seth spans x 350–485 below Eve's header (y 20–40), its tiles Enos (350–440) and Noam
 * (440–485) below its own header (y 40–60); Eve's top is 12 px up, Seth's 24, Enos' 36.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: pie and treemap in 2.5D',
  description:
    'Hover and click a tilted 3D pie and a tilted treemap in terraces (drill-down included); events are logged to window.__interaction.',
  tags: ['dev', 'pie', 'treemap', 'depth', '2.5d', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

/** What the example adds to the hierarchy playgrounds' hook. */
export interface DomainInteractionHook {
  chart: Chart;
  events: { name: string; payload: unknown }[];
  toScreen(trace: number, x: number, y: number, z: number): { x: number; y: number };
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'pie',
        labels: ['A', 'B', 'C', 'D'],
        values: [40, 30, 20, 10],
        sort: false,
        direction: 'clockwise',
        textinfo: 'none',
        domain: { x: [0, 0.45] },
        depth: 30,
        tilt: 45,
      },
      {
        type: 'treemap',
        ...TREE,
        domain: { x: [0.55, 1] },
        tiling: { packing: 'dice', pad: 0 },
        marker: { ...TREE.marker, pad: { t: 20, l: 0, r: 0, b: 0 } },
        depth: 12,
        tilt: 30,
      },
    ],
    layout: { margin: { l: 20, r: 20, t: 20, b: 20 }, showlegend: false },
  });
  const handle = logHierarchyEvents(chart);
  // The traces' cameras, as the 2.5D code builds them (render's lazily loaded `DomainCamera`).
  let module: Awaited<ReturnType<typeof render.loadExtrusionModule>> | undefined;
  const cameras = render.loadExtrusionModule().then((m) => void (module = m));
  const hook = window.__interaction as unknown as DomainInteractionHook;
  hook.toScreen = (trace, x, y, z) => {
    if (!module) throw new Error('2.5D code not loaded');
    const t = chart.fullData[trace] as unknown as { tilt: number; perspective: number };
    const layout = (chart.getCalcdata(trace) as { layout: Rect & { domain?: Rect } }).layout;
    const rect = layout.domain ?? layout;
    const h = chart.size.height;
    const camera = new module.DomainCamera(rect, h, t.tilt, t.perspective);
    const [sx, sy] = camera.toScreen(x, h - y, z);
    return { x: sx, y: h - sy };
  };
  return { ...handle, ready: Promise.all([handle.ready, cameras]).then(() => undefined) };
}
