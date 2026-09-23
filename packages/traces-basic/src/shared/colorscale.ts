/**
 * Numeric color arrays → colorscales (plan E9.1, E8.2 subset): the `colorscale`, `cmin`/`cmax`/
 * `cmid`/`cauto`, `autocolorscale`, `reversescale`, `showscale` and `coloraxis` attributes of a
 * color container (`marker`, `marker.line`, later bar markers), their defaults, and the resolved
 * mapping handed to the render layer. Follows plotly.js `components/colorscale`.
 *
 * Shared by every trace with colorscaled colors (scatter, bar). Containers with `showscale` also
 * declare the `colorbar` container (plan E5.3, {@link colorbarAttributes}); the colorbar component
 * draws it from the {@link markerColorbar} spec each trace module's `colorbar` hook returns.
 */
import {
  attr,
  fontSchema,
  isArrayLike,
  layoutSchema,
  type AttrSpec,
  type ColorScale,
  toRGBA,
  type Children,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type ObjectNode,
  type RGBA,
} from '@mk7s/holochart-core';
import { sampleColorscale, type Colorscale } from '@mk7s/holochart-render';
import type { ColorbarSpec } from '@mk7s/holochart-runtime';

/** A colorscale as stops of CSS colors (the defaulted form of a `colorscale` attribute). */
export type CssColorscale = readonly (readonly [number, string])[];

const rgb = (r: number, g: number, b: number): string => `rgb(${r},${g},${b})`;

/** Evenly spaced stops from a list of colors. */
function even(colors: readonly string[]): CssColorscale {
  return colors.map((c, i) => [i / (colors.length - 1), c] as const);
}

/**
 * Plotly's named colorscales (`plotly.js/src/components/colorscale/scales.js`), plus `Plasma`
 * (the sequential scale of Plotly's default template). Names are matched case-insensitively.
 */
