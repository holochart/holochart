/**
 * Figure layout math (plan E4.1, E4.3): figure size, margins, plot area and subplot rects. Pure;
 * all rects are CSS px with a top-left origin (the container's coordinate system).
 */
import type { FullLayout } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type { MarginPush } from './contracts.ts';

export interface Size {
  width: number;
  height: number;
}

export interface Margins {
  l: number;
  r: number;
  t: number;
  b: number;
}

/**
 * Smallest plot area (CSS px) margins may shrink it to, like Plotly's `minreduced{width,height}`:
 * big margins on a small figure give way instead of leaving no room for data.
 */
export const MIN_PLOT_SIZE = 64;

const MIN_FIGURE_SIZE = 10;

function given(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= MIN_FIGURE_SIZE;
}

/**
 * The figure size: a dimension the user set in `layout` wins; otherwise the container's size
 * (`autosize` semantics: undefined dimensions follow the container); otherwise the layout default
 * (700×450) when the container has no size (e.g. a detached or zero-height element).
 */
export function resolveFigureSize(
  layoutIn: Readonly<Record<string, unknown>>,
  fullLayout: Pick<FullLayout, 'width' | 'height'>,
  container: Readonly<Size>,
): Size {
  const pick = (key: 'width' | 'height'): number => {
    if (given(layoutIn[key])) return Math.round(fullLayout[key]);
    const c = container[key];
    return Math.round(c >= MIN_FIGURE_SIZE ? c : fullLayout[key]);
  };
  return { width: pick('width'), height: pick('height') };
}

function normalizePushes(pushes: readonly MarginPush[], reserved: boolean): Margins {
  const out: Margins = { l: 0, r: 0, t: 0, b: 0 };
  for (const p of pushes) {
    if ((p.reserved === true) !== reserved) continue;
    for (const side of ['l', 'r', 't', 'b'] as const) {
      const v = p[side];
      if (typeof v === 'number' && v > out[side]) out[side] = v;
    }
  }
  return out;
}

/** Scale a pair of margins down so the space between them is at least `MIN_PLOT_SIZE`. */
function fit(a: number, b: number, total: number): [number, number] {
  const room = total - Math.min(MIN_PLOT_SIZE, total);
  const sum = a + b;
  if (sum <= room || sum <= 0) return [a, b];
  const k = room / sum;
  return [a * k, b * k];
}

/**
 * Margins after component pushes (only grow when `margin.autoexpand`) and after shrinking to
 * leave at least {@link MIN_PLOT_SIZE} px of plot area. Single pass; the runtime iterates it for
 * automargin (E4.2).
 *
 * Per side, ordinary pushes compete (the largest wins) and reserved pushes (Plotly's
 * `_reservedMargin`: a container-referenced title with `automargin`) stack on top of them, so
 * the side becomes `max(margin, push + reserved)` — Plotly's `doAutoMargin`, where the requested
 * margin's slack beyond the pushes absorbs the reserved room. `margin.gutter` (a Holochart
 * extension, 0 in Plotly's look) keeps pushed content that far from the figure edge; it is not
 * added where something is reserved, since the reserved component sits between the two.
 */
export function resolveMargins(
  margin: Readonly<Margins> & { readonly autoexpand?: boolean; readonly gutter?: number },
  pushes: readonly MarginPush[],
  size: Readonly<Size>,
): Margins {
  const m: Margins = { l: margin.l, r: margin.r, t: margin.t, b: margin.b };
  if (margin.autoexpand !== false && pushes.length > 0) {
    const pushed = normalizePushes(pushes, false);
    const reserved = normalizePushes(pushes, true);
    const g = typeof margin.gutter === 'number' && margin.gutter > 0 ? margin.gutter : 0;
    for (const side of ['l', 'r', 't', 'b'] as const) {
      const p = pushed[side];
      const r = reserved[side];
      const need = p > 0 && r === 0 ? p + g : p + r;
      m[side] = Math.max(m[side], need);
    }
  }
  [m.l, m.r] = fit(m.l, m.r, size.width);
  [m.t, m.b] = fit(m.t, m.b, size.height);
  return m;
}

