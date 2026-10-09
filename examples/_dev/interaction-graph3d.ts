import { createChart, sceneFor, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { InteractionHook } from './interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Interaction playground for the `graph3d` trace (backlog G6): hover on nodes and links through
 * the scene's GPU picking, click, orbit and the legend on a small directed graph at whole-number
 * positions in space. Every chart event is logged to `window.__interaction.events`, which the
 * Playwright interaction suite reads (tests/interaction/graph3d.spec.ts);
 * `window.__interaction.project(x, y, z)` gives the container px of a position for the current
 * camera.
 *
 * The geometry is fixed: 640×400 px, 20 px margins, one scene with a fixed camera; five nodes
 * (A, B, C on z = 0; D, E on z = 2) in two groups and four links (A → B, B → C, A → D, D → E).
 * Nodes are spheres and links lines; with `?parts=mesh` nodes are sprites and links tubes. With
 * `?links=more` there are two more links: B → A, which runs against A → B, and C → C.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: graph3d',
  description:
    'Hover nodes and links (GPU picking), click and orbit a five-node graph in a 3D scene; events are logged to window.__interaction.',
  tags: ['dev', 'chart', 'interaction', 'graph3d', '3d', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['hover', 'unhover', 'click', 'relayout'] as const;

/** What this example adds to the interaction hook. */
export interface Graph3dHook extends InteractionHook {
  /** Container px of a position on the scene's axes for the current camera. */
  project(x: number, y: number, z: number): { x: number; y: number };
}

/** Keep what tests assert on (points without their trace objects) so payloads stay small. */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p['points'])) {
    // A relayout: its keys are enough.
    return { keys: Object.keys(p) };
  }
  const end = (v: unknown): unknown => (v as { label?: unknown } | undefined)?.label;
  return {
    points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
      curveNumber: pt['curveNumber'],
      pointNumber: pt['pointNumber'],
      kind: pt['kind'],
      label: pt['label'],
      degree: pt['degree'],
      group: pt['group'],
      z: pt['z'],
      source: end(pt['source']),
      target: end(pt['target']),
      value: pt['value'],
    })),
  };
}

function projector(chart: Chart): Graph3dHook['project'] {
  return (x, y, z) => {
    const scene = sceneFor(chart.fullLayout!, chart.fullData[0]!)!;
    const w = scene.toWorld(x, y, z);
    const s = scene.project(w[0], w[1], w[2]);
    return { x: s.x, y: s.y };
  };
}

/** Label, group, x, y, z. */
export const NODES: readonly (readonly [string, string, number, number, number])[] = [
  ['A', 'low', 0, 0, 0],
  ['B', 'low', 2, 0, 0],
  ['C', 'low', 2, 2, 0],
  ['D', 'high', 0, 0, 2],
  ['E', 'high', 0, 2, 2],
];

/** Source, target, value. */
export const LINKS: readonly (readonly [number, number, number])[] = [
  [0, 1, 5],
  [1, 2, 1],
  [0, 3, 2],
  [3, 4, 3],
];

/** The links of `?links=more`: one against A → B, and one from C to itself. */
export const MORE_LINKS: readonly (readonly [number, number, number])[] = [
  [1, 0, 4],
  [2, 2, 6],
];

export function run(el: HTMLElement): ExampleHandle {
  // `?parts=mesh` draws the other primitives: sprites for the nodes, tubes for the links.
  const query = new URLSearchParams(window.location.search);
  const mesh = query.get('parts') === 'mesh';
  const links = query.get('links') === 'more' ? [...LINKS, ...MORE_LINKS] : LINKS;
  const chart = createChart(el, {
    data: [
      {
        type: 'graph3d',
        name: 'net',
        node: {
          label: NODES.map((n) => n[0]),
          group: NODES.map((n) => n[1]),
          x: NODES.map((n) => n[2]),
          y: NODES.map((n) => n[3]),
          z: NODES.map((n) => n[4]),
          size: 26,
          textposition: 'none',
          render: mesh ? 'sprite' : 'sphere',
        },
        link: {
          source: links.map((l) => l[0]),
          target: links.map((l) => l[1]),
          value: links.map((l) => l[2]),
          width: mesh ? 6 : 2,
          render: mesh ? 'tube' : 'line',
          arrow: { end: true },
        },
      },
    ],
    layout: {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      legend: { x: 1, xanchor: 'right', y: 1 },
      scene: { camera: { eye: { x: 1.6, y: -1.6, z: 0.9 } } },
    },
    config: { displayModeBar: false },
  });
  const hook: Graph3dHook = { chart, events: [], project: projector(chart) };
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