export const NAMED_COLORSCALES: Readonly<Record<string, CssColorscale>> = {
  Greys: [
    [0, rgb(0, 0, 0)],
    [1, rgb(255, 255, 255)],
  ],
  YlGnBu: even([
    rgb(8, 29, 88),
    rgb(37, 52, 148),
    rgb(34, 94, 168),
    rgb(29, 145, 192),
    rgb(65, 182, 196),
    rgb(127, 205, 187),
    rgb(199, 233, 180),
    rgb(237, 248, 217),
    rgb(255, 255, 217),
  ]),
  Greens: even([
    rgb(0, 68, 27),
    rgb(0, 109, 44),
    rgb(35, 139, 69),
    rgb(65, 171, 93),
    rgb(116, 196, 118),
    rgb(161, 217, 155),
    rgb(199, 233, 192),
    rgb(229, 245, 224),
    rgb(247, 252, 245),
  ]),
  YlOrRd: even([
    rgb(128, 0, 38),
    rgb(189, 0, 38),
    rgb(227, 26, 28),
    rgb(252, 78, 42),
    rgb(253, 141, 60),
    rgb(254, 178, 76),
    rgb(254, 217, 118),
    rgb(255, 237, 160),
    rgb(255, 255, 204),
  ]),
  Bluered: [
    [0, rgb(0, 0, 255)],
    [1, rgb(255, 0, 0)],
  ],
  RdBu: [
    [0, rgb(5, 10, 172)],
    [0.35, rgb(106, 137, 247)],
    [0.5, rgb(190, 190, 190)],
    [0.6, rgb(220, 170, 132)],
    [0.7, rgb(230, 145, 90)],
    [1, rgb(178, 10, 24)],
  ],
  Reds: [
    [0, rgb(220, 220, 220)],
    [0.2, rgb(245, 195, 157)],
    [0.4, rgb(245, 160, 105)],
    [1, rgb(178, 10, 24)],
  ],
  Blues: [
    [0, rgb(5, 10, 172)],
    [0.35, rgb(40, 60, 190)],
    [0.5, rgb(70, 100, 245)],
    [0.6, rgb(90, 120, 245)],
    [0.7, rgb(106, 137, 247)],
    [1, rgb(220, 220, 220)],
  ],
  Picnic: even([
    rgb(0, 0, 255),
    rgb(51, 153, 255),
    rgb(102, 204, 255),
    rgb(153, 204, 255),
    rgb(204, 204, 255),
    rgb(255, 255, 255),
    rgb(255, 204, 255),
    rgb(255, 153, 255),
    rgb(255, 102, 204),
    rgb(255, 102, 102),
    rgb(255, 0, 0),
  ]),
  Rainbow: even([
    rgb(150, 0, 90),
    rgb(0, 0, 200),
    rgb(0, 25, 255),
    rgb(0, 152, 255),
    rgb(44, 255, 150),
    rgb(151, 255, 0),
    rgb(255, 234, 0),
    rgb(255, 111, 0),
    rgb(255, 0, 0),
  ]),
  Portland: even([
    rgb(12, 51, 131),
    rgb(10, 136, 186),
    rgb(242, 211, 56),
    rgb(242, 143, 56),
    rgb(217, 30, 30),
  ]),
  Jet: [
    [0, rgb(0, 0, 131)],
    [0.125, rgb(0, 60, 170)],
    [0.375, rgb(5, 255, 255)],
    [0.625, rgb(255, 255, 0)],
    [0.875, rgb(250, 0, 0)],
    [1, rgb(128, 0, 0)],
  ],
  Hot: [
    [0, rgb(0, 0, 0)],
    [0.3, rgb(230, 0, 0)],
    [0.6, rgb(255, 210, 0)],
    [1, rgb(255, 255, 255)],
  ],
  Blackbody: [
    [0, rgb(0, 0, 0)],
    [0.2, rgb(230, 0, 0)],
    [0.4, rgb(230, 210, 0)],
    [0.7, rgb(255, 255, 255)],
    [1, rgb(160, 200, 255)],
  ],
  Earth: [
    [0, rgb(0, 0, 130)],
    [0.1, rgb(0, 180, 180)],
    [0.2, rgb(40, 210, 40)],
    [0.4, rgb(230, 230, 50)],
    [0.6, rgb(120, 70, 20)],
    [1, rgb(255, 255, 255)],
  ],
  Electric: [
    [0, rgb(0, 0, 0)],
    [0.15, rgb(30, 0, 100)],
    [0.4, rgb(120, 0, 100)],
    [0.6, rgb(160, 90, 0)],
    [0.8, rgb(230, 200, 0)],
    [1, rgb(255, 250, 220)],
  ],
  Viridis: even([
    '#440154',
    '#48186a',
    '#472d7b',
    '#424086',
    '#3b528b',
    '#33638d',
    '#2c728e',
    '#26828e',
    '#21918c',
    '#1fa088',
    '#28ae80',
    '#3fbc73',
    '#5ec962',
    '#84d44b',
    '#addc30',
    '#d8e219',
    '#fde725',
  ]),
  Cividis: even([
    rgb(0, 32, 76),
    rgb(0, 42, 102),
    rgb(0, 52, 110),
    rgb(39, 63, 108),
    rgb(60, 74, 107),
    rgb(76, 85, 107),
    rgb(91, 95, 109),
    rgb(104, 106, 112),
    rgb(117, 117, 117),
    rgb(131, 129, 120),
    rgb(146, 140, 120),
    rgb(161, 152, 118),
    rgb(176, 165, 114),
    rgb(192, 177, 109),
    rgb(209, 191, 102),
    rgb(225, 204, 92),
    rgb(243, 219, 79),
    rgb(255, 233, 69),
  ]),
  Plasma: even([
    '#0d0887',
    '#46039f',
    '#7201a8',
    '#9c179e',
    '#bd3786',
    '#d8576b',
    '#ed7953',
    '#fb9f3a',
    '#fdca26',
    '#f0f921',
  ]),
};

const NAMES_LOWER = new Map(
  Object.entries(NAMED_COLORSCALES).map(([name, scale]) => [name.toLowerCase(), scale] as const),
);

/**
 * Plotly's automatic colorscales (`layout.colorscale.sequential` / `sequentialminus` /
 * `diverging` defaults), picked by the sign of the color domain when `autocolorscale` is on.
 */
export const AUTO_COLORSCALES = {
  sequential: 'Reds',
  sequentialminus: 'Blues',
  diverging: 'RdBu',
} as const;

const resolvedCache = new WeakMap<object, Colorscale>();
const namedCache = new Map<string, Colorscale>();

function toStops(css: CssColorscale): Colorscale {
  const black: RGBA = [0, 0, 0, 1];
  return css.map(([p, c]) => [p, toRGBA(c) ?? black] as const);
}

