/**
 * Hover (plan E6.1, ADR-010): which points are under the pointer for each `hovermode`, the
 * Plotly-shaped event points, and the text of their labels (E5.7). No DOM here: rendering is
 * `labels.ts`, pointer plumbing is `interaction.ts`.
 *
 * Steady state (the pointer moving over the same points) allocates nothing on the runtime side:
 * the query object and the candidate list are reused, and results are compared with the previous
 * ones before any event object or label is built. (Trace modules return fresh arrays from
 * `hoverPoints`; that part is theirs.)
 */
import { formatValue, toRGBA, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type {
  AxisInfo,
  HoverContext,
  HoverPoint,
  HoverQuery,
  SubplotInfo,
  TraceModule,
} from '../contracts.ts';
import type { ChartPoint } from '../events.ts';
import { perPoint, traceAttr, type Hovermode } from './settings.ts';
import { formatTemplate, splitExtra } from './template.ts';

/**
 * One hoverable trace, cached between pipeline runs: on a cartesian subplot, or a domain trace
 * (pie; M2 wave 1) placed on the figure without axes.
 */
export interface HoverEntry {
  readonly index: number;
  readonly module: TraceModule;
  readonly trace: FullTrace;
  /** The input trace (for `data` in events and attributes missing from the trace schema). */
  readonly input: unknown;
  readonly calc: unknown;
  /** The trace's subplot; `undefined` for domain traces. */
  readonly subplot: SubplotInfo | undefined;
  /**
   * The rect (container px) hover points' `px`/`py` are measured in, from its bottom-left corner:
   * the subplot's plot area, or the whole figure (the overlay viewport) for domain traces.
   */
  readonly rect: Readonly<ViewportRect>;
  readonly ctx: HoverContext;
  /** `hoverinfo: 'skip'`: no hover and no events. */
  readonly skip: boolean;
}

/** A hovered point and the trace it belongs to. */
export interface Found {
  entry: HoverEntry;
  point: HoverPoint;
}

interface MutableQuery {
  px: number;
  py: number;
  xl: number;
  yl: number;
  mode: 'closest' | 'x' | 'y';
  distance: number;
  cx: number;
  cy: number;
}

/** Domain traces to query on every hover (M2 wave 1), with the figure height for `py`. */
export interface DomainHover {
  readonly entries: readonly HoverEntry[];
  /** Figure height in CSS px (overlay viewport px run bottom-up). */
  readonly height: number;
}

const NO_DOMAIN: DomainHover = { entries: [], height: 0 };

/** The query mode traces are asked for, per `hovermode`. */
export function queryMode(hovermode: Exclude<Hovermode, false>): 'closest' | 'x' | 'y' {
  if (hovermode === 'closest') return 'closest';
  return hovermode.startsWith('x') ? 'x' : 'y';
}

/**
 * Finds hovered points; keeps its buffers between calls. `found[0..count)` holds the result of the
 * last {@link find}; `changed` says whether it differs from the call before.
 */
export class HoverFinder {
  readonly found: Found[] = [];
  count = 0;
  /** The subplot of the winning point (for common labels and `xvals`). */
  subplot: SubplotInfo | undefined;
  readonly #query: MutableQuery = {
    px: 0,
    py: 0,
    xl: 0,
    yl: 0,
    mode: 'closest',
    distance: 20,
    cx: 0,
    cy: 0,
  };
  readonly #prevTrace: number[] = [];
  readonly #prevPoint: number[] = [];

  #push(entry: HoverEntry, point: HoverPoint): void {
    const slot = this.found[this.count];
    if (slot) {
      slot.entry = entry;
      slot.point = point;
    } else this.found.push({ entry, point });
    this.count++;
  }

  /** Forget the previous result (the next non-empty find counts as changed). */
  reset(): void {
    this.count = 0;
    this.subplot = undefined;
    this.#prevTrace.length = 0;
    this.#prevPoint.length = 0;
  }

  /**
   * Find the points under container position `(cx, cy)`: every subplot whose plot area contains it
   * is queried (overlaid subplots share an area), then every domain trace (they test their own
   * shapes). Returns whether the set of hovered points changed since the previous call.
   */
  find(
    subplots: readonly SubplotInfo[],
    entriesFor: (subplot: SubplotInfo) => readonly HoverEntry[],
    cx: number,
    cy: number,
    hovermode: Exclude<Hovermode, false>,
    distance: number,
    domain: DomainHover = NO_DOMAIN,
  ): boolean {
    this.count = 0;
    this.subplot = undefined;
    const q = this.#query;
    q.mode = queryMode(hovermode);
    q.distance = distance;
    q.cx = cx;
    q.cy = cy;
    let best = -1;
    let bestDistance = Infinity;
    // Index loops: this runs every frame while the pointer moves.
    for (let s = 0; s < subplots.length; s++) {
      const sp = subplots[s] as SubplotInfo;
      const r = sp.rect;
      if (cx < r.x || cx > r.x + r.width || cy < r.y || cy > r.y + r.height) continue;
      q.px = cx - r.x;
      q.py = r.y + r.height - cy;
      q.xl = sp.xaxis.scale.p2l(q.px);
      q.yl = sp.yaxis.scale.p2l(q.py);
      const entries = entriesFor(sp);
      for (let e = 0; e < entries.length; e++) {
        const entry = entries[e] as HoverEntry;
        if (entry.skip || !entry.module.hoverPoints) continue;
        const points = entry.module.hoverPoints(
          entry.calc,
          entry.trace,
          q as HoverQuery,
          entry.ctx,
        );
        for (let k = 0; k < points.length; k++) {
          const p = points[k] as HoverPoint;
          if (!(p.distance <= distance)) continue;
          // `<=`: on ties the later (topmost) trace wins, as drawn.
          if (p.distance <= bestDistance) {
            bestDistance = p.distance;
            best = this.count;
          }
          this.#push(entry, p);
        }
      }
    }
    // Domain traces (pie): figure px from the bottom-left corner, always `closest` (Plotly shows
    // one pie label whatever `hovermode` says). Asked last, so on ties they win like topmost.
    if (domain.entries.length > 0) {
      q.mode = 'closest';
      q.px = cx;
      q.py = domain.height - cy;
      q.xl = q.px;
      q.yl = q.py;
      for (let e = 0; e < domain.entries.length; e++) {
        const entry = domain.entries[e] as HoverEntry;
        if (entry.skip || !entry.module.hoverPoints) continue;
        const points = entry.module.hoverPoints(
          entry.calc,
          entry.trace,
          q as HoverQuery,
          entry.ctx,
        );
        for (let k = 0; k < points.length; k++) {
          const p = points[k] as HoverPoint;
          if (!(p.distance <= distance)) continue;
          if (p.distance <= bestDistance) {
            bestDistance = p.distance;
            best = this.count;
          }
          this.#push(entry, p);
        }
      }
    }
    if (best >= 0) {
      const winner = this.found[best] as Found;
      this.subplot = winner.entry.subplot;
      // A domain trace's label stands alone (no common axis label to share).
      if (hovermode === 'closest' || !winner.entry.subplot) {
        // Closest shows one point: move the winner to the front.
        const first = this.found[0] as Found;
        this.found[0] = winner;
        this.found[best] = first;
        this.count = 1;
      }
    }
    return this.#commit();
  }

  /** Replace the result with explicit points (programmatic hover). Returns whether it changed. */
  set(points: readonly Found[]): boolean {
    this.count = 0;
    for (const f of points) this.#push(f.entry, f.point);
    this.subplot = points[0]?.entry.subplot;
    return this.#commit();
  }

  #commit(): boolean {
    const n = this.count;
    let changed = n !== this.#prevTrace.length;
    if (!changed) {
      for (let i = 0; i < n; i++) {
        const f = this.found[i] as Found;
        if (f.entry.index !== this.#prevTrace[i] || f.point.pointIndex !== this.#prevPoint[i]) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      this.#prevTrace.length = n;
      this.#prevPoint.length = n;
      for (let i = 0; i < n; i++) {
        const f = this.found[i] as Found;
        this.#prevTrace[i] = f.entry.index;
        this.#prevPoint[i] = f.point.pointIndex;
      }
    }
    return changed;
  }
}

