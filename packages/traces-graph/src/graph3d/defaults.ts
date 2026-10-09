/**
 * `graph3d` supply-defaults (backlog G6, ADR-029), after the 2D trace's (`../graph/defaults.ts`):
 *
 * - A trace without nodes is not drawn (`visible: false`); `_length` is the node count.
 * - `arrangement` defaults to `'preset'` when `node.x`, `node.y` and `node.z` cover every node,
 *   else to `'force'`. The `force` container is coerced for `'force'` and `'layered'` (by the 2D
 *   trace's rules), `layered` for `'layered'`, `custom` for `'custom'`.
 * - `node.color` defaults to the trace's colorway color, unless the nodes have groups; numeric
 *   colors turn the colorscale attributes on. `link.color` defaults to a translucent gray chosen
 *   for the background; `node.line.color` (sprites) to the background.
 * - `link.arrow.end` defaults to `true` with `'layered'`, as in 2D: its links all point one way.
 *   `highlight.pathdirected` follows it.
 * - `showlegend` defaults to `false` for a trace without groups.
 */
import {
  isArrayLike,
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
import { backgroundOf, darkBackground, LINK_COLOR } from '../graph/defaults.ts';
import { givenNodeCount, isTreeInput } from '../graph/model.ts';

type Container = Readonly<Record<string, unknown>>;

function container(trace: Container, key: string): Container | undefined {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : undefined;
}

function lengthOf(v: unknown): number {
  return isArrayLike(v) && typeof v !== 'string' ? v.length : 0;
}

export function supplyGraph3dDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const { fullLayout } = ctx;
  const hoverinfoIn = traceIn['hoverinfo'];
  const partInfo = hoverinfoIn === 'none' || hoverinfoIn === 'skip' ? hoverinfoIn : undefined;
  ctx.coerce('hoverinfo');
  ctx.coerce('scene');

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
  const z = ctx.coerce('node.z');
  const group = ctx.coerce('node.group');
  ctx.coerce('node.customdata');
  ctx.coerce('node.size', 10);
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

  const placed = lengthOf(x) >= count && lengthOf(y) >= count && lengthOf(z) >= count;
  const arrangement = ctx.coerce('arrangement', placed ? 'preset' : 'force');
  if (arrangement === 'custom') {
    ctx.coerce('custom.name');
    ctx.coerce('custom.options');
  }
  if (arrangement === 'layered') {
    ctx.coerce('layered.axis');
    ctx.coerce('layered.ranker');
    if (ctx.coerce('layered.showplanes') === true) ctx.coerce('layered.planecolor');
  }
  if (arrangement === 'force' || arrangement === 'layered') {
    // The 2D trace's rules (`../graph/defaults.ts`), without `simulate`.
    const spring = ctx.coerce('force.algorithm') === 'spring';
    ctx.coerce('force.seed');
    ctx.coerce('force.ticks');
    ctx.coerce('force.linkweight');
    ctx.coerce('force.gravity');
    if (ctx.coerce('force.collide') === true) ctx.coerce('force.collidepadding');
    if (grouped) ctx.coerce('force.groupstrength');
    if (spring) {
      // Between two planes a link at rest spans their distance.
      const ranksep = arrangement === 'layered' ? ctx.coerce('layered.ranksep') : undefined;
      ctx.coerce('force.linkdistance', ranksep);
      ctx.coerce('force.linkstrength');
      ctx.coerce('force.charge');
    } else {
      if (arrangement === 'layered') ctx.coerce('layered.ranksep');
      ctx.coerce('force.linlog');
      ctx.coerce('force.scalingratio');
    }
  }

  if (ctx.coerce('node.sizeby') !== 'none') ctx.coerce('node.sizerange');
  ctx.coerce('node.opacity');
  if (ctx.coerce('node.render') === 'sprite') {
    ctx.coerce('node.symbol');
    ctx.coerce('node.line.color', backgroundOf(fullLayout));
    ctx.coerce('node.line.width');
  }
  ctx.coerce('node.textposition');
  const font = fullLayout.font;
  ctx.coerceContainer('node.textfont', {
    family: font.family,
    size: font.size,
    color: font.color,
    weight: font.weight,
    style: font.style,
    shadow: 'auto',
  });
  ctx.coerce('node.hoverinfo', partInfo);
  ctx.coerce('node.hovertemplate');

  ctx.coerce('link.color', darkBackground(fullLayout) ? LINK_COLOR.dark : LINK_COLOR.light);
  ctx.coerce('link.width');
  if (ctx.coerce('link.widthby') !== 'none') ctx.coerce('link.widthrange');
  ctx.coerce('link.curve');
  ctx.coerce('link.dash');
  ctx.coerce('link.render');
  const directed = ctx.coerce('link.arrow.end', arrangement === 'layered') === true;
  ctx.coerce('link.arrow.start');
  ctx.coerce('link.arrow.size');
  ctx.coerce('link.opacity');
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

  // One legend item per group; a graph without groups has nothing to list.
  ctx.coerce('showlegend', grouped);
}

/**
 * Layout defaults: `hiddenlabels` (the groups a legend click hid, shared with pies and the 2D
 * trace), and the color axes `node.coloraxis` refers to, with the extent of the numeric node
 * colors. The same as the 2D trace's, for this trace type.
 */
export function supplyGraph3dLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  ctx.coerce('hiddenlabels');
  scatter.supplyLayoutDefaults?.(layoutIn, layoutOut, ctx);
  for (const trace of ctx.fullData) {
    if (trace.visible === false || trace.type !== 'graph3d') continue;
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
