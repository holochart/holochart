/**
 * Helpers shared by the parallel-coordinates (`parcoords`) and parallel-categories (`parcats`)
 * traces: their font containers, the `line` colorscale (Plotly's `colorScaleAttrs('line')` with a
 * trace-level colorbar), colors that follow the paper (Plotly draws both traces' chrome in black,
 * which vanishes on a dark page) and the chart that owns a pointer event.
 */
import {
  attr,
  isArrayLike,
  toRGBA,
  type FullLayout,
  type FullTrace,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import {
  sampleColorscale,
  type Colorscale,
  type RGBA,
  type TextFont,
  type TextFontWeight,
} from '@mk7s/holochart-render';
import {
  colorbarAttributes,
  resolveColorscale,
  rgbaToCss,
  supplyColorbarDefaults,
} from '@mk7s/holochart-traces-basic';
import { getChart, type ColorbarSpec, type ComponentPointerEvent } from '@mk7s/holochart-runtime';

// ---- Schema ------------------------------------------------------------------------------------

/** A font container (`labelfont`, `tickfont`, …) whose fields default from `layout.font`. */
export function traceFont(description: string) {
  return attr.object(
    {
      family: attr.string({
        noBlank: true,
        strict: true,
        editType: 'plot',
        description: 'CSS font-family list. Default: `layout.font.family`.',
      }),
      size: attr.number({ min: 1, editType: 'plot', description: 'Font size in CSS px.' }),
      color: attr.color({
        editType: 'style',
        description: 'Text color. Default: `layout.font.color`.',
      }),
      weight: attr.integer({
        min: 1,
        max: 1000,
        extras: ['normal', 'bold'],
        editType: 'plot',
        description: 'Font weight: a CSS numeric weight (1–1000), `normal` or `bold`.',
      }),
      style: attr.enumerated({
        values: ['normal', 'italic'],
        editType: 'plot',
        description: 'Font style.',
      }),
      shadow: attr.string({
        editType: 'plot',
        description:
          "CSS `text-shadow` (first shadow only), `'none'`, or `'auto'`: a thin halo in the text's contrast color. Tick labels default to `'auto'`, so they read over the lines.",
      }),
    },
    { editType: 'plot', description },
  );
}

/**
 * The colorscale attributes of a trace's `line` (Plotly `colorScaleAttrs('line')`), minus
 * `coloraxis`: `colorscale`, `autocolorscale`, `reversescale`, `cauto`, `cmin`, `cmax`, `cmid`,
 * `showscale` and `colorbar`. The mapping is recomputed by the view (`style`).
 */
export function lineColorscaleAttributes(what: string, colorscaleDflt?: string) {
  return {
    colorscale: attr.colorscale({
      ...(colorscaleDflt ? { dflt: colorscaleDflt } : {}),
      editType: 'style',
      description: `Colorscale for numeric \`line.color\` values (${what}): a name (\`'Viridis'\`, \`'RdBu'\`, …), a list of colors, or \`[position, color]\` stops from 0 to 1.`,
    }),
    autocolorscale: attr.boolean({
      editType: 'style',
      description:
        'Pick the colorscale from the sign of the color domain (`layout.colorscale.sequential`, `sequentialminus` or `diverging`) instead of `colorscale`.',
    }),
    reversescale: attr.boolean({
      dflt: false,
      editType: 'style',
      description: 'Reverse the colorscale (the lowest value gets the last color).',
    }),
    cauto: attr.boolean({
      editType: 'style',
      description:
        'Compute the color domain from the numeric `line.color` values. Defaults to false when both `cmin` and `cmax` are given.',
    }),
    cmin: attr.number({
      editType: 'style',
      description: 'Value mapped to the first colorscale color (with `cmax`; turns `cauto` off).',
    }),
    cmax: attr.number({
      editType: 'style',
      description: 'Value mapped to the last colorscale color (with `cmin`; turns `cauto` off).',
    }),
    cmid: attr.number({
      editType: 'style',
      description:
        'With `cauto`, widen the automatic domain so it is symmetric around this value (diverging data).',
    }),
    showscale: attr.boolean({
      dflt: false,
      editType: 'colorbars',
      description: 'Show a colorbar for the line colorscale.',
    }),
    colorbar: colorbarAttributes,
  } as const;
}

// ---- Defaults ----------------------------------------------------------------------------------

function numeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Whether a value is an array with at least one finite number (a colorscaled `line.color`). */
export function isNumericColorArray(v: unknown): v is ArrayLike<unknown> {
  if (!isArrayLike(v)) return false;
  for (let i = 0; i < v.length; i++) if (numeric(v[i])) return true;
  return false;
}

/**
 * `line.color` and its colorscale (Plotly's parcoords / parcats `handleLineDefaults` with
 * `colorScaleDefaults(…, { prefix: 'line.', cLetter: 'c' })`): the color defaults to the trace's
 * colorway color; a numeric array turns the colorscale on. `autocolorscale` defaults to
 * `autoColorDflt` (parcoords: false, so its Viridis `colorscale` applies; parcats: true unless a
 * `colorscale` is given, as for most traces). Returns the numeric color array's length, or
 * `Infinity`.
 */
export function supplyLineDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
  autoColorDflt = false,
): number {
  const color = ctx.coerce('line.color', ctx.defaultColor);
  if (!isArrayLike(color)) return Infinity;
  if (color.length === 0 || !isNumericColorArray(color)) {
    (traceOut['line'] as Record<string, unknown>)['color'] = ctx.defaultColor;
    return Infinity;
  }
  const lineIn = (traceIn['line'] ?? {}) as Record<string, unknown>;
  const validMinMax =
    numeric(lineIn['cmin']) && numeric(lineIn['cmax']) && lineIn['cmin'] < lineIn['cmax'];
  if (ctx.coerce<boolean>('line.cauto', !validMinMax)) ctx.coerce('line.cmid');
  else {
    ctx.coerce('line.cmin');
    ctx.coerce('line.cmax');
  }
  const scaleIn = lineIn['colorscale'];
  const validScale = typeof scaleIn === 'string' || (Array.isArray(scaleIn) && scaleIn.length >= 2);
  ctx.coerce('line.autocolorscale', autoColorDflt && !validScale);
  ctx.coerce('line.colorscale');
  ctx.coerce('line.reversescale');
  if (ctx.coerce<boolean>('line.showscale') === true) {
    supplyColorbarDefaults(ctx.coerce, 'line.');
  }
  return color.length;
}