/**
 * A defaulted `colorscale` value (a name, or `[position, css color]` stops as core's coercion
 * stores them) → render-layer stops (sRGB 0–1). Unknown names give `undefined`.
 */
export function resolveColorscale(value: unknown): Colorscale | undefined {
  if (typeof value === 'string') {
    const key = value.toLowerCase();
    let hit = namedCache.get(key);
    if (hit === undefined) {
      const css = NAMES_LOWER.get(key);
      if (css === undefined) return undefined;
      hit = toStops(css);
      namedCache.set(key, hit);
    }
    return hit;
  }
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const hit = resolvedCache.get(value);
  if (hit) return hit;
  const stops: [number, RGBA][] = [];
  for (const stop of value as unknown[]) {
    if (!Array.isArray(stop) || typeof stop[0] !== 'number' || typeof stop[1] !== 'string') {
      return undefined;
    }
    const c = toRGBA(stop[1]);
    if (!c) return undefined;
    stops.push([stop[0], c]);
  }
  resolvedCache.set(value, stops);
  return stops;
}

/** Whether a colorscale input (name or stops) is valid, as Plotly's `isValidScale`. */
function isValidScale(value: unknown): boolean {
  if (typeof value === 'string') return NAMES_LOWER.has(value.toLowerCase());
  return Array.isArray(value) && value.length >= 2 && value.every((s) => Array.isArray(s));
}

// ---- Colorbars (E5.3) ---------------------------------------------------------------------------

/** The axis tick attributes a colorbar shares with cartesian axes (same names and semantics). */
const AXIS = layoutSchema.children.xaxis.children;
/** Colorbar edits redraw the colorbar and re-run layout (the colorbar pushes the margins). */
const COLORBAR_EDIT = ['colorbars', 'layout'] as const;

function tickAttr<S extends object>(spec: S, dflt?: unknown): S {
  return { ...spec, editType: COLORBAR_EDIT, ...(dflt !== undefined ? { dflt } : {}) };
}

/**
 * The `colorbar` container of a colorscaled container with `showscale` (`marker.colorbar`,
 * `layout.coloraxisN.colorbar`), following Plotly's colorbar attributes: size and placement,
 * outline, border and background, the axis tick API (the colorbar is a linear axis over
 * `[cmin, cmax]`) and a title.
 */
