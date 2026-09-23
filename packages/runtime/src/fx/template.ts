/**
 * Plotly-syntax text templates (plan E5.7): `hovertemplate`, and `texttemplate` for trace text.
 *
 * ```
 * %{x}                  the value, preformatted when the caller gives a label (axis hoverformat)
 * %{y:.2f}              d3-format number format
 * %{x|%b %d}            d3-time-format date format (UTC, with Plotly's %f / %h extensions)
 * %{customdata[0]}      paths into the point's values
 * %{marker.size}        per-point value of a trace attribute (arrays are indexed by the point)
 * %{fullData.name}      the defaulted trace; %{data.name} the input trace
 * %{meta[1]}            the trace's `meta`
 * <extra>…</extra>      hover only: the secondary box (trace name); empty hides it
 * ```
 *
 * The formatter is shared: trace packages use {@link formatTemplate} for `texttemplate`.
 */
import {
  dateToMs,
  formatDateLabel,
  formatNumber,
  getIn,
  parsePath,
  type PathSegment,
} from '@mk7s/holochart-core';

/** Where template variables come from. Lookups go in this order; the first defined value wins. */
export interface TemplateContext {
  /**
   * Preformatted text per variable name, used when the variable has no format of its own (Plotly
   * formats `%{x}` / `%{y}` with the axis' `hoverformat` this way).
   */
  readonly labels?: Readonly<Record<string, string | undefined>>;
  /** Point values: `x`, `y`, `text`, `customdata`, `pointNumber`, `marker.size`, … */
  readonly values?: Readonly<Record<string, unknown>>;
  /** The defaulted trace: `%{fullData.*}`, and per-point trace attributes (`%{marker.color}`). */
  readonly fullData?: unknown;
  /** The input trace: `%{data.*}`. */
  readonly data?: unknown;
  /** `%{meta}`; defaults to `fullData.meta`. */
  readonly meta?: unknown;
  /** Index used to pick per-point entries of array attributes found on the trace. */
  readonly pointIndex?: number;
}

/** Options for {@link formatTemplate}. */
export interface TemplateOptions {
  /**
   * Text for variables with no value (Plotly's `hovertemplatefallback`). Default: keep the
   * `%{…}` placeholder as written, so typos stay visible.
   */
  readonly fallback?: string;
}

const VARIABLE = /%\{([^}]*)\}/g;

function isArrayLikeValue(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));
}

function segments(path: string): readonly PathSegment[] | undefined {
  try {
    return parsePath(path);
  } catch {
    return undefined;
  }
}

function lookup(ctx: TemplateContext, name: string): unknown {
  const segs = segments(name);
  if (!segs || segs.length === 0) return undefined;
  const head = segs[0];
  if (head === 'fullData') return getIn(ctx.fullData, segs.slice(1));
  if (head === 'data') return getIn(ctx.data, segs.slice(1));
  if (head === 'meta') {
    const meta = ctx.meta ?? getIn(ctx.fullData, 'meta');
    return segs.length === 1 ? meta : getIn(meta, segs.slice(1));
  }
  const values = ctx.values;
  if (values) {
    // Flat keys first ('marker.size' as reported by a trace), then nested paths.
    if (Object.hasOwn(values, name)) return values[name];
    const v = getIn(values, segs);
    if (v !== undefined) return v;
  }
  const fromTrace = getIn(ctx.fullData, segs);
  if (fromTrace !== undefined && ctx.pointIndex !== undefined && isArrayLikeValue(fromTrace)) {
    return fromTrace[ctx.pointIndex];
  }
  return fromTrace;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  if (v instanceof Date) return v.getTime();
  return NaN;
}

function plain(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (isArrayLikeValue(v)) return Array.from(v, plain).join(',');
  return String(v);
}

function formatOne(value: unknown, spec: string | undefined, dateSpec: string | undefined): string {
  if (dateSpec !== undefined) {
    const ms = dateToMs(value);
    return Number.isFinite(ms) ? formatDateLabel(ms, dateSpec, null) : plain(value);
  }
  if (spec !== undefined && spec !== '') {
    const n = toNumber(value);
    return Number.isFinite(n) ? formatNumber(n, { tickformat: spec }) : plain(value);
  }
  return plain(value);
}

/**
 * Fill a Plotly-syntax template (see the module docs). Formats: `%{v:<d3-format>}` for numbers,
 * `%{v|<d3-time-format>}` for dates; without one, `ctx.labels[v]` when given, else the raw value.
 *
 * @example
 * ```ts
 * formatTemplate('%{x|%b %d}: %{y:.1f} (%{customdata[0]})', {
 *   values: { x: '2026-03-05', y: 3.14159, customdata: ['a'] },
 * }); // 'Mar 05: 3.1 (a)'
 * ```
 */
export function formatTemplate(
  template: string,
  ctx: TemplateContext,
  options: TemplateOptions = {},
): string {
  if (!template.includes('%{')) return template;
  return template.replace(VARIABLE, (match, body: string) => {
    let name = body.trim();
    let spec: string | undefined;
    let dateSpec: string | undefined;
    const bar = name.indexOf('|');
    const colon = name.indexOf(':');
    if (bar >= 0 && (colon < 0 || bar < colon)) {
      dateSpec = name.slice(bar + 1);
      name = name.slice(0, bar).trim();
    } else if (colon >= 0) {
      spec = name.slice(colon + 1);
      name = name.slice(0, colon).trim();
    }
    const value = lookup(ctx, name);
    if (
      value === undefined ||
      value === null ||
      (typeof value === 'number' && Number.isNaN(value))
    ) {
      const label = ctx.labels?.[name];
      if (label !== undefined && spec === undefined && dateSpec === undefined) return label;
      return options.fallback ?? match;
    }
    if (spec === undefined && dateSpec === undefined) {
      const label = ctx.labels?.[name];
      if (label !== undefined) return label;
    }
    return formatOne(value, spec, dateSpec);
  });
}

/**
 * Split a hover text into the main label and the `<extra>` box: `extra` is `undefined` when the
 * template has no `<extra>` tag (the trace name is shown), `''` when the box must be hidden.
 */
export function splitExtra(text: string): { text: string; extra: string | undefined } {
  const m = /<extra>([\s\S]*?)<\/extra>/i.exec(text);
  if (!m) return { text, extra: undefined };
  return { text: text.slice(0, m.index) + text.slice(m.index + m[0].length), extra: m[1] ?? '' };
}
