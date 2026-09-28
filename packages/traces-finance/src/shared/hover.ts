/**
 * Hover and selection of `ohlc` and `candlestick` (plan E12.2, E6.1, E6.3; plotly.js
 * `ohlc/hover.js`, `ohlc/select.js`, shared by both types).
 *
 * - **Which bar.** The bar whose hover slot (half the bar spacing each side, Plotly's `wHover`)
 *   holds the pointer's x — and, in `closest` mode, whose low–high range holds its y. Positions are
 *   bisected when they are sorted (the usual time series), so a hover is O(log n). Overlapping
 *   traces: the narrowest wins (Plotly's pseudo-distance), and markers or lines win `closest`
 *   hovers within `hoverdistance`.
 * - **One label** (default), at the middle of the body (`(open + close) / 2`) beside the bar:
 *   `open: …`, `high: …`, `low: …`, `close: …  ▲` (▼ when falling; Plotly's delta symbols), the
 *   y values formatted like the y axis (`yhoverformat`), then `text` / `hovertext`. The x value
 *   (before period alignment) leads in `closest` mode and heads the common label in `x` modes;
 *   unified rows read `name : …`. `hovertemplate` gets `%{open}`, `%{high}`, `%{low}`, `%{close}`
 *   and, beyond Plotly, `%{change}` (close − open) and `%{changepercent}` (the change as a
 *   percentage of the open).
 * - **Split labels** (`hoverlabel.split`): one label per price at its height, equal prices merged
 *   into one label, without the trace name (Plotly).
 */
import {
  cleanNumber,
  formatNumber,
  formatValue,
  isArrayLike,
  localize,
  type FullTrace,
} from '@mk7s/holochart-core';
import { pointInPolygon } from '@mk7s/holochart-render';
import type {
  AxisInfo,
  HoverContext,
  HoverPoint,
  HoverQuery,
  SelectionQuery,
} from '@mk7s/holochart-runtime';
import type { PriceCalc } from './calc.ts';
import { directionStyle, hoverColor } from './style.ts';

/** Plotly's direction symbols (`constants/delta.js`). */
export const DIRECTION_SYMBOL = { increasing: '▲', decreasing: '▼' } as const;

const PRICES = ['open', 'high', 'low', 'close'] as const;
/** Plotly's order of split labels, top to bottom. */
const SPLIT_ORDER = ['high', 'open', 'close', 'low'] as const;

/** A linear coordinate formatted like the axis' hover labels (`hoverformat` overrides it). */
export function axisText(axis: AxisInfo | undefined, l: number, hoverformat: unknown): string {
  if (!Number.isFinite(l)) return '';
  if (!axis) return formatNumber(l);
  const full =
    typeof hoverformat === 'string' && hoverformat !== ''
      ? { ...axis.full, hoverformat }
      : axis.full;
  return formatValue(axis.scale, full, l, true);
}

/** The data value of a linear coordinate (dates as strings, categories by name). */
function dataValue(axis: AxisInfo | undefined, l: number): unknown {
  return axis && Number.isFinite(l) ? axis.scale.l2d(l) : l;
}

function at(v: unknown, i: number): unknown {
  return Array.isArray(v) || ArrayBuffer.isView(v) ? (v as ArrayLike<unknown>)[i] : v;
}

function flagsAt(trace: FullTrace, i: number): Set<string> {
  const v = at(trace['hoverinfo'], i);
  const s = typeof v === 'string' && v !== '' ? v : 'all';
  if (s === 'all') return new Set(['x', 'y', 'text', 'name']);
  return new Set(s.split('+'));
}

/** Plotly's `fillText`: `hovertext`, else `text`, per bar or for all bars. */
function textAt(trace: FullTrace, i: number): string | undefined {
  for (const key of ['hovertext', 'text']) {
    const v = at(trace[key], i);
    if (v || v === 0) return String(v);
  }
  return undefined;
}

/** The trace name as unified rows show it (`hoverlabel.namelength`). */
function shortName(trace: FullTrace, ctx: HoverContext): string {
  const name = String(trace['name'] ?? '');
  const own = (trace['hoverlabel'] as { namelength?: unknown } | undefined)?.namelength;
  const layout = (ctx.fullLayout['hoverlabel'] as { namelength?: unknown } | undefined)?.namelength;
  const n = Number(at(own, 0) ?? layout ?? 15);
  if (!(n >= 0) || name.length <= n) return name;
  return n === 0 ? '' : `${name.slice(0, Math.max(0, n - 3))}...`;
}

/**
 * The drawn bar under the pointer as an index into `calc.drawn`, or -1 (Plotly's
 * `_getClosestPoint`: in the hover slot along x, within low–high along y, per `hovermode`).
 */
export function barUnderPointer(calc: PriceCalc, query: HoverQuery): number {
  const { bPos, wHover } = calc.slot;
  const { drawn, pos, low, high } = calc;
  const valMode = query.mode === 'y';
  const posMode = query.mode === 'x';
  let best = -1;
  let bestDistance = Infinity;
  const test = (k: number): void => {
    const i = drawn[k]!;
    const shift = pos[i]! + bPos - query.xl;
    const lo = Math.min(low[i]!, high[i]!);
    const hi = Math.max(low[i]!, high[i]!);
    const inPos = Math.abs(shift) <= wHover;
    const inVal = lo === hi || (query.yl >= lo && query.yl <= hi);
    if (!(posMode ? inPos : valMode ? inVal : inPos && inVal)) return;
    // Ties (bars touching at a slot edge, or every bar along y): the nearest position.
    const d = Math.abs(shift);
    if (d < bestDistance) {
      bestDistance = d;
      best = k;
    }
  };
  if (calc.sorted && !valMode) {
    // First bar whose slot ends at or after the pointer, then every bar starting before it.
    const from = query.xl - bPos - wHover;
    let lo = 0;
    let hi = drawn.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pos[drawn[mid]!]! < from) lo = mid + 1;
      else hi = mid;
    }
    for (let k = lo; k < drawn.length && pos[drawn[k]!]! <= query.xl - bPos + wHover; k++) test(k);
  } else {
    for (let k = 0; k < drawn.length; k++) test(k);
  }
  return best;
}

