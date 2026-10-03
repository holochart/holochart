/**
 * Keyboard stops of the hierarchy and flow traces (backlog S2.14), loaded with the chart's first
 * keyboard focus (`TraceModule.a11y`, `a11y-loader.ts`): every stop is the hover point of a drawn
 * sector, tile, node or link, so its label and announcement read what hovering it shows.
 *
 * - `sunburst`, `treemap`, `icicle`: the drawn nodes of the current `level`. ← / → move between
 *   siblings, ↑ to the parent, ↓ to the first child, Home / End to the first / last sibling; Enter
 *   drills like a click (the cursor stays on its node). Announced with {@link NODE_TEMPLATE}.
 * - `sankey`: its nodes by column, then its links. ← / → move between nodes (on a link: between
 *   the links leaving the same node), ↓ goes downstream (a node's first outgoing link, a link's
 *   target), ↑ upstream (a node's first incoming link, a link's source). Announced with
 *   {@link ITEM_TEMPLATE}.
 *
 * This file imports types only: each trace's loader hands over the functions its stops need, so
 * the chunk shares no module with the package (an app's bundler adds no shared chunk for it, and
 * a bundle with one of the traces doesn't pull in the others' code).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type {
  HoverContext,
  HoverPoint,
  KeyboardPoint,
  TraceA11yParts,
} from '@mk7s/holochart-runtime';
import type { HierNode } from './hierarchy/build.ts';
import type { HierarchyCalc } from './hierarchy/calc.ts';
import type { nodeContext, NodeContext } from './hierarchy/format.ts';
import type { SankeyCalc } from './sankey/calc.ts';
import type { hoverLabels, toHoverPoints, traceRect } from './sankey/hover.ts';
import type { modelFor } from './sankey/model.ts';
import type { sunburstGeometry, SunburstCalc } from './sunburst/geometry.ts';
import type { sectorHoverPoint } from './sunburst/hover.ts';
import type { rectGeometry, RectCalc } from './treemap/geometry.ts';
import type { rectHoverPoint } from './treemap/hover.ts';

/** The announcement of a hierarchy node: its place among its siblings and its children. */
export const NODE_TEMPLATE = '{name}: {text}, level {level}, {n} of {count}, children: {children}.';
/** The announcement of a stop that is one of several alike (a sankey node or link). */
export const ITEM_TEMPLATE = '{name}: {text}, {n} of {count}.';

/** The stops of drawn hierarchy cells: their hover points, linked along the tree. */
function tree<C extends { readonly node: HierNode; readonly hidden?: boolean }>(
  calc: HierarchyCalc,
  nodes: NodeContext | undefined,
  cells: readonly C[] | undefined,
  point: (cell: C, nodes: NodeContext) => HoverPoint,
): KeyboardPoint[] {
  if (!nodes || !cells) return [];
  const shown = cells.filter((c) => !c.hidden && c.node.generated !== 'multiple');
  const at = new Map(shown.map((c, k) => [c.node, k]));
  const drawn = (list: readonly HierNode[]): number[] => list.flatMap((n) => at.get(n) ?? []);
  return shown.map((c, k) => {
    const { node } = c;
    const parent = node.parent;
    const siblings = drawn(parent ? parent.children : [node]);
    const i = siblings.indexOf(k);
    return {
      ...point(c, nodes),
      nav: [
        siblings[i - 1] ?? k,
        siblings[i + 1] ?? k,
        (parent && at.get(parent)) ?? k,
        drawn(node.children)[0] ?? k,
        siblings[0],
        siblings.at(-1),
      ],
      say: [
        NODE_TEMPLATE,
        {
          level: `${node.depth + (calc.hierarchy?.hasMultipleRoots ? 0 : 1)}`,
          n: `${i + 1}`,
          count: `${siblings.length}`,
          children: `${node.children.length}`,
        },
      ],
    };
  });
}

