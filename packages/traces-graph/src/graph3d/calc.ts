/**
 * `graph3d` calc (backlog G6, ADR-029): the model of the trace (the 2D trace's,
 * `../graph/model.ts`),
 * the layout `arrangement` names, and the node positions in the linear coordinates of the scene's
 * axes.
 *
 * ## Layout units and the scene
 *
 * With `arrangement: 'preset'`, `node.x` / `node.y` / `node.z` are data: they go through the
 * scene's axis scales (numbers, dates, categories, log), the trace gives the scene their extents
 * like `scatter3d`, and the scene's `aspectmode` shapes the box.
 *
 * A computed arrangement returns **layout units**, which are put on the axes as they are (the axes
 * are linear and hidden: `axisHints` on the module). The trace then gives the scene the same
 * extent on all three axes ({@link layoutExtremes}): the cube around the layout, as long as its
 * longest side plus the largest node. Every `aspectmode` but `'manual'` makes a cube of equal
 * extents, so one layout unit is as long along x, y and z, the layout keeps its proportions, and
 * its longest side fills the scene's box. The scene's default camera for hidden axes is placed for
 * the ball inscribed in that box, which is where a force layout is, being round. The planes of a
 * layered arrangement are a box themselves, and their corners would be out of view from there: a
 * layered arrangement gets the cube around a ball that holds its planes instead.
 *
 * A node is not drawn (`hidden`) when it has no position under `'preset'`, when the layout left it
 * out or returned no finite position for it, or when its group is hidden through the legend
 * (`layout.hiddenlabels`). Its links are not drawn either. Hidden nodes still take part in the
 * layout and in the extents, so hiding a group does not move the rest.
 */
import { isArrayLike, type FullTrace, type Scale } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import {
  sceneExtent,
  sceneOf,
  sceneScales,
  type SceneCalc,
  type SceneExtremes,
} from '@mk7s/holochart-traces-3d';
import type { GraphCalc } from '../graph/calc.ts';
import { buildGraphModel, layoutGraphOf, type GraphModel } from '../graph/model.ts';
import { forceOptionsOf } from '../graph/options.ts';
import { circularLayout } from '../layout/circular.ts';
import { resolveCustomLayout } from '../layout/registry.ts';
import type { LayeredRanker } from '../layout/layered/options.ts';
import type { LayoutGraph, LayoutResult } from '../layout/types.ts';
import { GRAPH3D_ARRANGEMENTS, type Graph3dArrangement } from './attributes.ts';
import { planeOutlines } from './geometry.ts';
import { forceLayout3d, layeredLayout3d } from './layout.ts';

/** The planes of `arrangement: 'layered'`. */
export interface Graph3dPlanes {
  /** The axis they are stacked along: 0 x, 1 y, 2 z. */
  readonly axis: 0 | 1 | 2;
  /** The coordinate of each plane along the axis, by rank. */
  readonly at: Float64Array;
  /** The rank of each node. */
  readonly rank: Int32Array;
}

/** @experimental */
export interface Graph3dCalc extends SceneCalc {
  readonly model: GraphModel;
  /** Node count (`model.nodes`). */
  readonly length: number;
  /** Node centers in linear coordinates; `NaN` for a node without a position. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** 1 where the node is not drawn (see the module comment). */
  readonly hidden: Uint8Array;
  /** The arrangement that placed the nodes (`'circular'` when a layout is missing or threw). */
  readonly arrangement: Graph3dArrangement | 'circular';
  /** Positions are the figure's data on the scene's axes (`arrangement: 'preset'`). */
  readonly preset: boolean;
  /** The links a layered arrangement turned around to break cycles. */
  readonly reversed: Uint8Array | undefined;
  /** Group indices hidden through the legend. */
  readonly hiddenGroups: ReadonlySet<number>;
  /** The planes of a layered arrangement. */
  readonly planes: Graph3dPlanes | undefined;
}

/**
 * A graph3d calc as the 2D trace's helpers take it (`../graph/style.ts`, `hover.ts`, `legend.ts`,
 * `describe.ts`). Those reused here read the model and the hidden groups, which are the same in
 * both; their parameter is the whole 2D calc, whose other fields (routes, tree, guides, …) a 3D
 * graph does not have.
 */
export function as2d(calc: Graph3dCalc): GraphCalc {
  return calc as unknown as GraphCalc;
}

type Container = Readonly<Record<string, unknown>>;

function container(trace: Container, key: string): Container {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : {};
}

/** The arrangement of a defaulted trace. */
export function arrangement3dOf(trace: Container): Graph3dArrangement {
  const a = trace['arrangement'];
  return (GRAPH3D_ARRANGEMENTS as readonly unknown[]).includes(a)
    ? (a as Graph3dArrangement)
    : 'force';
}