export const colorbarAttributes = attr.object(
  {
    orientation: attr.enumerated({
      values: ['h', 'v'],
      dflt: 'v',
      description: 'Vertical bar (`v`, beside the plot) or horizontal bar (`h`, above or below).',
    }),
    thicknessmode: attr.enumerated({
      values: ['fraction', 'pixels'],
      dflt: 'pixels',
      description: 'Unit of `thickness`: px, or a fraction of the plot width (`v`) / height (`h`).',
    }),
    thickness: attr.number({ min: 0, dflt: 30, description: 'Thickness of the color bar.' }),
    lenmode: attr.enumerated({
      values: ['fraction', 'pixels'],
      dflt: 'fraction',
      description: 'Unit of `len`: px, or a fraction of the plot height (`v`) / width (`h`).',
    }),
    len: attr.number({
      min: 0,
      dflt: 1,
      description: 'Length of the colorbar along its axis, padding included (`ypad` / `xpad`).',
    }),
    x: attr.number({
      description:
        'Horizontal position (`xref` fraction). Defaults to 1.02 (`v`, paper), 1 (`v`, container) or 0.5 (`h`).',
    }),
    xref: attr.enumerated({
      values: ['container', 'paper'],
      dflt: 'paper',
      description: 'Reference of `x`: the plot area (`paper`) or the whole figure.',
    }),
    xanchor: attr.enumerated({
      values: ['left', 'center', 'right'],
      description:
        'Which side of the colorbar sits at `x`. Defaults to `left` (`v`, paper), `right` (`v`, container) or `center` (`h`).',
    }),
    xpad: attr.number({ min: 0, dflt: 10, description: 'Horizontal padding, px.' }),
    y: attr.number({
      description:
        'Vertical position (`yref` fraction). Defaults to 0.5 (`v`), 1.02 (`h`, paper) or 1 (`h`, container).',
    }),
    yref: attr.enumerated({
      values: ['container', 'paper'],
      dflt: 'paper',
      description: 'Reference of `y`: the plot area (`paper`) or the whole figure.',
    }),
    yanchor: attr.enumerated({
      values: ['top', 'middle', 'bottom'],
      description:
        'Which side of the colorbar sits at `y`. Defaults to `middle` (`v`), `bottom` (`h`, paper) or `top` (`h`, container).',
    }),
    ypad: attr.number({ min: 0, dflt: 10, description: 'Vertical padding, px.' }),
    outlinecolor: attr.color({ dflt: '#444', description: 'Color of the outline around the bar.' }),
    outlinewidth: attr.number({ min: 0, dflt: 1, description: 'Outline width, px.' }),
    bordercolor: attr.color({ dflt: '#444', description: 'Border color of the colorbar box.' }),
    borderwidth: attr.number({ min: 0, dflt: 0, description: 'Border width of the box, px.' }),
    bgcolor: attr.color({ dflt: 'rgba(0,0,0,0)', description: 'Background of the box.' }),
    tickmode: tickAttr(AXIS.tickmode),
    nticks: tickAttr(AXIS.nticks),
    tick0: tickAttr(AXIS.tick0),
    dtick: tickAttr(AXIS.dtick),
    tickvals: tickAttr(AXIS.tickvals),
    ticktext: tickAttr(AXIS.ticktext),
    ticks: tickAttr(AXIS.ticks),
    ticklen: tickAttr(AXIS.ticklen),
    tickwidth: tickAttr(AXIS.tickwidth),
    tickcolor: tickAttr(AXIS.tickcolor, '#444'),
    ticklabelposition: attr.enumerated({
      values: [
        'outside',
        'inside',
        'outside top',
        'inside top',
        'outside bottom',
        'inside bottom',
        'outside left',
        'inside left',
        'outside right',
        'inside right',
      ],
      dflt: 'outside',
      description:
        'Tick labels outside the bar (away from it) or inside (over it); `top`/`bottom` (`v`) or `left`/`right` (`h`) move them beside their tick.',
    }),
    ticklabeloverflow: attr.enumerated({
      values: ['allow', 'hide past div', 'hide past domain'],
      description:
        'Hide labels past the figure or past the bar. Defaults to `hide past domain` for inside labels, else `hide past div`.',
    }),
    ticklabelstep: tickAttr(AXIS.ticklabelstep),
    showticklabels: tickAttr(AXIS.showticklabels),
    tickfont: fontSchema('Tick-label font. Defaults to `layout.font`.'),
    tickangle: tickAttr(AXIS.tickangle),
    tickformat: tickAttr(AXIS.tickformat),
    tickprefix: tickAttr(AXIS.tickprefix),
    showtickprefix: tickAttr(AXIS.showtickprefix),
    ticksuffix: tickAttr(AXIS.ticksuffix),
    showticksuffix: tickAttr(AXIS.showticksuffix),
    separatethousands: tickAttr(AXIS.separatethousands),
    exponentformat: tickAttr(AXIS.exponentformat),
    minexponent: tickAttr(AXIS.minexponent),
    showexponent: tickAttr(AXIS.showexponent),
    title: attr.object(
      {
        text: attr.string({ dflt: '', description: 'Colorbar title.' }),
        font: fontSchema(
          'Title font. Defaults to `layout.font` with the tick-label family and 1.2 × its size.',
        ),
        side: attr.enumerated({
          values: ['right', 'top', 'bottom'],
          description:
            'Where the title goes relative to the bar. Defaults to `top` (`v`) or `right` (`h`).',
        }),
      },
      { editType: COLORBAR_EDIT, description: 'Colorbar title.' },
    ),
  },
  { editType: COLORBAR_EDIT, description: 'The colorbar of this colorscale (plan E5.3).' },
);

/** Coerce every leaf of `node` at `prefix` (object nodes recurse), with per-path defaults. */
function coerceLeaves(
  node: ObjectNode,
  coerce: Coerce,
  prefix: string,
  overrides: Readonly<Record<string, unknown>>,
  rel = '',
): void {
  for (const [key, child] of Object.entries(node.children)) {
    const path = rel === '' ? key : `${rel}.${key}`;
    if (child.kind === 'object') coerceLeaves(child, coerce, prefix, overrides, path);
    else if (child.kind === 'attr') coerce(`${prefix}${path}`, overrides[path]);
  }
}

