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

function normalizePushes(pushes: readonly MarginPush[]): Margins {
  const out: Margins = { l: 0, r: 0, t: 0, b: 0 };
  for (const p of pushes) {
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
 * leave at least {@link MIN_PLOT_SIZE} px of plot area. Single pass; the iterative automargin
 * solve is E4.2.
 */
export function resolveMargins(
  margin: Readonly<Margins> & { readonly autoexpand?: boolean },
  pushes: readonly MarginPush[],
  size: Readonly<Size>,
): Margins {
  const m: Margins = { l: margin.l, r: margin.r, t: margin.t, b: margin.b };
  if (margin.autoexpand !== false && pushes.length > 0) {
    const p = normalizePushes(pushes);
    m.l = Math.max(m.l, p.l);
    m.r = Math.max(m.r, p.r);
    m.t = Math.max(m.t, p.t);
    m.b = Math.max(m.b, p.b);
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