/** Hover points of an `ohlc` or `candlestick` trace (see the module comment). */
export function priceHoverPoints(
  calc: PriceCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const k = barUnderPointer(calc, query);
  if (k < 0) return [];
  const i = calc.drawn[k]!;
  const flags = flagsAt(trace, i);
  const info = at(trace['hoverinfo'], i);
  if (info === 'none' || info === 'skip') return [];
  const { bPos, halfWidth } = calc.slot;
  const t = ctx.transform;
  const center = calc.pos[i]! + bPos;
  const x = calc.origPos[i]!;
  // Narrower bars win over wider ones they overlap (Plotly's pseudo-distance).
  const range = ctx.xaxis?.scale.range;
  const span = range ? Math.abs(range[1] - range[0]) : 0;
  const pseudo = span > 0 ? Math.min(1, halfWidth / span) : 0;
  const max = Number.isFinite(query.distance) ? query.distance : 1e6;
  const distance =
    query.mode === 'x' ? Math.abs((center - query.xl) * t.scaleX) : Math.max(0, max - pseudo);
  const increasing = calc.increasing[i] === 1;
  const color = hoverColor(directionStyle(trace, increasing));
  const raw = (key: (typeof PRICES)[number]): unknown => at(trace[key], i);
  const change = cleanNumber(raw('close')) - cleanNumber(raw('open'));
  const changepercent = (100 * change) / cleanNumber(raw('open'));
  const fields: Record<string, unknown> = {};
  for (const key of PRICES) fields[key] = raw(key);
  if (Number.isFinite(change)) fields['change'] = change;
  if (Number.isFinite(changepercent)) fields['changepercent'] = changepercent;
  const base = {
    pointIndex: i,
    distance,
    px: (center + halfWidth) * t.scaleX + t.offsetX,
    // Events report the given x (Plotly adds the data arrays' values at the point).
    x: isArrayLike(trace['x']) ? trace['x'][i] : dataValue(ctx.xaxis, x),
    ...(color ? { color } : {}),
    fields,
  };
  const yText = (l: number): string => axisText(ctx.yaxis, l, trace['yhoverformat']);
  const xLabel = flags.has('x') ? axisText(ctx.xaxis, x, trace['xhoverformat']) : '';
  const hovermode = ctx.fullLayout['hovermode'];
  const unified = hovermode === 'x unified' || hovermode === 'y unified';
  const withX = query.mode !== 'x' && !unified && xLabel !== '';
  const value = { open: calc.open, high: calc.high, low: calc.low, close: calc.close };

  const split = (trace['hoverlabel'] as { split?: unknown } | undefined)?.split === true;
  if (split) {
    const labels = new Map<number, { text: string; close: boolean }>();
    for (const key of SPLIT_ORDER) {
      const l = value[key][i]!;
      const line = `${localize(ctx.fullLayout, `${key}:`)} ${yText(l)}`;
      const same = labels.get(l);
      if (same) same.text += `<br>${line}`;
      else labels.set(l, { text: line, close: false });
      labels.get(l)!.close ||= key === 'close';
    }
    // Spike lines follow the label with the close.
    return [...labels].map(([l, { text, close }]) => ({
      ...base,
      py: l * t.scaleY + t.offsetY,
      hoverText: withX ? `(${xLabel}, ${text})` : text,
      multi: true,
      showName: false,
      ...(close ? {} : { spikeDistance: Infinity }),
    }));
  }

  const lines: string[] = [];
  if (flags.has('y')) {
    const symbol = DIRECTION_SYMBOL[increasing ? 'increasing' : 'decreasing'];
    for (const key of PRICES) {
      const line = `${localize(ctx.fullLayout, `${key}:`)} ${yText(value[key][i]!)}`;
      lines.push(key === 'close' ? `${line}  ${symbol}` : line);
    }
  }
  const text = flags.has('text') ? textAt(trace, i) : undefined;
  if (text !== undefined) lines.push(text);
  let label = lines.join('<br>');
  if (withX) label = label === '' ? xLabel : `${xLabel}<br>${label}`;
  const name = flags.has('name') ? shortName(trace, ctx) : '';
  if (unified && name !== '') label = `${name} : ${label}`;
  // Nothing to show: the name takes the label (Plotly).
  if (label === '') label = name;
  return [
    {
      ...base,
      py: ((calc.open[i]! + calc.close[i]!) / 2) * t.scaleY + t.offsetY,
      hoverText: label,
    },
  ];
}

/**
 * Data indices of the bars inside a box or lasso selection (Plotly's `ohlc/select.js`: each bar
 * is the point at its center and the middle of its body).
 */
export function priceSelectPoints(calc: PriceCalc, query: SelectionQuery): number[] {
  const [x0, x1] = [Math.min(...query.x), Math.max(...query.x)];
  const [y0, y1] = [Math.min(...query.y), Math.max(...query.y)];
  const polygon = query.kind === 'lasso' && query.polygon ? query.polygon.flat() : undefined;
  const out: number[] = [];
  for (const i of calc.drawn) {
    const x = calc.pos[i]! + calc.slot.bPos;
    const y = (calc.open[i]! + calc.close[i]!) / 2;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (polygon && !pointInPolygon(x, y, polygon)) continue;
    out.push(i);
  }
  return out;
}