/**
 * Plotly's `colorbar/defaults.js` for the container at `prefix` (`'marker.'`, `'coloraxis.'`):
 * position, anchors, title side and label overflow depend on `orientation` and the refs. Fonts
 * stay unset where the user gave none; the colorbar component inherits them when drawing.
 */
export function supplyColorbarDefaults(coerce: Coerce, prefix: string): void {
  const p = `${prefix}colorbar.`;
  const vertical = coerce<string>(`${p}orientation`) !== 'h';
  const paperX = coerce<string>(`${p}xref`) === 'paper';
  const paperY = coerce<string>(`${p}yref`) === 'paper';
  const position = coerce<string>(`${p}ticklabelposition`);
  coerceLeaves(colorbarAttributes, coerce, p, {
    x: vertical ? (paperX ? 1.02 : 1) : 0.5,
    xanchor: vertical ? (paperX ? 'left' : 'right') : 'center',
    y: vertical ? 0.5 : paperY ? 1.02 : 1,
    yanchor: vertical ? 'middle' : paperY ? 'bottom' : 'top',
    ticklabeloverflow: position.includes('inside') ? 'hide past domain' : 'hide past div',
    'title.side': vertical ? 'top' : 'right',
  });
}

/** CSS stops of a render colorscale, reversed for `reversescale`. */
function cssStops(scale: Colorscale, reverse: boolean): [number, string][] {
  const stops = scale.map(([p, c]): [number, string] => [p, rgbaToCss(c)]);
  return reverse ? stops.map(([p, c]): [number, string] => [1 - p, c]).reverse() : stops;
}

/**
 * The colorbar of a trace's colorscaled container (the trace module `colorbar` hook, E5.3): the
 * container's own bar when it has `showscale: true` and numeric colors, or, when it references a
 * color axis, that axis' bar (`layout.coloraxisN.showscale`, shared by every trace on the axis).
 * `null` when no bar is shown or the trace is not visible.
 */
export function markerColorbar(
  trace: FullTrace,
  fullLayout: FullLayout,
  path = 'marker',
): ColorbarSpec | null {
  if (trace.visible !== true) return null;
  const container = containerAt(trace, path);
  if (container === null || typeof container !== 'object') return null;
  const c = container as Record<string, unknown>;
  const axisId = typeof c['coloraxis'] === 'string' ? c['coloraxis'] : undefined;
  const owner = axisId ? axisContainer(fullLayout, axisId) : c;
  if (!owner || owner['showscale'] !== true) return null;
  const cb = owner['colorbar'];
  if (cb === null || typeof cb !== 'object') return null;
  const mapping = resolveColorMapping(c, fullLayout);
  if (!mapping) return null;
  return {
    colorscale: cssStops(mapping.colorscale, mapping.reversescale),
    cmin: mapping.cmin,
    cmax: mapping.cmax,
    ...(axisId ? { coloraxis: axisId } : {}),
    attributes: cb as Record<string, unknown>,
  };
}

/** Options of {@link colorscaleAttributes}. */
export interface ColorscaleAttributeOptions {
  /** What the numeric colors are called in descriptions, e.g. `'marker.color'`. */
  colorAttr: string;
  /** Declare `showscale` (not on `marker.line`, as in Plotly). */
  showscale: boolean;
  /** `showscale` default (true on a layout `coloraxis`). */
  showscaleDflt?: boolean;
  /** Declare `coloraxis` (traces only). */
  coloraxis: boolean;
}

type BaseColorscaleChildren = {
  readonly colorscale: AttrSpec<ColorScale, ColorScale | undefined>;
  readonly autocolorscale: AttrSpec<boolean, boolean | undefined>;
  readonly reversescale: AttrSpec<boolean, boolean>;
  readonly cauto: AttrSpec<boolean, boolean | undefined>;
  readonly cmin: AttrSpec<number, number | undefined>;
  readonly cmax: AttrSpec<number, number | undefined>;
  readonly cmid: AttrSpec<number, number | undefined>;
};

/** Children declared by {@link colorscaleAttributes} for options `O`. */
export type ColorscaleChildren<O extends ColorscaleAttributeOptions> = BaseColorscaleChildren &
  (O['showscale'] extends true
    ? {
        readonly showscale: AttrSpec<boolean, boolean>;
        readonly colorbar: typeof colorbarAttributes;
      }
    : unknown) &
  (O['coloraxis'] extends true
    ? { readonly coloraxis: AttrSpec<string, string | undefined> }
    : unknown);

