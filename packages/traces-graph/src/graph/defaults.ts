/**
 * `graph` supply-defaults (backlog G1, ADR-029).
 *
 * - A trace without nodes is not drawn (`visible: false`); `_length` is the node count.
 * - `arrangement` defaults to `'preset'` when every node has an `x` and a `y`, else to `'force'`
 *   (a force layout with some nodes pinned has positions for those only).
 * - `node.draggable` is coerced where a drag means something: on by default for `'preset'` and
 *   `'force'` (off on a timeline), off for `'custom'`; `highlight` always.
 * - `node.color` defaults to the trace's colorway color, unless the nodes have groups: then it
 *   stays unset and every group takes a colorway color. Numeric colors turn the colorscale
 *   attributes on, as for scatter's `marker`.
 * - `node.line.color` defaults to the plot background (the paper's when the plot area is
 *   transparent), and `link.color` to a translucent gray chosen for that background.
 * - `node.hoverinfo` / `link.hoverinfo` default to the trace `hoverinfo`; `node.label` to the
 *   tree input's `labels`; `node.textfont` to `layout.font` with the automatic halo. A box node's
 *   text color stays unset: it is black or white by the box's color.
 * - `showlegend` defaults to `false` for a trace without groups, so that a graph alone shows a
 *   legend only when it has group items to show.
 * - Only the option container of the arrangement in use is coerced (`force`, `layered`, `tree`
 *   for the three tree arrangements, `arc`, `hive`), and in it only what that arrangement reads.
 *   Some defaults follow the arrangement: `'layered'` draws labelled nodes as boxes and its links
 *   with arrowheads; a `'tree'` grows from the left and a `'dendrogram'` from the top, with
 *   smaller nodes; tree links are curved, a dendrogram's are elbows. Defaults that need the
 *   labels or the plot area (`tree.ranksep`, `layered.aspect`, `force.ticks`) are left unset here
 *   and filled in by `options.ts`.
 */
