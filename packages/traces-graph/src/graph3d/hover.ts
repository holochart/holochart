/**
 * `graph3d` hover (backlog G6; its keyboard stops are in `../a11y.ts`): nodes and links are found
 * by the scene's GPU picking (ADR-010, `traces-3d` `scene/pick.ts`), not by a search on the CPU. The view registers
 * what it draws as pickable and tags it ({@link PICK_TAG}): a hit on the nodes names the node, a
 * hit on the links (the line, or the mesh of tubes and arrowheads) names a vertex, which
 * {@link PICK_LINKS} maps to its link. The nearest hit wins, a node over a link as near.
 *
 * The points say what they are (`kind: 'node' | 'link'`) and carry the 2D trace's fields
 * (`../graph/hover.ts`: `label`, `degree`, `group`, …, `source` / `target` for a link), with `z`
 * added. Labels are the 2D trace's too: `node.hovertemplate` / `link.hovertemplate`, or the node's
 * label, its link count and group; a link's two ends, label and value.
 *
 * The scene asks a module's `hoverPoints` for what is under the pointer, and nothing tells a view
 * of it. The view highlights what is hovered, so it asks to be told here ({@link watchHover}):
 * {@link graph3dHoverPoints} hands it what picking found for its calc, on every hover.
 */
import { formatNumber, isArrayLike, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import {
  formatTemplate,
  splitExtra,
  type HoverContext,
  type HoverPoint,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import { sceneHoverPoint, scenePicks, type ScenePicks } from '@mk7s/holochart-traces-3d';
import type { GraphHit } from '../graph/highlight.ts';
import { linkFields, nodeFields, partHoverinfo } from '../graph/hover.ts';
import { arrowsOf } from '../graph/links.ts';
import { nodeLabel } from '../graph/model.ts';
import { linkCss, nodeCss, part } from '../graph/style.ts';
import { as2d, type Graph3dCalc } from './calc.ts';
import { drawnLinkMiddle } from './geometry.ts';

/** `userData` key that says what a pickable object of the trace draws: `'nodes'` or `'links'`. */
export const PICK_TAG = 'hcGraph3d';
/** `userData` key of a links object: the kept link of each of its pick ids (vertices). */
export const PICK_LINKS = 'hcGraph3dLinks';

const WATCHERS = new WeakMap<Graph3dCalc, (hit: GraphHit | undefined) => void>();

/**
 * Tell `watcher` what the pointer is over in the trace of `calc` whenever hover asks: a node, a
 * kept link, or `undefined` for neither (which is also the answer while a pick is on its way).
 */
export function watchHover(calc: Graph3dCalc, watcher: (hit: GraphHit | undefined) => void): void {
  WATCHERS.set(calc, watcher);
}

function at(values: unknown, i: number): unknown {
  return isArrayLike(values) && typeof values !== 'string'
    ? (values as ArrayLike<unknown>)[i]
    : undefined;
}

const present = (s: string): boolean => s !== '';

function valueText(v: number): string {
  return formatNumber(v, { tickformat: Number.isInteger(v) ? ',d' : ',.4~g' });
}

/** Fill a part's hovertemplate, or join the built lines (the 2D trace's rule). */
function labelText(
  trace: FullTrace,
  key: 'node' | 'link',
  fields: Record<string, unknown>,
  labels: Readonly<Record<string, string>>,
  lines: string[],
): { text: string; extra: string | undefined } {
  if (partHoverinfo(trace, key) === 'none') return { text: '', extra: undefined };
  const template = part(trace, key)['hovertemplate'];
  if (typeof template === 'string' && template !== '') {
    const filled = splitExtra(
      formatTemplate(template, { values: fields, labels, fullData: trace }),
    );
    return { text: filled.text, extra: filled.extra };
  }
  return { text: lines.filter(present).join('<br>'), extra: undefined };
}

/**
 * The hover point of node `i`, anchored where the node is drawn now (`undefined` for a node that
 * is not drawn): what picking found, or a stop of keyboard navigation.
 */
export function graph3dNodePoint(
  pick: ScenePicks,
  calc: Graph3dCalc,
  trace: FullTrace,
  i: number,
  fullLayout: FullLayout,
  distance = 0,
): HoverPoint | undefined {
  if (!(i >= 0 && i < calc.length) || calc.hidden[i] === 1) return undefined;
  const { model } = calc;
  const node = part(trace, 'node');
  // Positions are the figure's data only with 'preset'; layout units are not reported.
  const values = calc.preset
    ? { x: at(node['x'], i), y: at(node['y'], i), z: at(node['z'], i) }
    : { x: undefined, y: undefined, z: undefined };
  const color = nodeCss(as2d(calc), trace, fullLayout, i);
  const base = sceneHoverPoint(pick, trace, {
    pointIndex: i,
    x: calc.x[i]!,
    y: calc.y[i]!,
    z: calc.z[i]!,
    values,
    distance,
    color,
  });
  const fields: Record<string, unknown> = {
    ...nodeFields(as2d(calc), trace, i),
    ...(calc.preset ? { z: values.z } : {}),
  };
  const directed = arrowsOf(trace).end || arrowsOf(trace).start;
  const { text, extra } = labelText(
    trace,
    'node',
    { ...fields, ...values },
    calc.preset ? (base.labels ?? {}) : {},
    [
      nodeLabel(model, i) || `Node ${i}`,
      directed
        ? `Links in: ${model.indegree[i]}, out: ${model.outdegree[i]}`
        : `Links: ${model.degree[i]}`,
      typeof fields['group'] === 'string' ? `Group: ${fields['group']}` : '',
    ],
  );
  return {
    pointIndex: i,
    kind: 'node',
    distance: base.distance,
    px: base.px,
    py: base.py,
    ...(calc.preset ? { x: values.x, y: values.y } : {}),
    color,
    fields,
    hoverText: text,
    ...(extra !== undefined ? { extra } : {}),
  };
}

/**
 * The hover point of kept link `k`, anchored at the middle of the link as it is drawn (the apex
 * of a curve, the far side of a self-link's ring), else halfway between its ends.
 */
export function graph3dLinkPoint(
  pick: ScenePicks,
  calc: Graph3dCalc,
  trace: FullTrace,
  k: number,
  distance = 0,
): HoverPoint | undefined {
  const { model } = calc;
  if (!(k >= 0 && k < model.links)) return undefined;
  const a = model.source[k]!;
  const b = model.target[k]!;
  if (calc.hidden[a] === 1 || calc.hidden[b] === 1) return undefined;
  const middle = drawnLinkMiddle(calc, k) ?? [
    (calc.x[a]! + calc.x[b]!) / 2,
    (calc.y[a]! + calc.y[b]!) / 2,
    (calc.z[a]! + calc.z[b]!) / 2,
  ];
  const base = sceneHoverPoint(pick, trace, {
    pointIndex: model.linkIndex[k]!,
    x: middle[0],
    y: middle[1],
    z: middle[2],
    values: { x: undefined, y: undefined, z: undefined },
    distance,
  });
  const fields = linkFields(as2d(calc), trace, k);
  const arrows = arrowsOf(trace);
  const joint = arrows.end && arrows.start ? '↔' : arrows.end ? '→' : arrows.start ? '←' : '–';
  const name = (i: number): string => nodeLabel(model, i) || `Node ${i}`;
  const value = model.value[k]!;
  const labels: Record<string, string> = Number.isFinite(value) ? { value: valueText(value) } : {};
  const { text, extra } = labelText(trace, 'link', fields, labels, [
    `${name(a)} ${joint} ${name(b)}`,
    String(fields['label'] ?? ''),
    Number.isFinite(value) ? `Value: ${valueText(value)}` : '',
  ]);
  return {
    pointIndex: model.linkIndex[k]!,
    kind: 'link',
    distance: base.distance,
    px: base.px,
    py: base.py,
    color: linkCss(model, trace, k),
    fields,
    labels,
    hoverText: text,
    ...(extra !== undefined ? { extra } : {}),
  };
}

/** What a set of GPU hits names: the nearest, a node winning over a link as near. */
export function pickedPart(
  hits: ScenePicks['hits'],
  nodes: boolean,
  links: boolean,
): { kind: 'node' | 'link'; index: number; distance: number } | undefined {
  let best: { kind: 'node' | 'link'; index: number; distance: number } | undefined;
  for (const h of hits) {
    if (best && h.distance > best.distance) break;
    const tag = h.object?.userData[PICK_TAG];
    if (tag === 'nodes') {
      // A node as near as the best so far is the answer.
      if (nodes && h.pointIndex >= 0)
        return { kind: 'node', index: h.pointIndex, distance: h.distance };
    } else if (tag === 'links' && links && !best) {
      const map = h.object?.userData[PICK_LINKS] as Int32Array | undefined;
      const k = map?.[h.pointIndex];
      if (k !== undefined && k >= 0) best = { kind: 'link', index: k, distance: h.distance };
    }
  }
  return best;
}

/** The graph3d `hoverPoints`: the node or link GPU picking found under the pointer. */
export function graph3dHoverPoints(
  calc: Graph3dCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  if (trace['hoverinfo'] === 'skip') return [];
  const pick = scenePicks(trace, query, ctx);
  const found =
    pick &&
    pickedPart(
      pick.hits,
      partHoverinfo(trace, 'node') !== 'skip',
      partHoverinfo(trace, 'link') !== 'skip',
    );
  // Only a pointer has a place on screen (`cx`): a point looked up by its index is no hover.
  if (query.cx !== undefined) {
    WATCHERS.get(calc)?.(
      found
        ? found.kind === 'node'
          ? { kind: 'node', i: found.index }
          : { kind: 'link', k: found.index }
        : undefined,
    );
  }
  if (!pick || !found) return [];
  const point =
    found.kind === 'node'
      ? graph3dNodePoint(pick, calc, trace, found.index, ctx.fullLayout, found.distance)
      : graph3dLinkPoint(pick, calc, trace, found.index, found.distance);
  return point ? [point] : [];
}

/** The graph3d `eventData`: the fields of node `i`. */
export function graph3dEventData(
  calc: Graph3dCalc,
  trace: FullTrace,
  i: number,
): Readonly<Record<string, unknown>> {
  return i >= 0 && i < calc.length ? nodeFields(as2d(calc), trace, i) : {};
}
