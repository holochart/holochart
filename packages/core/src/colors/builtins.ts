/**
 * The built-in palettes and colorscales of plan E8.2 (plotly.py's `plotly.colors`), grouped the way
 * the docs present them, and {@link registerBuiltinColors}, which makes their names resolvable.
 *
 * Nothing here runs on import. The groups are only referenced from this module, so bundles that
 * never call {@link registerBuiltinColors} (or read {@link BUILTIN_COLORSCALE_GROUPS}) tree-shake
 * the data away; the full `@mk7s/holochart` bundle calls it once.
 */
import { CARTO_DIVERGING, CARTO_SEQUENTIAL } from './data/carto.ts';
import { CMOCEAN_CYCLICAL, CMOCEAN_DIVERGING, CMOCEAN_SEQUENTIAL } from './data/cmocean.ts';
import { COLORBREWER_DIVERGING, COLORBREWER_SEQUENTIAL } from './data/colorbrewer.ts';
import { CYCLICAL } from './data/cyclical.ts';
import { QUALITATIVE } from './data/qualitative.ts';
import { DIVERGING_PLOTLY, SEQUENTIAL } from './data/sequential.ts';
import { PLOTLYJS_COLORSCALES } from './plotlyjs.ts';
import { registerColorscales, registerColorway, type ColorscaleInput } from './registry.ts';

/** How a built-in colorscale is meant to be used. */
export type ColorscaleKind = 'sequential' | 'diverging' | 'cyclical';

/** One named group of built-in colorscales (for docs and pickers). */
export interface ColorscaleGroup {
  /** Group label, e.g. `'cmocean'`. */
  readonly source: string;
  readonly kind: ColorscaleKind;
  readonly scales: Readonly<Record<string, ColorscaleInput>>;
}

/** Which plotly.js built-ins are sequential, diverging or cyclical (for the docs). */
const PLOTLYJS_KIND: Readonly<Record<string, ColorscaleKind>> = {
  RdBu: 'diverging',
  Picnic: 'diverging',
  Portland: 'diverging',
  Earth: 'diverging',
};

function plotlyjsGroup(kind: ColorscaleKind): Record<string, ColorscaleInput> {
  const out: Record<string, ColorscaleInput> = {};
  for (const [name, stops] of Object.entries(PLOTLYJS_COLORSCALES)) {
    if ((PLOTLYJS_KIND[name] ?? 'sequential') === kind) out[name] = stops;
  }
  return out;
}

/**
 * Every built-in colorscale group, in registration (priority) order. plotly.js's names come
 * first, so a later group with the same name (plotly.py's ColorBrewer `Blues`) never changes what
 * the string means; those lists stay available as values (e.g. `COLORBREWER_SEQUENTIAL.Blues`).
 */
export const BUILTIN_COLORSCALE_GROUPS: readonly ColorscaleGroup[] = [
  { source: 'plotly.js', kind: 'sequential', scales: /* @__PURE__ */ plotlyjsGroup('sequential') },
  { source: 'plotly.js', kind: 'diverging', scales: /* @__PURE__ */ plotlyjsGroup('diverging') },
  { source: 'plotly', kind: 'sequential', scales: SEQUENTIAL },
  { source: 'plotly', kind: 'diverging', scales: DIVERGING_PLOTLY },
  { source: 'ColorBrewer', kind: 'sequential', scales: COLORBREWER_SEQUENTIAL },
  { source: 'ColorBrewer', kind: 'diverging', scales: COLORBREWER_DIVERGING },
  { source: 'cmocean', kind: 'sequential', scales: CMOCEAN_SEQUENTIAL },
  { source: 'cmocean', kind: 'diverging', scales: CMOCEAN_DIVERGING },
  { source: 'cmocean', kind: 'cyclical', scales: CMOCEAN_CYCLICAL },
  { source: 'CARTO', kind: 'sequential', scales: CARTO_SEQUENTIAL },
  { source: 'CARTO', kind: 'diverging', scales: CARTO_DIVERGING },
  { source: 'plotly', kind: 'cyclical', scales: CYCLICAL },
];

/** The built-in qualitative palettes (plotly.py `plotly.colors.qualitative`), by name. */
export const BUILTIN_PALETTES: Readonly<Record<string, readonly string[]>> = QUALITATIVE;

let registered = false;

/**
 * Register every built-in colorscale name (plan E8.2: plotly.py's sequential, diverging and
 * cyclical scales, cmocean, CARTO and ColorBrewer; about 100 names plus their `_r` variants) and
 * every qualitative palette as a colorway. Names already registered keep their meaning. Idempotent.
 */
export function registerBuiltinColors(): void {
  if (registered) return;
  registered = true;
  for (const group of BUILTIN_COLORSCALE_GROUPS) {
    registerColorscales(group.scales, { overwrite: false });
  }
  for (const [name, list] of Object.entries(QUALITATIVE)) registerColorway(name, list);
}