/** The plot area inside the margins (paper space [0, 1]² in px), rounded to whole pixels. */
export function plotArea(size: Readonly<Size>, margins: Readonly<Margins>): ViewportRect {
  const x0 = Math.round(margins.l);
  const y0 = Math.round(margins.t);
  const x1 = Math.round(size.width - margins.r);
  const y1 = Math.round(size.height - margins.b);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/**
 * Pixel span of an axis domain along the plot area, rounded so neighbouring subplots share edges
 * exactly. For x: `[left, right]`; for y: `[bottom, top]` in container px (so `start > end`).
 */
export function domainSpan(
  area: Readonly<ViewportRect>,
  letter: 'x' | 'y',
  domain: readonly [number, number],
): { start: number; end: number } {
  const [d0, d1] = domain[0] <= domain[1] ? domain : [domain[1], domain[0]];
  if (letter === 'x') {
    return {
      start: Math.round(area.x + d0 * area.width),
      end: Math.round(area.x + d1 * area.width),
    };
  }
  return {
    start: Math.round(area.y + (1 - d0) * area.height),
    end: Math.round(area.y + (1 - d1) * area.height),
  };
}

/** A subplot's rect from its x and y axis domains (plan E4.3). */
export function subplotRect(
  area: Readonly<ViewportRect>,
  xDomain: readonly [number, number],
  yDomain: readonly [number, number],
): ViewportRect {
  const x = domainSpan(area, 'x', xDomain);
  const y = domainSpan(area, 'y', yDomain);
  return { x: x.start, y: y.end, width: x.end - x.start, height: y.start - y.end };
}

/** Split a cartesian subplot id into its axis ids: `'x2y3'` → `['x2', 'y3']`. */
export function splitSubplotId(id: string): [string, string] | undefined {
  const m = /^(x\d*)(y\d*)$/.exec(id);
  return m ? [m[1] as string, m[2] as string] : undefined;
}

/** Layout key of an axis id: `'x'` → `'xaxis'`, `'y2'` → `'yaxis2'`. */
export function axisName(id: string): string {
  return `${id.charAt(0)}axis${id.slice(1)}`;
}

/**
 * A domain trace's rect (plan E4.5): `domain.x` / `domain.y` fractions (y from the bottom) of the
 * plot area, in container px. Unlike axis spans this is not rounded: circular traces center on it
 * exactly. Reversed or out-of-range fractions are sorted and clamped to [0, 1].
 */
export function domainRect(
  area: Readonly<ViewportRect>,
  x: readonly [number, number],
  y: readonly [number, number],
): ViewportRect {
  const clamp = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  const [x0, x1] = [clamp(x[0]), clamp(x[1])].sort((a, b) => a - b) as [number, number];
  const [y0, y1] = [clamp(y[0]), clamp(y[1])].sort((a, b) => a - b) as [number, number];
  return {
    x: area.x + x0 * area.width,
    y: area.y + (1 - y1) * area.height,
    width: (x1 - x0) * area.width,
    height: (y1 - y0) * area.height,
  };
}

/**
 * The largest rect of aspect ratio `aspect` (width / height) centered in `rect` (plan E4.5:
 * aspect-preserving fit, so pies stay circular in a wide domain).
 */
export function fitAspect(rect: Readonly<ViewportRect>, aspect = 1): ViewportRect {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const width = Math.max(0, Math.min(rect.width, rect.height * a));
  const height = a > 0 ? width / a : 0;
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

/** The circle inscribed in a rect: center (container px) and radius (plan E4.5, pie). */
export function inscribedCircle(rect: Readonly<ViewportRect>): {
  cx: number;
  cy: number;
  r: number;
} {
  return {
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2,
    r: Math.max(0, Math.min(rect.width, rect.height) / 2),
  };
}