import {
  isArrayLike,
  toRGBA,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import {
  hasColorscale,
  numericExtent,
  scatter,
  supplyColorscaleDefaults,
} from '@mk7s/holochart-traces-basic';
import { givenNodeCount, isTreeInput } from './model.ts';
import { allGiven, realAxisOf } from './options.ts';

type Container = Readonly<Record<string, unknown>>;

function container(trace: Container, key: string): Container | undefined {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : undefined;
}

/** WCAG relative luminance of an sRGB color. */
export function luminance(c: ArrayLike<number>): number {
  const lin = (v: number): number =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
}

/** The color behind the trace: the plot background, or the paper's where that is transparent. */
export function backgroundOf(fullLayout: FullLayout): string {
  const plot = fullLayout['plot_bgcolor'];
  const rgba = typeof plot === 'string' ? toRGBA(plot) : null;
  if (rgba && rgba[3] > 0.5) return plot as string;
  const paper = fullLayout['paper_bgcolor'];
  return typeof paper === 'string' && toRGBA(paper) ? paper : '#fff';
}

/** Whether the background is dark (Plotly's rule: luminance below a third). */
export function darkBackground(fullLayout: FullLayout): boolean {
  const c = toRGBA(backgroundOf(fullLayout));
  return c !== null && luminance(c) < 0.333;
}

/** The default link color on a light and on a dark background. */
export const LINK_COLOR = { light: 'rgba(68, 68, 68, 0.45)', dark: 'rgba(255, 255, 255, 0.4)' };

function lengthOf(v: unknown): number {
  return isArrayLike(v) && typeof v !== 'string' ? v.length : 0;
}

function nodeOut(trace: Container): Container {
  return container(trace, 'node') ?? {};
}

/** The arrangements that set some links apart (`link.secondary`). */
const SECONDARY: ReadonlySet<string> = new Set(['layered', 'tree', 'radial', 'dendrogram']);

/** The option container of the arrangement in use (see the module comment). */
function supplyArrangementDefaults(
  arrangement: string,
  ctx: TraceDefaultsContext,
  is: { grouped: boolean; box: boolean },
): void {
  switch (arrangement) {
    case 'custom':
      ctx.coerce('custom.name');
      ctx.coerce('custom.options');
      return;
    case 'force': {
      const spring = ctx.coerce('force.algorithm') === 'spring';
      ctx.coerce('force.simulate');
      ctx.coerce('force.seed');
      ctx.coerce('force.ticks');
      ctx.coerce('force.linkweight');
      ctx.coerce('force.gravity');
      if (ctx.coerce('force.collide') === true) ctx.coerce('force.collidepadding');
      if (is.grouped) ctx.coerce('force.groupstrength');
      if (spring) {
        ctx.coerce('force.linkdistance');
        ctx.coerce('force.linkstrength');
        ctx.coerce('force.charge');
      } else {
        ctx.coerce('force.linlog');
        ctx.coerce('force.scalingratio');
      }
      if (lengthOf(ctx.coerce('force.start.x')) > 0 && lengthOf(ctx.coerce('force.start.y')) > 0) {
        ctx.coerce('force.start.alpha');
      }
      return;
    }
    case 'layered':
      ctx.coerce('layered.rankdir');
      ctx.coerce('layered.ranksep');
      ctx.coerce('layered.nodesep');
      ctx.coerce('layered.edgesep');
      ctx.coerce('layered.ranker');
      ctx.coerce('layered.routing');
      if (ctx.coerce('layered.clusters') === true) ctx.coerce('layered.clusterpadding');
      ctx.coerce('layered.aspect');
      return;
    case 'tree':
    case 'radial':
    case 'dendrogram': {
      const dendrogram = arrangement === 'dendrogram';
      if (arrangement === 'radial') {
        ctx.coerce('tree.sector.start');
        ctx.coerce('tree.sector.span');
      } else {
        ctx.coerce('tree.orientation', dendrogram ? 'TB' : 'LR');
      }
      // A dendrogram's links are brackets or straight lines (`'curved'` reads as `'elbow'`).
      ctx.coerce('tree.links', dendrogram ? 'elbow' : 'curved');
      ctx.coerce('tree.nodesep', is.box ? 20 : 10);
      if (!dendrogram) ctx.coerce('tree.subtreesep');
      ctx.coerce('tree.ranksep');
      if (ctx.coerce('tree.sort') !== 'input') ctx.coerce('tree.sortorder');
      ctx.coerce('tree.collapsed');
      ctx.coerce('tree.collapsible');
      return;
    }
    case 'arc':
      ctx.coerce('arc.orientation');
      if (ctx.coerce('arc.order', is.grouped ? 'group' : 'input') === 'group') {
        ctx.coerce('arc.groupsep');
      }
      ctx.coerce('arc.nodesep');
      ctx.coerce('arc.sides');
      ctx.coerce('arc.maxheight');
      ctx.coerce('arc.loopsize');
      return;
    case 'hive':
      if (!is.grouped && ctx.coerce('hive.assign') === 'degree') ctx.coerce('hive.axes');
      ctx.coerce('hive.startangle');
      ctx.coerce('hive.innerradius');
      ctx.coerce('hive.outerradius');
      ctx.coerce('hive.position');
      return;
    default:
  }
}

export function supplyGraphDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const { fullLayout } = ctx;
  const hoverinfoIn = traceIn['hoverinfo'];
  const partInfo = hoverinfoIn === 'none' || hoverinfoIn === 'skip' ? hoverinfoIn : undefined;
  ctx.coerce('hoverinfo');

  // The data first: the node count decides whether there is anything to draw.
  const labels = ctx.coerce('labels');
  ctx.coerce('parents');
  ctx.coerce('link.source');
  ctx.coerce('link.target');
  ctx.coerce('link.value');
  ctx.coerce('link.label');
  ctx.coerce('link.customdata');
  ctx.coerce('node.label', isTreeInput(traceIn) ? labels : undefined);
  const x = ctx.coerce('node.x');
  const y = ctx.coerce('node.y');
  const group = ctx.coerce('node.group');
  ctx.coerce('node.value');
  ctx.coerce('node.customdata');
  // Its default follows the arrangement (below); an array of sizes counts as nodes first.
  ctx.coerce('node.size');
  const grouped = lengthOf(group) > 0;
  const nodeIn = container(traceIn, 'node');
  ctx.coerce('node.color', grouped ? undefined : ctx.defaultColor);
  if (hasColorscale(nodeIn)) {
    supplyColorscaleDefaults(nodeIn, ctx.coerce, 'node.', { inTrace: true, showscale: true });
  }

  const count = givenNodeCount(traceOut);
  if (count === 0) {
    traceOut.visible = false;
    return;
  }
  traceOut['_length'] = count;

  const placed = allGiven(x, count) && allGiven(y, count);
  const arrangement = ctx.coerce<string>('arrangement', placed ? 'preset' : 'force');
  const labelled = lengthOf(traceOut['labels']) > 0 || lengthOf(nodeOut(traceOut)['label']) > 0;
  // Boxes are what makes a layered drawing a diagram; without labels they would be empty.
  const shape = ctx.coerce('node.shape', arrangement === 'layered' && labelled ? 'box' : 'marker');
  supplyArrangementDefaults(arrangement, ctx, { grouped, box: shape === 'box' });
  // A registered layout is a function of the page: it cannot run in the worker.
  if (arrangement !== 'custom') ctx.coerce('worker', fullLayout._worker ?? false);
  ctx.coerce('lod');

  // A dendrogram's nodes are points on a scale.
  ctx.coerce('node.size', arrangement === 'dendrogram' ? 6 : 10);
  if (ctx.coerce('node.sizeby') !== 'none') ctx.coerce('node.sizerange');
  ctx.coerce('node.symbol');
  ctx.coerce('node.opacity');
  ctx.coerce('node.line.color', backgroundOf(fullLayout));
  ctx.coerce('node.line.width');
  ctx.coerce('node.textposition');
  const font = fullLayout.font;
  ctx.coerceContainer('node.textfont', {
    family: font.family,
    size: font.size,
    // Unset for boxes: the text takes the color that reads on its box.
    ...(shape === 'box' ? {} : { color: font.color }),
    weight: font.weight,
    style: font.style,
    shadow: shape === 'box' ? 'none' : 'auto',
  });
  ctx.coerce('node.hoverinfo', partInfo);
  ctx.coerce('node.hovertemplate');
  if (arrangement === 'preset' || arrangement === 'force') {
    // The nodes of a timeline are held on a real axis: there is nowhere to drag them to.
    ctx.coerce('node.draggable', !realAxisOf(traceOut, arrangement));
  } else if (arrangement === 'custom') {
    ctx.coerce('node.draggable', false);
  }

  ctx.coerce('link.color', darkBackground(fullLayout) ? LINK_COLOR.dark : LINK_COLOR.light);
  ctx.coerce('link.width');
  if (ctx.coerce('link.widthby') !== 'none') ctx.coerce('link.widthrange');
  ctx.coerce('link.dash');
  if (SECONDARY.has(arrangement)) {
    ctx.coerce('link.secondary.dash');
    ctx.coerce('link.secondary.opacity');
    ctx.coerce('link.secondary.color');
  }
  ctx.coerce('link.curve');
  const directed = ctx.coerce('link.arrow.end', arrangement === 'layered') === true;
  ctx.coerce('link.arrow.start');
  ctx.coerce('link.arrow.size');
  ctx.coerce('link.opacity');
  const bundle = ctx.coerce('link.bundle.method');
  if (bundle !== 'none') {
    ctx.coerce('link.bundle.strength');
    if (bundle !== 'hierarchical') ctx.coerce('link.bundle.compatibility');
  }
  ctx.coerce('link.hoverinfo', partInfo);
  ctx.coerce('link.hovertemplate');

  ctx.coerce('highlight.mode');
  ctx.coerce('highlight.hops');
  ctx.coerce('highlight.direction');
  ctx.coerce('highlight.dim');
  ctx.coerce('highlight.color');
  ctx.coerce('highlight.nodes');
  ctx.coerce('highlight.path');
  ctx.coerce('highlight.pathweight');
  ctx.coerce('highlight.pathdirected', directed);

  ctx.coerce('selected.node.opacity');
  ctx.coerce('selected.node.color');
  ctx.coerce('unselected.node.opacity');
  ctx.coerce('unselected.node.color');
  ctx.coerce('zorder');
  // One legend item per group; a graph without groups has nothing to list.
  ctx.coerce('showlegend', grouped);
}