// ---- Event points -------------------------------------------------------------------------------

/** The data value of `letter` for a hovered point: reported by the trace, else from the data. */
function dataValue(entry: HoverEntry, p: HoverPoint, letter: 'x' | 'y'): unknown {
  const v = p[letter];
  return v !== undefined ? v : perPoint(entry.trace[letter], p.pointIndex);
}

/** Container px of a hover point's label anchor. */
export function anchorOf(entry: HoverEntry, p: HoverPoint): { x: number; y: number } {
  const r = entry.rect;
  return { x: r.x + p.px, y: r.y + r.height - p.py };
}

/** A Plotly-shaped event point (plan E6.1: `data`, `fullData`, `curveNumber`, `pointNumber`, …). */
export function buildPoint(entry: HoverEntry, p: HoverPoint, withBbox: boolean): ChartPoint {
  const i = p.pointIndex;
  const trace = entry.trace;
  const out: Record<string, unknown> = { ...(p.fields ?? {}) };
  out['data'] = entry.input;
  out['fullData'] = trace;
  out['curveNumber'] = entry.index;
  // `pointIndex < 0`: no data point behind the hover (a scatter fill); Plotly omits the index.
  if (i >= 0) {
    out['pointNumber'] = i;
    out['pointIndex'] = i;
  }
  if (p.pointIndices) out['pointNumbers'] = p.pointIndices;
  // Domain traces have no x/y (pie reports label/value/percent through `fields`).
  const x = dataValue(entry, p, 'x');
  const y = dataValue(entry, p, 'y');
  if (x !== undefined || entry.subplot) out['x'] = x;
  if (y !== undefined || entry.subplot) out['y'] = y;
  const z = p.fields?.['z'];
  if (z !== undefined) out['z'] = z;
  const customdata = perPoint(traceAttr(trace, entry.input, 'customdata'), i);
  if (customdata !== undefined) out['customdata'] = customdata;
  const text = p.text ?? perPoint(trace['text'], i);
  if (text !== undefined) out['text'] = text;
  const hovertext = perPoint(traceAttr(trace, entry.input, 'hovertext'), i);
  if (hovertext !== undefined) out['hovertext'] = hovertext;
  if (entry.ctx.xaxis) out['xaxis'] = entry.ctx.xaxis;
  if (entry.ctx.yaxis) out['yaxis'] = entry.ctx.yaxis;
  if (withBbox) {
    const a = anchorOf(entry, p);
    out['bbox'] = { x0: a.x, x1: a.x, y0: a.y, y1: a.y };
  }
  return out as unknown as ChartPoint;
}