/**
 * Plotly's font default for these traces: `layout.font`, sized `round(size × scale)`; tick labels
 * (`tickfont`) get the `'auto'` halo, as in Plotly, other fonts `layout.font.shadow`.
 */
export function supplyFontDefaults(ctx: TraceDefaultsContext, path: string, scale: number): void {
  const font = ctx.fullLayout.font;
  ctx.coerceContainer(path, {
    family: font.family,
    size: Math.round(font.size * scale),
    color: font.color,
    weight: font.weight,
    style: font.style,
    shadow: path === 'tickfont' ? 'auto' : (font as { shadow?: unknown }).shadow,
  });
}

// ---- Colors ------------------------------------------------------------------------------------

/** A resolved `line` colorscale. */
export interface LineColorMapping {
  readonly colorscale: Colorscale;
  readonly cmin: number;
  readonly cmax: number;
  readonly reversescale: boolean;
}

/** Finite min / max of numeric values. */
export function finiteExtent(values: ArrayLike<unknown>, length = values.length): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < length; i++) {
    const v = values[i];
    if (!numeric(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

function autoScale(min: number, max: number, fullLayout: FullLayout | undefined): Colorscale {
  const which = min * max < 0 ? 'diverging' : min >= 0 ? 'sequential' : 'sequentialminus';
  const scales = fullLayout?.['colorscale'];
  const value =
    scales !== null && typeof scales === 'object'
      ? (scales as Record<string, unknown>)[which]
      : undefined;
  const fallback = { diverging: 'RdBu', sequential: 'Reds', sequentialminus: 'Blues' }[which];
  return resolveColorscale(value) ?? resolveColorscale(fallback)!;
}

/**
 * The colorscale mapping of a trace's numeric `line.color` (Plotly `colorscale/calc.js`), or
 * `undefined` when the lines have one plain color. `extent` defaults to the colors' own extent.
 */
export function lineColorMapping(
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
  extent?: readonly [number, number],
): LineColorMapping | undefined {
  const line = (trace['line'] ?? {}) as Record<string, unknown>;
  const color = line['color'];
  if (!isNumericColorArray(color) || line['cauto'] === undefined) return undefined;
  const [lo, hi] = extent ?? finiteExtent(color);
  const auto = line['cauto'] !== false;
  let min = !auto && numeric(line['cmin']) ? line['cmin'] : lo;
  let max = !auto && numeric(line['cmax']) ? line['cmax'] : hi;
  const mid = line['cmid'];
  if (auto && numeric(mid) && min <= max) {
    if (max - mid > mid - min) min = mid - (max - mid);
    else if (max - mid < mid - min) max = mid + (mid - min);
  }
  if (!(min <= max)) [min, max] = [0, 1];
  else if (min === max) [min, max] = [min - 0.5, max + 0.5];
  let scale = resolveColorscale(line['colorscale']);
  if (line['autocolorscale'] === true || !scale) scale = autoScale(min, max, fullLayout);
  return { colorscale: scale, cmin: min, cmax: max, reversescale: line['reversescale'] === true };
}

/** Position of `value` on the colorscale, 0–1 (reversed for `reversescale`; NaN stays NaN). */
export function colorUnit(value: number, mapping: LineColorMapping): number {
  const span = mapping.cmax - mapping.cmin;
  let t = span > 0 ? (value - mapping.cmin) / span : 0.5;
  t = Math.max(0, Math.min(1, t));
  return mapping.reversescale ? 1 - t : t;
}

/** A 256-entry RGBA lookup table of a colorscale (sRGB 0–1), for coloring many lines fast. */
export function colorLUT(scale: Colorscale, size = 256): Float32Array {
  const out = new Float32Array(size * 4);
  const rgba: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < size; i++) {
    sampleColorscale(scale, i / (size - 1), rgba);
    out.set(rgba, i * 4);
  }
  return out;
}

/** CSS color of `value` under `mapping` (hover labels, band colors). */
export function mappedCss(value: number, mapping: LineColorMapping): string {
  return rgbaToCss(sampleColorscale(mapping.colorscale, colorUnit(value, mapping)));
}

/** The `line` colorbar (the trace module `colorbar` hook): shown with `line.showscale`. */
export function lineColorbar(trace: FullTrace, fullLayout: FullLayout): ColorbarSpec | null {
  if (trace.visible !== true) return null;
  const line = (trace['line'] ?? {}) as Record<string, unknown>;
  if (line['showscale'] !== true) return null;
  const cb = line['colorbar'];
  if (cb === null || typeof cb !== 'object') return null;
  const mapping = lineColorMapping(trace, fullLayout);
  if (!mapping) return null;
  const stops = mapping.colorscale.map(([p, c]): [number, string] => [p, rgbaToCss(c)]);
  return {
    colorscale: mapping.reversescale
      ? stops.map(([p, c]): [number, string] => [1 - p, c]).reverse()
      : stops,
    cmin: mapping.cmin,
    cmax: mapping.cmax,
    attributes: cb as Record<string, unknown>,
  };
}

/** Whether the paper is dark (perceived brightness below half). */
export function darkPaper(fullLayout: FullLayout | undefined): boolean {
  const bg = toRGBA(String(fullLayout?.['paper_bgcolor'] ?? '#fff'));
  if (!bg || bg[3] < 0.5) return false;
  return 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2] < 0.5;
}

/**
 * Plotly's black chrome (`opacity` × black), or white at the same opacity on dark paper, where
 * black would not show.
 */
export function inkColor(fullLayout: FullLayout | undefined, alpha: number): RGBA {
  return darkPaper(fullLayout) ? [1, 1, 1, alpha] : [0, 0, 0, alpha];
}

/** A CSS color → RGBA, or `fallback`. */
export function rgba(v: unknown, fallback: RGBA): RGBA {
  return (typeof v === 'string' ? toRGBA(v) : null) ?? fallback;
}

/** A defaulted font container → the render layer's font and color. */
export function textFontOf(container: unknown): { font: TextFont; color: RGBA } {
  const f = (container ?? {}) as Record<string, unknown>;
  const size = Number(f['size']);
  const weight = f['weight'];
  return {
    font: {
      family: typeof f['family'] === 'string' ? f['family'] : 'sans-serif',
      size: Number.isFinite(size) && size > 0 ? size : 12,
      ...(weight === 'normal' || weight === 'bold' || typeof weight === 'number'
        ? { weight: weight as TextFontWeight }
        : {}),
      ...(f['style'] === 'italic' ? { style: 'italic' as const } : {}),
      ...(typeof f['shadow'] === 'string' && f['shadow'] !== 'none' ? { shadow: f['shadow'] } : {}),
    },
    color: rgba(f['color'], [0.27, 0.27, 0.27, 1]),
  };
}

/** The chart that owns a pointer event's target (the canvas inside the chart's element). */
export function chartOf(event: ComponentPointerEvent): ReturnType<typeof getChart> {
  let node = (event.native?.target ?? null) as Node | null;
  while (node) {
    if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) {
      const chart = getChart(node);
      if (chart) return chart;
    }
    node = node.parentNode;
  }
  return undefined;
}

/** The trace's rect in container px (its domain; the plot area or the viewport otherwise). */
export function traceRect(ctx: {
  readonly domain?: { readonly rect: { x: number; y: number; width: number; height: number } };
  readonly plotArea?: { x: number; y: number; width: number; height: number };
  readonly viewport: { readonly size: { width: number; height: number } };
}): { x: number; y: number; width: number; height: number } {
  const size = ctx.viewport.size;
  const r = ctx.domain?.rect ?? ctx.plotArea ?? { x: 0, y: 0, ...size };
  // Plotly floors the trace group's size to whole px.
  return {
    x: r.x,
    y: r.y,
    width: Math.max(0, Math.floor(r.width)),
    height: Math.max(0, Math.floor(r.height)),
  };
}