/**
 * The colorscale attributes of a color container (Plotly `colorScaleAttrs`). Spread them next to
 * the container's `color` attribute. All edits are `style`: the mapping is uniforms and a LUT.
 */
export function colorscaleAttributes<const O extends ColorscaleAttributeOptions>(
  opts: O,
): ColorscaleChildren<O> {
  const what = `\`${opts.colorAttr}\``;
  const children = {
    colorscale: attr.colorscale({
      editType: 'style',
      description: `Colorscale for numeric ${what} values: a name (\`'Viridis'\`, \`'RdBu'\`, …), a list of colors, or \`[position, color]\` stops from 0 to 1.`,
    }),
    autocolorscale: attr.boolean({
      editType: 'style',
      description: `Pick the colorscale from the sign of the color domain (Reds for ≥ 0, Blues for ≤ 0, RdBu across 0). Defaults to true unless \`colorscale\` is given.`,
    }),
    reversescale: attr.boolean({
      dflt: false,
      editType: 'style',
      description: 'Reverse the colorscale (the lowest value gets the last color).',
    }),
    cauto: attr.boolean({
      editType: 'style',
      description: `Compute the color domain from the numeric ${what} values. Defaults to false when both \`cmin\` and \`cmax\` are given.`,
    }),
    cmin: attr.number({
      editType: 'style',
      description: `Value mapped to the first colorscale color (with \`cmax\`; turns \`cauto\` off).`,
    }),
    cmax: attr.number({
      editType: 'style',
      description: `Value mapped to the last colorscale color (with \`cmin\`; turns \`cauto\` off).`,
    }),
    cmid: attr.number({
      editType: 'style',
      description:
        'With `cauto`, widen the automatic domain so it is symmetric around this value (diverging data).',
    }),
  } as const;
  const showscale = attr.boolean({
    dflt: opts.showscaleDflt ?? false,
    editType: 'colorbars',
    description:
      'Show a colorbar for this colorscale (drawn by the colorbar component, plan E5.3).',
  });
  const coloraxis = attr.subplotId({
    dflt: 'coloraxis',
    editType: 'style',
    description: `Share a colorscale and domain with other traces through \`layout.coloraxis\` (\`'coloraxis'\`, \`'coloraxis2'\`, …). Overrides this container's colorscale attributes.`,
  });
  return {
    ...children,
    ...(opts.showscale ? { showscale, colorbar: colorbarAttributes } : {}),
    ...(opts.coloraxis ? { coloraxis } : {}),
  } as unknown as ColorscaleChildren<O>;
}

function numeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Plotly's `hasColorscale` on an input container: numeric colors, `showscale: true`, valid
 * `cmin` + `cmax`, a valid `colorscale`, or a `colorbar` object turn the colorscale attributes on.
 */
export function hasColorscale(container: unknown, colorKey = 'color'): boolean {
  if (container === null || typeof container !== 'object' || Array.isArray(container)) return false;
  const c = container as Record<string, unknown>;
  const color = c[colorKey];
  if (isArrayLike(color)) {
    const arr = color as ArrayLike<unknown>;
    for (let i = 0; i < arr.length; i++) if (numeric(arr[i])) return true;
  }
  return (
    c['showscale'] === true ||
    (numeric(c['cmin']) && numeric(c['cmax'])) ||
    isValidScale(c['colorscale']) ||
    (c['colorbar'] !== null && typeof c['colorbar'] === 'object')
  );
}

/** Coerce function shape shared by trace and layout defaults contexts. */
type Coerce = <T = unknown>(path: string, dflt?: unknown) => T;

/**
 * Plotly's `colorScaleDefaults` for the container at `prefix` (`'marker.'`, `'marker.line.'`, or
 * `'coloraxis2.'` on the layout). `containerIn` is the user's container. A trace container that
 * references a color axis only gets `coloraxis`: the axis owns the rest.
 */
