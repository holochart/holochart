/**
 * The drawn links of a `graph` trace, built once and shared by the view and by hover (backlog G1,
 * ADR-029): the geometry for the current axis scales, and the per-link widths, curvatures and
 * arrowhead sizes it was built from. One entry per calc; an entry is built again for another
 * trace object (a `plot` edit), for scales its geometry no longer fits (see `geometryStale`), for
 * another frame of the calc (`frame.ts`: positions that move while a layout settles) and for
 * another level of detail (`lod.ts`: without arrowheads, with smaller nodes).
 *
 * A frame that differs from the one before by a few nodes (a node dragged: `GraphFrame.moved`)
 * is not built again: the vertices of those nodes' links are written over the old ones
 * (`patchLinkGeometry`), which on a large graph is the difference between a frame and a stutter.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { GraphCalc } from './calc.ts';
import { frameOf, nodeScaleOf } from './frame.ts';
import { adjacencyOf } from './highlight.ts';
import {
  buildLinkGeometry,
  geometryStale,
  patchLinkGeometry,
  type LinkGeometry,
  type LinkGeometryInput,
} from './geometry.ts';
import { nodePlacements } from './labels.ts';
import { lodOf } from './lod.ts';
import { arrowSizes, linkCurves, linkWidths, part } from './style.ts';

/** The links of a calc as they are drawn. */
export interface DrawnLinks {
  readonly trace: FullTrace;
  readonly geometry: LinkGeometry;
  /** Width of each kept link in px. */
  readonly widths: Float32Array;
  /** The frame of the calc the geometry was built for (`GraphFrame.stamp`). */
  readonly stamp: number;
  /** The level of detail it was built for: with arrowheads, and the factor on the node sizes. */
  readonly arrows: boolean;
  readonly nodeScale: number;
  /** The routes and the hidden nodes of that frame (the arrays themselves). */
  readonly routes: unknown;
  readonly hidden: Uint8Array;
}

const DRAWN = new WeakMap<GraphCalc, DrawnLinks>();

/** Whether the trace draws arrowheads, and at which end. */
export function arrowsOf(trace: FullTrace): { end: boolean; start: boolean } {
  const arrow = part(part(trace, 'link'), 'arrow');
  return { end: arrow['end'] === true, start: arrow['start'] === true };
}

/** The drawn links of `calc`, if they were built and still fit the scales. */
export function currentLinks(
  calc: GraphCalc,
  trace: FullTrace,
  scaleX: number,
  scaleY: number,
): DrawnLinks | undefined {
  const hit = DRAWN.get(calc);
  const lod = lodOf(calc);
  return hit &&
    hit.trace === trace &&
    hit.stamp === frameOf(calc).stamp &&
    hit.arrows === lod.arrows &&
    hit.nodeScale === lod.nodeScale &&
    !geometryStale(hit.geometry, scaleX, scaleY)
    ? hit
    : undefined;
}

/**
 * The drawn links of `calc` for the given axis scales (px per linear unit, signed), built when
 * there are none that fit.
 */
export function drawnLinks(
  calc: GraphCalc,
  trace: FullTrace,
  scaleX: number,
  scaleY: number,
): DrawnLinks {
  const hit = currentLinks(calc, trace, scaleX, scaleY);
  if (hit) return hit;
  const { model } = calc;
  const previous = DRAWN.get(calc);
  // Widths only change with the trace: a rebuild for a zoom keeps them.
  const widths = previous?.trace === trace ? previous.widths : linkWidths(model, trace);
  const arrows = arrowsOf(trace);
  const placement = model.box
    ? undefined
    : nodePlacements(String(part(trace, 'node')['textposition'] ?? 'auto'), calc, scaleX, scaleY);
  const frame = frameOf(calc);
  const lod = lodOf(calc);
  // Nodes drawn smaller than their size have smaller outlines: boxes that shrink with the axes
  // (see `nodeScaleOf`), markers under the level of detail.
  const k = nodeScaleOf(calc, scaleX, scaleY) * lod.nodeScale;
  const input: LinkGeometryInput = {
    x: frame.x,
    y: frame.y,
    hidden: frame.hidden,
    skip: calc.omitted,
    source: model.source,
    target: model.target,
    halfWidth: k === 1 ? model.halfWidth : model.halfWidth.map((v) => v * k),
    halfHeight: k === 1 ? model.halfHeight : model.halfHeight.map((v) => v * k),
    box: model.box,
    curve: linkCurves(model, trace),
    loop: model.loop,
    routes: frame.routes,
    // Bundles of many links are sampled coarser: they are read as streams, not as curves.
    splineSegments: calc.bundle && model.links > BUNDLE_COARSE_LINKS ? 6 : undefined,
    arrowEnd: arrows.end && lod.arrows,
    arrowStart: arrows.start && lod.arrows,
    arrowSize: arrowSizes(trace, widths),
    // Placements are y down, the geometry's screen space y up.
    labelSide: placement
      ? (i) => {
          const p = typeof placement === 'function' ? placement(i) : placement;
          return [p.dx, -p.dy];
        }
      : undefined,
    scaleX,
    scaleY,
  };
  // The frame before, with a few nodes moved: only their links are placed again.
  const moved = frame.moved;
  const patched =
    moved &&
    previous &&
    previous.trace === trace &&
    previous.stamp === moved.from &&
    previous.arrows === lod.arrows &&
    previous.nodeScale === lod.nodeScale &&
    previous.routes === frame.routes &&
    previous.hidden === frame.hidden &&
    !geometryStale(previous.geometry, scaleX, scaleY)
      ? patchLinkGeometry(previous.geometry, input, linksAt(model, moved.nodes))
      : undefined;
  const geometry = patched ?? buildLinkGeometry(input);
  const built: DrawnLinks = {
    trace,
    geometry,
    widths,
    stamp: frame.stamp,
    arrows: lod.arrows,
    nodeScale: lod.nodeScale,
    routes: frame.routes,
    hidden: frame.hidden,
  };
  DRAWN.set(calc, built);
  return built;
}

/** Above this many links the splines of bundled links are drawn with fewer segments. */
const BUNDLE_COARSE_LINKS = 2000;

const LOOPED = new WeakMap<GraphCalc['model'], boolean>();

/**
 * The links that change when `nodes` move, ascending, each once: those with an end among them,
 * and the loops of their neighbours, which point away from where their node's neighbours are.
 */
function linksAt(model: GraphCalc['model'], nodes: readonly number[]): number[] {
  const adjacency = adjacencyOf(model);
  let looped = LOOPED.get(model);
  if (looped === undefined) {
    looped = model.loop.some((v) => v >= 0);
    LOOPED.set(model, looped);
  }
  const out: number[] = [];
  const at = (i: number, loops: boolean): void => {
    for (let e = adjacency.outStart[i]!; e < adjacency.outStart[i + 1]!; e++) {
      const j = adjacency.outNode[e]!;
      if (!loops) out.push(adjacency.outLink[e]!);
      else if (j === i) out.push(adjacency.outLink[e]!);
      if (!loops && looped && j !== i) at(j, true);
    }
    if (loops) return;
    for (let e = adjacency.inStart[i]!; e < adjacency.inStart[i + 1]!; e++) {
      out.push(adjacency.inLink[e]!);
      if (looped && adjacency.inNode[e] !== i) at(adjacency.inNode[e]!, true);
    }
  };
  for (const i of nodes) at(i, false);
  out.sort((a, b) => a - b);
  return out.filter((k, j) => j === 0 || k !== out[j - 1]);
}