/** Positions along one axis, one per node; `NaN` where there is none. `scale`: data → linear. */
function positions(values: unknown, nodes: number, scale: Scale | undefined): Float64Array {
  const out = new Float64Array(nodes).fill(NaN);
  if (!isArrayLike(values) || typeof values === 'string') return out;
  const given = values as ArrayLike<unknown>;
  const n = Math.min(nodes, given.length);
  if (scale) {
    const linear = scale.d2lArray(given);
    for (let i = 0; i < n; i++) out[i] = Number.isFinite(linear[i]) ? linear[i]! : NaN;
    return out;
  }
  for (let i = 0; i < n; i++) {
    const v = given[i];
    const l = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
    out[i] = Number.isFinite(l) ? l : NaN;
  }
  return out;
}

/** Group indices whose name is in `layout.hiddenlabels`. */
function hiddenGroupsOf(model: GraphModel, hiddenlabels: unknown): Set<number> {
  const out = new Set<number>();
  if (!isArrayLike(hiddenlabels) || model.groupNames.length === 0) return out;
  const hidden = new Set(Array.from(hiddenlabels as ArrayLike<unknown>, String));
  model.groupNames.forEach((name, g) => {
    if (hidden.has(name)) out.add(g);
  });
  return out;
}

let warnedThrow = false;

interface Placed {
  readonly result: LayoutResult;
  readonly arrangement: Graph3dCalc['arrangement'];
  readonly planes?: Graph3dPlanes;
}

/** Run the layout of `arrangement`; one that throws is reported once and replaced by a circle. */
function place(trace: FullTrace, graph: LayoutGraph, arrangement: Graph3dArrangement): Placed {
  try {
    // The trace's `force` container as the engine's options: the 2D trace's mapping.
    const force = forceOptionsOf(trace, graph.nodes);
    if (arrangement === 'force') return { result: forceLayout3d(graph, force), arrangement };
    if (arrangement === 'layered') {
      const layered = container(trace, 'layered');
      const axis = layered['axis'] === 'x' ? 0 : layered['axis'] === 'y' ? 1 : 2;
      const result = layeredLayout3d(graph, {
        axis,
        ...(typeof layered['ranksep'] === 'number' ? { rankSep: layered['ranksep'] } : {}),
        ...(typeof layered['ranker'] === 'string'
          ? { ranker: layered['ranker'] as LayeredRanker }
          : {}),
        force,
      });
      return { result, arrangement, planes: { axis, at: result.planes, rank: result.rank } };
    }
    // 'custom': a registered layout (a missing one is drawn as a circle, with the 2D warning).
    const custom = container(trace, 'custom');
    const name = custom['name'];
    const resolved = resolveCustomLayout(typeof name === 'string' ? name : undefined);
    return {
      result: resolved.layout(graph, resolved.fallback ? undefined : custom['options']),
      arrangement: resolved.fallback ? 'circular' : 'custom',
    };
  } catch (error) {
    if (!warnedThrow) {
      warnedThrow = true;
      console.warn("[holochart] graph3d: the layout threw; drawn with 'circular'.", error);
    }
    return { result: circularLayout(graph, undefined), arrangement: 'circular' };
  }
}

/**
 * What a computed arrangement gives the scene's autorange: the same extent on every axis, with
 * room for the largest node (`radius`). Without `box`, the cube around the finite positions, as
 * long as their longest side. With `box` (a layout that fills its box to the corners; its points
 * are held too, those that are not finite skipped), the cube around a ball that holds every
 * point: Ritter's, across the two points found farthest apart and grown to hold those left out
 * (within a few percent of the smallest ball, in two passes), or the ball around the middle of
 * the box, when that one is smaller.
 */