/** The parts of `sunburst`. */
export const sunburst = (
  geometryOf: typeof sunburstGeometry,
  point: typeof sectorHoverPoint,
  context: typeof nodeContext,
): TraceA11yParts => ({
  sunburst: {
    keyboardPoints(calc: SunburstCalc, trace: FullTrace, ctx: HoverContext) {
      const { layout, hierarchy } = calc;
      const g = layout && geometryOf(calc, trace);
      return tree(
        calc,
        g && hierarchy && context(hierarchy, g.entry, ctx.fullLayout),
        g?.sectors,
        (s, nodes) => point(trace, s, nodes, layout!),
      );
    },
  },
});

/** The parts of `treemap` and `icicle`. */
export const rects = (
  geometryOf: typeof rectGeometry,
  point: typeof rectHoverPoint,
  context: typeof nodeContext,
): TraceA11yParts => {
  const part = {
    keyboardPoints(calc: RectCalc, trace: FullTrace, ctx: HoverContext) {
      const { layout, hierarchy } = calc;
      const g = layout && geometryOf(calc, trace);
      return tree(
        calc,
        g && hierarchy && context(hierarchy, g.entry, ctx.fullLayout),
        g?.tiles,
        (rect, nodes) => point(trace, { node: rect.node, rect, onPathbar: false }, nodes, layout!),
      );
    },
  };
  return { treemap: part, icicle: part };
};

/** The parts of `sankey`. */
export const sankey = (
  rectOf: typeof traceRect,
  model: typeof modelFor,
  labelsOf: typeof hoverLabels,
  points: typeof toHoverPoints,
): TraceA11yParts => ({
  sankey: {
    keyboardPoints(calc: SankeyCalc, trace: FullTrace, ctx: HoverContext): KeyboardPoint[] {
      if (!ctx.domain) return [];
      const rect = rectOf({ domain: ctx.domain, viewport: { size: { width: 0, height: 0 } } });
      const m = model(calc, trace, ctx.fullLayout, rect, 'current');
      const { nodes, links } = m;
      // Nodes in reading order: along the flow, then across it.
      const [a, b] = m.horizontal ? (['x0', 'y0'] as const) : (['y0', 'x0'] as const);
      const order = nodes
        .map((_, i) => i)
        .sort((p, q) => nodes[p]![a] - nodes[q]![a] || nodes[p]![b] - nodes[q]![b]);
      const stopOf = new Map(order.map((i, k) => [i, k]));
      const n = order.length;
      const from = (i: number): number[] => links.flatMap((l, k) => (l.source === i ? n + k : []));
      const into = (i: number): number[] => links.flatMap((l, k) => (l.target === i ? n + k : []));
      const stop = (
        kind: 'node' | 'link',
        i: number,
        k: number,
        group: readonly number[],
        up: number | undefined,
        down: number | undefined,
      ): KeyboardPoint[] => {
        const p = points(labelsOf(m, { kind, i }, 'closest'), ctx.height ?? 0)[0];
        const g = group.indexOf(k);
        return p
          ? [
              {
                ...p,
                nav: [
                  group[g - 1] ?? k,
                  group[g + 1] ?? k,
                  up ?? k,
                  down ?? k,
                  group[0],
                  group.at(-1),
                ],
                say: [ITEM_TEMPLATE, { n: `${g + 1}`, count: `${group.length}` }],
              },
            ]
          : [];
      };
      const all = order.map((_, k) => k);
      const out = [
        ...order.flatMap((i, k) => stop('node', i, k, all, into(i)[0], from(i)[0])),
        ...links.flatMap((l, k) =>
          stop('link', k, n + k, from(l.source), stopOf.get(l.source), stopOf.get(l.target)),
        ),
      ];
      // A part with `hoverinfo: 'skip'` has no stops: the indices no longer match, so a list.
      return out.length === n + links.length ? out : out.map(({ nav: _nav, ...p }) => p);
    },
  },
});
