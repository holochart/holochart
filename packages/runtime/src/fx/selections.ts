/**
 * Selections as layout objects (plan E5.12, Plotly 2.13+ `layout.selections`): conversions
 * between a defaulted `layout.selections[i]` and the {@link SelectionQuery} trace modules answer
 * (`selectPoints`), both ways. Pure.
 *
 * Positions follow plotly.js (`selections/helpers.js`, like shapes): on log axes they are data
 * values, elsewhere range values (numbers, dates, category names or fractional indices). A lasso
 * is stored as a polygon `path`, `M x,y L x,y … Z`, with `_` between date and time.
 */
import type { AxisInfo, SelectionQuery } from '../contracts.ts';

/** A defaulted `layout.selections[i]` (see core's selections schema). */
export interface FullSelection {
  readonly type?: 'rect' | 'path';
  readonly xref?: string;
  readonly yref?: string;
  readonly x0?: unknown;
  readonly x1?: unknown;
  readonly y0?: unknown;
  readonly y1?: unknown;
  readonly path?: string;
  readonly visible?: boolean;
  readonly _index?: number;
}

type Axis = Pick<AxisInfo, 'type' | 'scale'>;

/** Linear coordinate of a selection position on `axis` (NaN when invalid). */
export function positionToLinear(axis: Axis, v: unknown): number {
  if (v === undefined || v === null || v === '') return NaN;
  let value = v;
  if (typeof value === 'string' && axis.type !== 'category' && axis.type !== 'multicategory') {
    value = value.replace('_', ' ');
  }
  return axis.type === 'log' ? axis.scale.d2l(value) : axis.scale.r2l(value);
}

/** Linear coordinate → selection position (inverse of {@link positionToLinear}). */
export function linearToPosition(axis: Axis, l: number): number | string {
  return axis.type === 'log' ? 10 ** l : axis.scale.l2r(l);
}

/** A path value as text: dates with `_` between date and time (Plotly). */
function pathValue(v: number | string): string {
  return typeof v === 'string' ? v.replace(' ', '_') : String(v);
}

const COMMAND = /[MLHVZmlhvz]/;

/**
 * Parse a selection polygon (`M x,y L x,y … Z`, also `H` / `V` and the relative commands for
 * numeric axes) into linear coordinates. Each `M` starts a new ring; only the first ring is used
 * (Plotly's selections are single polygons). `undefined` for fewer than 3 valid vertices.
 */
export function parseSelectionPath(
  path: string,
  xaxis: Axis,
  yaxis: Axis,
): [number, number][] | undefined {
  const tokens = path.trim().split(/(?=[MLHVZmlhvz])/);
  const out: [number, number][] = [];
  let cx = NaN;
  let cy = NaN;
  let rings = 0;
  for (const token of tokens) {
    const t = token.trim();
    if (t === '') continue;
    const cmd = t.charAt(0);
    if (!COMMAND.test(cmd)) return undefined;
    const args = t
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter((a) => a !== '');
    const upper = cmd.toUpperCase();
    const relative = cmd !== upper;
    if (upper === 'Z') continue;
    if (upper === 'M') {
      rings++;
      if (rings > 1) break;
    }
    const step = upper === 'H' || upper === 'V' ? 1 : 2;
    for (let i = 0; i + step <= args.length; i += step) {
      let x = cx;
      let y = cy;
      if (upper === 'H' || upper === 'V') {
        const v = upper === 'H' ? xaxis : yaxis;
        const l = relative ? Number(args[i]) : positionToLinear(v, args[i]);
        if (upper === 'H') x = relative ? cx + l : l;
        else y = relative ? cy + l : l;
      } else if (relative) {
        x = cx + Number(args[i]);
        y = cy + Number(args[i + 1]);
      } else {
        x = positionToLinear(xaxis, args[i]);
        y = positionToLinear(yaxis, args[i + 1]);
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
      cx = x;
      cy = y;
      out.push([x, y]);
    }
  }
  // A closing vertex equal to the first adds nothing.
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) out.pop();
  return out.length >= 3 ? out : undefined;
}

/**
 * The query a selection makes on its subplot's axes: a box for a complete `rect`, a lasso for a
 * `path` polygon; `undefined` when incomplete, invalid or hidden.
 */
export function selectionQuery(
  sel: FullSelection,
  xaxis: Axis,
  yaxis: Axis,
): SelectionQuery | undefined {
  if (sel.visible === false) return undefined;
  if (sel.type === 'path') {
    if (typeof sel.path !== 'string') return undefined;
    const polygon = parseSelectionPath(sel.path, xaxis, yaxis);
    if (!polygon) return undefined;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of polygon) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { kind: 'lasso', x: [x0, x1], y: [y0, y1], polygon };
  }
  const xa = positionToLinear(xaxis, sel.x0);
  const xb = positionToLinear(xaxis, sel.x1);
  const ya = positionToLinear(yaxis, sel.y0);
  const yb = positionToLinear(yaxis, sel.y1);
  if (![xa, xb, ya, yb].every(Number.isFinite)) return undefined;
  return {
    kind: 'rect',
    x: [Math.min(xa, xb), Math.max(xa, xb)],
    y: [Math.min(ya, yb), Math.max(ya, yb)],
  };
}

/**
 * The layout selection a finished box or lasso drag makes (Plotly's `newSelections`): a `rect`
 * with the box (an unbounded side — `selectdirection` `h` / `v` — spans the axis range in view)
 * or a `path` with the lasso polygon, on the subplot's axes.
 */
export function selectionFromQuery(
  query: SelectionQuery,
  xaxis: Pick<AxisInfo, 'id' | 'type' | 'scale'>,
  yaxis: Pick<AxisInfo, 'id' | 'type' | 'scale'>,
): Record<string, unknown> | undefined {
  const refs = { xref: xaxis.id, yref: yaxis.id };
  if (query.kind === 'lasso') {
    const polygon = query.polygon ?? [];
    if (polygon.length < 3) return undefined;
    const parts = polygon.map(
      ([x, y], i) =>
        `${i === 0 ? 'M' : 'L'}${pathValue(linearToPosition(xaxis, x))},${pathValue(linearToPosition(yaxis, y))}`,
    );
    return { type: 'path', ...refs, path: `${parts.join('')}Z` };
  }
  const bounded = (r: readonly [number, number], axis: Axis): [number, number] => {
    if (Number.isFinite(r[0]) && Number.isFinite(r[1])) return [r[0], r[1]];
    const [a, b] = axis.scale.range;
    return [Math.min(a, b), Math.max(a, b)];
  };
  const [x0, x1] = bounded(query.x, xaxis);
  const [y0, y1] = bounded(query.y, yaxis);
  if (![x0, x1, y0, y1].every(Number.isFinite)) return undefined;
  return {
    type: 'rect',
    ...refs,
    x0: linearToPosition(xaxis, x0),
    x1: linearToPosition(xaxis, x1),
    y0: linearToPosition(yaxis, y0),
    y1: linearToPosition(yaxis, y1),
  };
}

/** The visible selections of a defaulted layout. */
export function selectionsOf(fullLayout: unknown): FullSelection[] {
  const list = (fullLayout as { selections?: unknown } | undefined)?.selections;
  return Array.isArray(list)
    ? (list as FullSelection[]).filter((s) => s && typeof s === 'object' && s.visible !== false)
    : [];
}