export function supplyColorscaleDefaults(
  containerIn: Readonly<Record<string, unknown>> | undefined,
  coerce: Coerce,
  prefix: string,
  opts: { inTrace: boolean; showscale: boolean },
): void {
  const input = containerIn ?? {};
  if (opts.inTrace && input['coloraxis'] !== undefined) {
    // Only coerce when given: the schema default would otherwise link every trace to an axis.
    if (coerce(`${prefix}coloraxis`) !== undefined) return;
  }
  const minIn = input['cmin'];
  const maxIn = input['cmax'];
  const validMinMax = numeric(minIn) && numeric(maxIn) && minIn < maxIn;
  const auto = coerce<boolean>(`${prefix}cauto`, !validMinMax);
  if (auto) coerce(`${prefix}cmid`);
  else {
    coerce(`${prefix}cmin`);
    coerce(`${prefix}cmax`);
  }
  const sclIn = input['colorscale'];
  coerce(`${prefix}autocolorscale`, !isValidScale(sclIn));
  coerce(`${prefix}colorscale`);
  coerce(`${prefix}reversescale`);
  if (opts.showscale && coerce<boolean>(`${prefix}showscale`) === true) {
    supplyColorbarDefaults(coerce, prefix);
  }
}

// ---- Resolution --------------------------------------------------------------------------------

const extentCache = new WeakMap<object, { length: number; min: number; max: number }>();

/** Finite min/max of a numeric array (cached per array identity and length). */
export function numericExtent(values: ArrayLike<unknown>): [number, number] {
  const key = typeof values === 'object' ? (values as object) : undefined;
  const hit = key ? extentCache.get(key) : undefined;
  if (hit && hit.length === values.length) return [hit.min, hit.max];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (key) extentCache.set(key, { length: values.length, min, max });
  return [min, max];
}

/** Numeric colors to feed the GPU: non-numeric entries become NaN (the `nanColor`). */
export function colorValues(values: ArrayLike<unknown>): Float64Array {
  if (values instanceof Float64Array) return values;
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out[i] = typeof v === 'number' ? v : NaN;
  }
  return out;
}

/**
 * Plotly's color domain rule (`colorscale/calc.js`): with `cauto` (or a missing bound) the data
 * extent, widened to be symmetric around `cmid`; a zero-width domain grows to ±0.5.
 */
export function colorDomain(
  container: Readonly<Record<string, unknown>>,
  extent: readonly [number, number],
): [number, number] {
  const auto = container['cauto'] !== false;
  let min = numeric(container['cmin']) && !auto ? container['cmin'] : extent[0];
  let max = numeric(container['cmax']) && !auto ? container['cmax'] : extent[1];
  const mid = container['cmid'];
  if (auto && numeric(mid) && min <= max) {
    if (max - mid > mid - min) min = mid - (max - mid);
    else if (max - mid < mid - min) max = mid + (mid - min);
  }
  if (!(min <= max)) return [0, 1];
  if (min === max) return [min - 0.5, max + 0.5];
  return [min, max];
}

/** A resolved colorscale mapping, in the render layer's terms. */
export interface ColorMapping {
  readonly colorscale: Colorscale;
  readonly cmin: number;
  readonly cmax: number;
  readonly reversescale: boolean;
}

/** Layout key of a color axis id: `'coloraxis'` → `fullLayout.coloraxis`. */
function axisContainer(
  fullLayout: FullLayout | undefined,
  id: unknown,
): Record<string, unknown> | undefined {
  if (typeof id !== 'string' || !fullLayout) return undefined;
  const c = fullLayout[id];
  return c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : undefined;
}

/**
 * The colorscale mapping for a defaulted color container whose `color` is a numeric array, or
 * `undefined` when the colors are not numeric (plain CSS colors). A `coloraxis` reference takes
 * the axis' scale and its cross-trace domain (see {@link supplyColoraxisDefaults}).
 */
export function resolveColorMapping(
  container: Readonly<Record<string, unknown>> | undefined,
  fullLayout: FullLayout | undefined,
  colorKey = 'color',
): ColorMapping | undefined {
  if (!container) return undefined;
  const values = container[colorKey];
  if (!isArrayLike(values)) return undefined;
  const arr = values as ArrayLike<unknown>;
  const axis = axisContainer(fullLayout, container['coloraxis']);
  const source = axis ?? container;
  // Only containers that went through the colorscale defaults map numbers (Plotly hasColorscale).
  if (!axis && source['cauto'] === undefined) return undefined;
  const extent =
    axis && numeric(axis['_min']) && numeric(axis['_max'])
      ? ([axis['_min'], axis['_max']] as const)
      : numericExtent(arr);
  if (!axis && !(extent[0] <= extent[1])) return undefined;
  const [cmin, cmax] = colorDomain(source, extent);
  let scale = resolveColorscale(source['colorscale']);
  if (source['autocolorscale'] !== false || !scale) {
    const name =
      cmin * cmax < 0
        ? AUTO_COLORSCALES.diverging
        : cmin >= 0
          ? AUTO_COLORSCALES.sequential
          : AUTO_COLORSCALES.sequentialminus;
    scale = resolveColorscale(name)!;
  }
  return { colorscale: scale, cmin, cmax, reversescale: source['reversescale'] === true };
}

