/**
 * `sankey` supply-defaults (plan E13.5a), following plotly.js' `sankey/defaults.js`: node colors
 * default to the colorway at 0.8 opacity (one per node, group nodes included); link colors to
 * translucent black on light paper and translucent white on dark paper, and `link.hovercolor` to
 * the link color 0.2 more opaque (brightened on dark paper, darkened on light paper once that
 * opaque); `node.hoverinfo` / `link.hoverinfo` default to the trace `hoverinfo`; `arrangement`
 * defaults to `'freeform'` when `node.x` and `node.y` are given; `textfont` follows `layout.font`
 * with the automatic halo. The concentration colorscales of `link.colorscales` are coerced item
 * by item. `link.flow` (flow particles, plan E13.5c) is coerced only when given, so it stays off.
 */
import {
  isArrayLike,
  toRGBA,
  type FullTrace,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';

/** WCAG relative luminance of an sRGB color (tinycolor's `getLuminance`). */
function luminance(c: readonly number[]): number {
  const lin = (v: number): number =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
}

/** Whether the paper is dark (Plotly: luminance below 0.333). */
export function darkBackground(paper: unknown): boolean {
  const c = toRGBA(typeof paper === 'string' ? paper : '#fff');
  return c !== null && luminance(c) < 0.333;
}

/** tinycolor's `toRgbString`. */
export function rgbString(r: number, g: number, b: number, a: number): string {
  const R = Math.round(r * 255);
  const G = Math.round(g * 255);
  const B = Math.round(b * 255);
  const A = Math.round(a * 100) / 100;
  return A === 1 ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${A})`;
}

/** `color` at `alpha` (Plotly's `Color.addOpacity`). */
export function withOpacity(color: string, alpha: number): string {
  const c = toRGBA(color);
  return c ? rgbString(c[0], c[1], c[2], alpha) : color;
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function rgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

/**
 * Plotly's default `link.hovercolor` of a link color: 0.2 more opaque up to 0.8 alpha, else
 * tinycolor's `brighten()` on dark paper or `darken()` on light paper.
 */
export function defaultHoverColor(color: unknown, dark: boolean): unknown {
  if (typeof color !== 'string') return color;
  const c = toRGBA(color);
  if (!c) return color;
  const [r, g, b, a] = c;
  if (a <= 0.8) return rgbString(r, g, b, a + 0.2);
  if (dark) {
    const step = Math.round(255 * 0.1) / 255;
    return rgbString(Math.min(1, r + step), Math.min(1, g + step), Math.min(1, b + step), a);
  }
  const [h, s, l] = hsl(r, g, b);
  const [R, G, B] = rgb(h, s, Math.max(0, l - 0.1));
  return rgbString(R, G, B, a);
}

/** One more than the largest node index a positive link names, as calc counts nodes. */
function nodeCountOf(link: Record<string, unknown>): number {
  const s = isArrayLike(link['source']) ? link['source'] : [];
  const t = isArrayLike(link['target']) ? link['target'] : [];
  const v = isArrayLike(link['value']) ? link['value'] : [];
  let max = -1;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Number(s[i]), Number(t[i]));
  return Number.isFinite(max) ? Math.floor(max) + 1 : 0;
}

export function supplySankeyDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const { fullLayout } = ctx;
  const hoverinfoIn = traceIn['hoverinfo'];
  const partInfo = hoverinfoIn === 'none' || hoverinfoIn === 'skip' ? hoverinfoIn : undefined;
  ctx.coerce('hoverinfo');

  // Links first: the node count (for default node colors) comes from them.
  ctx.coerce('link.label');
  ctx.coerce('link.arrowlen');
  ctx.coerce('link.source');
  ctx.coerce('link.target');
  ctx.coerce('link.value');
  ctx.coerce('link.line.color');
  ctx.coerce('link.line.width');
  ctx.coerce('link.hoverinfo', partInfo);
  ctx.coerce('link.hovertemplate');
  const dark = darkBackground(fullLayout['paper_bgcolor']);
  const linkColor = ctx.coerce(
    'link.color',
    dark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.2)',
  );
  ctx.coerce(
    'link.hovercolor',
    isArrayLike(linkColor)
      ? Array.from(linkColor, (c) => defaultHoverColor(c, dark))
      : defaultHoverColor(linkColor, dark),
  );
  ctx.coerce('link.customdata');
  const flow = ((traceIn['link'] ?? {}) as Record<string, unknown>)['flow'];
  if (flow !== null && typeof flow === 'object') {
    for (const key of ['density', 'speed', 'size', 'color', 'opacity', 'time']) {
      ctx.coerce(`link.flow.${key}`);
    }
  }
  const link = traceOut['link'] as Record<string, unknown>;
  const scalesIn = ((traceIn['link'] ?? {}) as Record<string, unknown>)['colorscales'];
  const scales = Array.isArray(scalesIn) ? scalesIn.map(() => ({}) as Record<string, unknown>) : [];
  link['colorscales'] = scales;
  scales.forEach((_, i) => {
    for (const key of ['label', 'cmin', 'cmax', 'colorscale', 'name']) {
      ctx.coerce(`link.colorscales[${i}].${key}`);
    }
  });

  const labels = ctx.coerce<ArrayLike<unknown> | undefined>('node.label') ?? [];
  const groups = ctx.coerce<unknown[]>('node.groups') ?? [];
  const x = ctx.coerce<ArrayLike<unknown> | undefined>('node.x');
  const y = ctx.coerce<ArrayLike<unknown> | undefined>('node.y');
  ctx.coerce('node.pad');
  ctx.coerce('node.thickness');
  ctx.coerce('node.line.color');
  ctx.coerce('node.line.width');
  ctx.coerce('node.hoverinfo', partInfo);
  ctx.coerce('node.hovertemplate');
  ctx.coerce('node.align');
  const colorway = Array.isArray(fullLayout['colorway'])
    ? (fullLayout['colorway'] as unknown[]).map(String)
    : [ctx.defaultColor];
  const count = Math.max(labels.length, nodeCountOf(link) + groups.length);
  ctx.coerce(
    'node.color',
    Array.from({ length: count }, (_, i) => withOpacity(colorway[i % colorway.length]!, 0.8)),
  );
  ctx.coerce('node.customdata');

  ctx.coerce('orientation');
  ctx.coerce('valueformat');
  ctx.coerce('valuesuffix');
  const fixed = isArrayLike(x) && x.length > 0 && isArrayLike(y) && y.length > 0;
  ctx.coerce('arrangement', fixed ? 'freeform' : undefined);

  const font = fullLayout.font;
  ctx.coerceContainer('textfont', {
    family: font.family,
    size: font.size,
    color: font.color,
    weight: font.weight,
    style: font.style,
    shadow: 'auto',
  });
}