// ---- Label content ------------------------------------------------------------------------------

/** Resolved style of one hover label (E5.7: `hoverlabel.*` at trace and layout level). */
export interface LabelStyle {
  bgcolor: string;
  bordercolor: string;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  align: 'left' | 'right' | 'auto';
  namelength: number;
  showarrow: boolean;
  /** CSS for the E8.3 font fields (labels are DOM, so these map directly). Unset: CSS default. */
  fontCss?: FontCss;
}

/** CSS properties of a Plotly font's weight, style and E8.3 extras. */
export interface FontCss {
  fontWeight?: string;
  fontStyle?: string;
  fontVariant?: string;
  textTransform?: string;
  textDecorationLine?: string;
  textShadow?: string;
}

const TEXTCASE_CSS: Readonly<Record<string, string>> = {
  normal: 'none',
  'word caps': 'capitalize',
  upper: 'uppercase',
  lower: 'lowercase',
};
const LINEPOSITION_CSS: Readonly<Record<string, string>> = {
  under: 'underline',
  over: 'overline',
  through: 'line-through',
};

/**
 * CSS for a font's `weight`, `style`, `variant`, `textcase`, `lineposition` and `shadow` (Plotly
 * semantics; `shadow: 'auto'` is Plotly's 1px outline in the contrast color of `color`).
 */
export function fontCss(get: (field: string) => unknown, color: string): FontCss {
  const out: FontCss = {};
  const weight = get('weight');
  if (typeof weight === 'number' || typeof weight === 'string') out.fontWeight = String(weight);
  const style = str(get('style'));
  if (style) out.fontStyle = style;
  const variant = str(get('variant'));
  if (variant) out.fontVariant = variant;
  const textcase = str(get('textcase'));
  if (textcase && TEXTCASE_CSS[textcase]) out.textTransform = TEXTCASE_CSS[textcase];
  const lineposition = str(get('lineposition'));
  if (lineposition) {
    const lines = lineposition
      .split('+')
      .map((f) => LINEPOSITION_CSS[f])
      .filter((v): v is string => v !== undefined);
    out.textDecorationLine = lines.length > 0 ? lines.join(' ') : 'none';
  }
  const shadow = str(get('shadow'));
  if (shadow === 'auto') {
    const c = contrastColor(color);
    out.textShadow = `1px 1px 1px ${c}, -1px -1px 1px ${c}, 1px -1px 1px ${c}, -1px 1px 1px ${c}`;
  } else if (shadow) out.textShadow = shadow;
  return out;
}