/** Color of `value` under `mapping` (CPU mirror of the GPU LUT; NaN → `nanColor`). */
export function mapColor(
  value: number,
  mapping: ColorMapping,
  nanColor: RGBA = [0.5, 0.5, 0.5, 1],
): [number, number, number, number] {
  if (!Number.isFinite(value)) return [...nanColor];
  const span = mapping.cmax - mapping.cmin;
  let t = span > 0 ? (value - mapping.cmin) / span : 0.5;
  if (mapping.reversescale) t = 1 - t;
  return sampleColorscale(mapping.colorscale, t);
}

/** Map every value to sRGB 0–1 RGBA (4 floats per value), for colors the GPU LUT can't serve. */
export function mapColors(values: ArrayLike<unknown>, mapping: ColorMapping): Float32Array {
  const out = new Float32Array(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out.set(mapColor(typeof v === 'number' ? v : NaN, mapping), i * 4);
  }
  return out;
}

/** sRGB 0–1 RGBA → CSS `rgb()`/`rgba()` (for hover and legend colors). */
export function rgbaToCss(c: ArrayLike<number>): string {
  const r = Math.round((c[0] ?? 0) * 255);
  const g = Math.round((c[1] ?? 0) * 255);
  const b = Math.round((c[2] ?? 0) * 255);
  const a = c[3] ?? 1;
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`;
}

// ---- Layout color axes -------------------------------------------------------------------------

/**
 * `layout.coloraxis`, `coloraxis2`, …: shared colorscales. Trace modules with colorscaled
 * containers spread this into their `layoutSchema` (the object is shared, so registering several
 * such modules declares it once).
 */
export const coloraxisLayoutSchema = {
  coloraxis: attr.subplotObject(
    'coloraxis',
    colorscaleAttributes({
      colorAttr: 'color arrays of the traces that reference this axis',
      showscale: true,
      showscaleDflt: true,
      coloraxis: false,
    }),
    {
      editType: 'style',
      description:
        "A colorscale and domain shared by every trace container with `coloraxis: 'coloraxis'` (or `coloraxis2`, …).",
    },
  ),
} as const satisfies Children;

/** Containers (relative to a trace) whose colors may reference a color axis. */
const AXIS_CONTAINERS = ['marker', 'marker.line'] as const;

function containerAt(trace: Readonly<Record<string, unknown>>, path: string): unknown {
  let v: unknown = trace;
  for (const key of path.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[key];
  }
  return v;
}

/**
 * Layout defaults for the color axes the traces reference (Plotly `colorAxisDefaults` +
 * `calcColorAxis`): coerce each referenced `coloraxisN` and store its cross-trace data extent as
 * `_min` / `_max`, which {@link resolveColorMapping} uses when `cauto` is on. Idempotent, so every
 * trace module that owns {@link coloraxisLayoutSchema} may call it.
 */
export function supplyColoraxisDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  const extents = new Map<string, [number, number]>();
  for (const trace of ctx.fullData) {
    if (trace.visible === false) continue;
    for (const path of AXIS_CONTAINERS) {
      const c = containerAt(trace, path) as Record<string, unknown> | undefined;
      const id = c?.['coloraxis'];
      if (typeof id !== 'string') continue;
      const range = extents.get(id) ?? [Infinity, -Infinity];
      const color = c?.['color'];
      if (isArrayLike(color)) {
        const [lo, hi] = numericExtent(color as ArrayLike<unknown>);
        range[0] = Math.min(range[0], lo);
        range[1] = Math.max(range[1], hi);
      }
      extents.set(id, range);
    }
  }
  for (const [id, [min, max]] of extents) {
    const input = layoutIn[id];
    supplyColorscaleDefaults(
      input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : undefined,
      ctx.coerce,
      `${id}.`,
      { inTrace: false, showscale: true },
    );
    const out = layoutOut[id];
    if (out !== null && typeof out === 'object') {
      Object.assign(out, { _min: min, _max: max });
    }
  }
}