export function layoutExtremes(
  x: Float64Array,
  y: Float64Array,
  z: Float64Array,
  radius: number,
  box?: { readonly x: Float64Array; readonly y: Float64Array; readonly z: Float64Array },
): SceneExtremes {
  const extents = [sceneExtent(x), sceneExtent(y), sceneExtent(z)];
  if (extents.some((e) => e === undefined)) return {};
  let [cx, cy, cz] = extents.map((e) => (e![0] + e![1]) / 2) as [number, number, number];
  let reach = 0;
  if (!box) {
    for (const e of extents) reach = Math.max(reach, (e![1] - e![0]) / 2);
  } else {
    const sets = [{ x, y, z }, box];
    /** The point farthest from `(px, py, pz)`, and how far. */
    const farthest = (px: number, py: number, pz: number): [number, number, number, number] => {
      let best: [number, number, number, number] = [px, py, pz, 0];
      for (const points of sets) {
        for (let i = 0; i < points.x.length; i++) {
          const d = Math.hypot(points.x[i]! - px, points.y[i]! - py, points.z[i]! - pz);
          if (d > best[3]) best = [points.x[i]!, points.y[i]!, points.z[i]!, d];
        }
      }
      return best;
    };
    // The ball around the middle of the box.
    reach = farthest(cx, cy, cz)[3];
    // Ritter's ball, from the point farthest from the first corner of the box.
    const a = farthest(extents[0]![0], extents[1]![0], extents[2]![0]);
    const b = farthest(a[0], a[1], a[2]);
    let [rx, ry, rz] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    let r = b[3] / 2;
    for (const points of sets) {
      for (let i = 0; i < points.x.length; i++) {
        const d = Math.hypot(points.x[i]! - rx, points.y[i]! - ry, points.z[i]! - rz);
        if (!(d > r)) continue;
        // Grown to touch the point, still touching where it did on the far side.
        const grown = (r + d) / 2;
        const t = (grown - r) / d;
        rx += (points.x[i]! - rx) * t;
        ry += (points.y[i]! - ry) * t;
        rz += (points.z[i]! - rz) * t;
        r = grown;
      }
    }
    // Rounding in the passes above: every point is held for certain.
    r = farthest(rx, ry, rz)[3];
    if (r < reach) [cx, cy, cz, reach] = [rx, ry, rz, r];
  }
  let half = reach + (Number.isFinite(radius) && radius > 0 ? radius : 0);
  // One node: any extent will do, as long as it is one (the scene pads a single value itself).
  if (!(half > 0)) half = 1;
  return { x: [cx - half, cx + half], y: [cy - half, cy + half], z: [cz - half, cz + half] };
}

export function calcGraph3d(trace: FullTrace, ctx: CalcContext): Graph3dCalc {
  const model = buildGraphModel(trace);
  const n = model.nodes;
  const node = container(trace, 'node');
  const asked = arrangement3dOf(trace);
  // Data on the scene's axes with 'preset'; layout units (plain numbers) for the pins of a layout.
  const scales = asked === 'preset' ? sceneScales(ctx.fullLayout, sceneOf(trace)) : undefined;
  const gx = positions(node['x'], n, scales?.x);
  const gy = positions(node['y'], n, scales?.y);
  const gz = positions(node['z'], n, scales?.z);

  const hiddenGroups = hiddenGroupsOf(model, ctx.fullLayout['hiddenlabels']);
  const hidden = new Uint8Array(n);
  let x = gx;
  let y = gy;
  let z = gz;
  let arrangement: Graph3dCalc['arrangement'] = 'preset';
  let placed: Placed | undefined;
  if (asked !== 'preset') {
    placed = place(trace, { ...layoutGraphOf(model, gx, gy), z: gz }, asked);
    arrangement = placed.arrangement;
    const r = placed.result;
    x = new Float64Array(n);
    y = new Float64Array(n);
    z = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const xi = r.x[i];
      const yi = r.y[i];
      // A layout without a third dimension (a custom one, the stand-in circle) is flat.
      const zi = r.z ? r.z[i] : 0;
      const ok =
        Number.isFinite(xi) && Number.isFinite(yi) && Number.isFinite(zi) && r.hidden?.[i] !== 1;
      x[i] = ok ? xi! : NaN;
      y[i] = ok ? yi! : NaN;
      z[i] = ok ? zi! : NaN;
    }
  }
  let radius = 0;
  for (let i = 0; i < n; i++) {
    const at = Number.isFinite(x[i]) && Number.isFinite(y[i]) && Number.isFinite(z[i]);
    if (!at) x[i] = y[i] = z[i] = NaN;
    if (!at || hiddenGroups.has(model.group[i]!)) hidden[i] = 1;
    if (at && model.halfWidth[i]! > radius) radius = model.halfWidth[i]!;
  }
  const preset = arrangement === 'preset';
  // Planes are a box, and their outlines are part of the picture (see the module comment).
  const planes = placed?.planes;
  const none = new Float64Array(0);
  const box = planes
    ? ((container(trace, 'layered')['showplanes'] !== false
        ? planeOutlines({ x, y, z }, planes)
        : undefined) ?? { x: none, y: none, z: none })
    : undefined;
  return {
    model,
    length: n,
    x,
    y,
    z,
    hidden,
    arrangement,
    preset,
    reversed: placed?.result.reversed,
    hiddenGroups,
    planes,
    sceneExtremes: preset
      ? { x: sceneExtent(x), y: sceneExtent(y), z: sceneExtent(z) }
      : layoutExtremes(x, y, z, radius, box),
  };
}