/** What one hover label shows. */
export interface LabelSpec {
  /** Main text (Plotly pseudo-HTML). Empty: no label for this point (`hoverinfo: 'none'`). */
  text: string;
  /** Secondary box (the trace name); empty or undefined hides it. */
  extra: string | undefined;
  /** The point color (unified swatch, default background). */
  color: string;
  style: LabelStyle;
  /** Anchor in container px. */
  ax: number;
  ay: number;
  traceIndex: number;
}

/** A readable text color on `bg` (Plotly's contrast rule: light text on dark backgrounds). */
export function contrastColor(bg: string): string {
  const c = toRGBA(bg);
  // Nearly transparent backgrounds show the (usually light) paper: keep dark text.
  if (!c || c[3] < 0.2) return '#444';
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return lum < 0.5 ? '#fff' : '#444';
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** The color a trace draws point `i` with (for label backgrounds). */
export function pointColor(entry: HoverEntry, p: HoverPoint, fullLayout: FullLayout): string {
  if (p.color) return p.color;
  const t = entry.trace;
  const marker = t['marker'] as Record<string, unknown> | undefined;
  const line = t['line'] as Record<string, unknown> | undefined;
  const c =
    str(perPoint(marker?.['color'], p.pointIndex)) ?? str(line?.['color']) ?? str(t['fillcolor']);
  if (c) return c;
  const colorway = fullLayout['colorway'];
  if (Array.isArray(colorway) && colorway.length > 0) {
    return String(colorway[entry.index % colorway.length]);
  }
  return '#1f77b4';
}

/** `hoverlabel.*` for one point: trace value (per point when an array), else layout, else default. */
export function labelStyle(
  entry: HoverEntry,
  pointIndex: number,
  color: string,
  fullLayout: FullLayout,
  unified: boolean,
): LabelStyle {
  const layoutLabel = (fullLayout['hoverlabel'] ?? {}) as Record<string, unknown>;
  const traceLabel = (traceAttr(entry.trace, entry.input, 'hoverlabel') ?? {}) as Record<
    string,
    unknown
  >;
  const get = (path: string): unknown => {
    const [a, b] = path.split('.') as [string, string | undefined];
    const fromTrace = b
      ? (traceLabel[a] as Record<string, unknown> | undefined)?.[b]
      : traceLabel[a];
    const v = perPoint(fromTrace, pointIndex);
    if (v !== undefined && v !== null) return v;
    return b ? (layoutLabel[a] as Record<string, unknown> | undefined)?.[b] : layoutLabel[a];
  };
  const font = (fullLayout['font'] ?? {}) as Record<string, unknown>;
  const paper = str(fullLayout['paper_bgcolor']) ?? '#fff';
  const bgcolor = str(get('bgcolor')) ?? (unified ? paper : color);
  const fontColor = str(get('font.color')) ?? contrastColor(bgcolor);
  return {
    bgcolor,
    bordercolor: str(get('bordercolor')) ?? (unified ? '#444' : contrastColor(bgcolor)),
    fontFamily: str(get('font.family')) ?? str(font['family']) ?? 'sans-serif',
    fontSize: Number(get('font.size') ?? 13) || 13,
    fontColor,
    align: (['left', 'right', 'auto'] as const).find((a) => a === get('align')) ?? 'auto',
    namelength: Number(get('namelength') ?? 15),
    showarrow: get('showarrow') !== false,
    // Plotly coerces `hoverlabel.font` from `layout.font`: unset fields inherit it.
    fontCss: fontCss((field) => get(`font.${field}`) ?? font[field], fontColor),
  };
}

/** Axis hover text of a data value (`hoverformat`, dates, categories). */
export function axisLabel(axis: AxisInfo | undefined, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (!axis) return String(value);
  try {
    const l = axis.scale.d2l(value);
    if (!Number.isFinite(l)) return String(value);
    return formatValue(axis.scale, axis.full, l, true);
  } catch {
    return String(value);
  }
}

/** Shorten a trace name to `namelength` characters (`-1`: all). */
export function truncateName(name: string, namelength: number): string {
  if (namelength < 0 || name.length <= namelength) return name;
  if (namelength === 0) return '';
  return `${name.slice(0, Math.max(0, namelength - 3))}...`;
}

function hoverinfoFlags(v: unknown): Set<string> {
  const s = typeof v === 'string' && v !== '' ? v : 'all';
  if (s === 'all') return new Set(['x', 'y', 'z', 'text', 'name']);
  return new Set(s.split('+'));
}

/**
 * Label text for one hovered point (E5.7): `hovertemplate` (with `<extra>`), else the `hoverinfo`
 * flags. `mode` decides the default layout: `closest` shows `(x, y)`, `x`/`y` only the value along
 * the other axis (the hovered axis value goes in a common label), unified rows read `name: value`.
 */
export function labelText(
  entry: HoverEntry,
  p: HoverPoint,
  hovermode: Exclude<Hovermode, false>,
  showName: boolean,
  fullLayout: FullLayout,
): { text: string; extra: string | undefined } {
  const trace = entry.trace;
  const i = p.pointIndex;
  const x = dataValue(entry, p, 'x');
  const y = dataValue(entry, p, 'y');
  const xLabel = axisLabel(entry.ctx.xaxis, x);
  const yLabel = axisLabel(entry.ctx.yaxis, y);
  const name = String(trace['name'] ?? '');
  const template = perPoint(traceAttr(trace, entry.input, 'hovertemplate'), i);
  const hovertext = perPoint(traceAttr(trace, entry.input, 'hovertext'), i);
  const text = hovertext ?? p.text ?? perPoint(trace['text'], i);
  const style = labelStyle(entry, i, '#000', fullLayout, false);
  // Templates read point data; a hover with no point behind it (a fill) never uses one (Plotly).
  if (typeof template === 'string' && template !== '' && i >= 0) {
    const values: Record<string, unknown> = { ...(p.fields ?? {}) };
    values['x'] = x;
    values['y'] = y;
    values['pointNumber'] = i;
    values['pointIndex'] = i;
    values['curveNumber'] = entry.index;
    if (text !== undefined) values['text'] = text;
    const customdata = perPoint(traceAttr(trace, entry.input, 'customdata'), i);
    if (customdata !== undefined) values['customdata'] = customdata;
    const filled = formatTemplate(
      template,
      {
        values,
        labels: p.labels ? { x: xLabel, y: yLabel, ...p.labels } : { x: xLabel, y: yLabel },
        fullData: trace,
        data: entry.input,
        pointIndex: i,
      },
      { fallback: String(traceAttr(trace, entry.input, 'hovertemplatefallback') ?? '-') },
    );
    const split = splitExtra(filled);
    return {
      text: split.text,
      extra: split.extra ?? truncateName(name, style.namelength),
    };
  }
  const info = perPoint(traceAttr(trace, entry.input, 'hoverinfo'), i);
  if (info === 'none' || info === 'skip') return { text: '', extra: undefined };
  const flags = hoverinfoFlags(info);
  if (p.hoverText !== undefined) {
    // The trace built its own lines from its `hoverinfo` flags (pie: label, value, percent; a
    // scatter fill: its text or name). The name box is left out when it would repeat the label.
    const extra =
      flags.has('name') && showName && p.hoverText !== name
        ? truncateName(name, style.namelength)
        : undefined;
    return { text: p.hoverText, extra };
  }
  const lines: string[] = [];
  const unified = hovermode === 'x unified' || hovermode === 'y unified';
  const axisValue =
    hovermode === 'closest'
      ? flags.has('x') && flags.has('y')
        ? `(${xLabel}, ${yLabel})`
        : flags.has('x')
          ? xLabel
          : flags.has('y')
            ? yLabel
            : ''
      : queryMode(hovermode) === 'x'
        ? flags.has('y')
          ? yLabel
          : ''
        : flags.has('x')
          ? xLabel
          : '';
  if (unified) {
    const n = flags.has('name') ? truncateName(name, style.namelength) : '';
    lines.push(n && axisValue ? `${n} : ${axisValue}` : n || axisValue);
  } else if (axisValue) lines.push(axisValue);
  if (flags.has('text') && text !== undefined && text !== null && text !== '') {
    lines.push(String(text));
  }
  const extra =
    !unified && flags.has('name') && showName ? truncateName(name, style.namelength) : undefined;
  return { text: lines.filter((l) => l !== '').join('<br>'), extra };
}