/**
 * Layout defaults of the traces of type `type` (`'graph'`, and `'graph3d'`, which has the same
 * `node` container): `hiddenlabels` (the groups a legend click hid, shared with pies), and the
 * color axes `node.coloraxis` refers to, with the extent of the numeric node colors (as
 * traces-basic does for `marker`).
 */
export function supplyGraphLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
  type = 'graph',
): void {
  ctx.coerce('hiddenlabels');
  scatter.supplyLayoutDefaults?.(layoutIn, layoutOut, ctx);
  for (const trace of ctx.fullData) {
    if (trace.visible === false || trace.type !== type) continue;
    const node = container(trace, 'node');
    const id = node?.['coloraxis'];
    if (typeof id !== 'string') continue;
    supplyColorscaleDefaults(container(layoutIn, id), ctx.coerce, `${id}.`, {
      inTrace: false,
      showscale: true,
    });
    const out = container(layoutOut, id) as Record<string, unknown> | undefined;
    const color = node?.['color'];
    if (!out || !isArrayLike(color) || typeof color === 'string') continue;
    const [lo, hi] = numericExtent(color as ArrayLike<unknown>);
    const min = out['_min'];
    const max = out['_max'];
    out['_min'] = Math.min(lo, typeof min === 'number' ? min : Infinity);
    out['_max'] = Math.max(hi, typeof max === 'number' ? max : -Infinity);
  }
}
