/**
 * `chord` supply-defaults (backlog G8, ADR-029).
 *
 * - The input is `node` / `link` when `link.source` and `link.target` are given, else `matrix`
 *   with `labels`. A trace with neither is not drawn (`visible: false`).
 * - `node.label` defaults to `labels`; `node.hoverinfo` / `link.hoverinfo` to the trace
 *   `hoverinfo`.
 * - `node.color` and `link.color` stay unset: the view takes the colorway (one color per node, or
 *   per group) and gives every ribbon the color of its source or target.
 * - `node.line.color` defaults to the paper color; `textfont` to `layout.font`, and
 *   `groups.textfont` to `textfont` in bold.
 * - `link.targetgap` and `link.arrowlen` are coerced only for directed traces, and `groups` only
 *   when `node.group` is given.
 * - `showlegend` defaults to `false` for a trace without groups: its labels are around the ring
 *   already. With groups the legend has one item per group.
 */
import {
  isArrayLike,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';

function lengthOf(v: unknown): number {
  return isArrayLike(v) && typeof v !== 'string' ? v.length : 0;
}

export function supplyChordDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const { fullLayout } = ctx;
  const hoverinfoIn = traceIn['hoverinfo'];
  const partInfo = hoverinfoIn === 'none' || hoverinfoIn === 'skip' ? hoverinfoIn : undefined;
  ctx.coerce('hoverinfo');

  // The data first: without links or a matrix there is nothing to draw.
  const source = ctx.coerce('link.source');
  const target = ctx.coerce('link.target');
  const linked = lengthOf(source) > 0 && lengthOf(target) > 0;
  let labels: unknown;
  if (linked) {
    ctx.coerce('link.value');
  } else {
    const matrix = ctx.coerce('matrix');
    if (lengthOf(matrix) === 0) {
      traceOut.visible = false;
      return;
    }
    labels = ctx.coerce('labels');
  }
  ctx.coerce('link.label');
  ctx.coerce('link.customdata');
  ctx.coerce('node.label', labels);
  const group = ctx.coerce('node.group');
  const grouped = lengthOf(group) > 0;
  ctx.coerce('node.customdata');

  const directed = ctx.coerce<boolean>('directed');
  ctx.coerce('sort');
  ctx.coerce('rotation');
  ctx.coerce('direction');
  const pad = ctx.coerce<number>('padangle');
  ctx.coerce('link.sort');

  ctx.coerce('node.color');
  ctx.coerce('node.thickness');
  ctx.coerce('node.line.color', fullLayout['paper_bgcolor']);
  ctx.coerce('node.line.width');
  ctx.coerce('node.hoverinfo', partInfo);
  ctx.coerce('node.hovertemplate');

  ctx.coerce('link.color');
  ctx.coerce('link.colorsource');
  ctx.coerce('link.opacity');
  ctx.coerce('link.hovercolor');
  const gap = ctx.coerce<number>('link.gap');
  if (directed) {
    ctx.coerce('link.targetgap', gap);
    ctx.coerce('link.arrowlen');
  }
  ctx.coerce('link.hoverinfo', partInfo);
  ctx.coerce('link.hovertemplate');

  ctx.coerce('textorientation');
  ctx.coerce('valueformat');
  ctx.coerce('valuesuffix');
  const font = fullLayout.font;
  const base = {
    family: font.family,
    size: font.size,
    color: font.color,
    weight: font.weight,
    style: font.style,
  };
  ctx.coerceContainer('textfont', base);
  if (grouped) {
    ctx.coerce('groups.visible');
    ctx.coerce('groups.color');
    ctx.coerce('groups.thickness');
    ctx.coerce('groups.gap');
    ctx.coerce('groups.padangle', pad * 2);
    const text = (traceOut['textfont'] ?? {}) as Record<string, unknown>;
    ctx.coerceContainer('groups.textfont', {
      family: text['family'] ?? base.family,
      size: text['size'] ?? base.size,
      color: text['color'] ?? base.color,
      weight: 'bold',
      style: text['style'] ?? base.style,
    });
  }
  // One legend item per group; without groups the labels around the ring name the nodes.
  ctx.coerce('showlegend', grouped);
}

/** Layout defaults: `hiddenlabels`, the legend items a click hid (shared with pies). */
export function supplyChordLayoutDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  _layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  ctx.coerce('hiddenlabels');
}
