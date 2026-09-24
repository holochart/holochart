/**
 * Named colorscales and colorways (plan E8.2): `colors.register(name, stops)` and
 * `colorways.register(name, colors)`.
 *
 * The registries are global (like fonts): a colorscale name is data, and a figure that says
 * `colorscale: 'Tempo'` should mean the same thing in every chart on the page.
 *
 * Lookup rules, matching Plotly:
 * - names are case-insensitive (`'viridis'` is `'Viridis'`);
 * - a `_r` suffix reverses a scale (`'Viridis_r'`), unless a scale is registered under that exact
 *   name;
 * - registered scales win over plotly.js's built-in names ({@link PLOTLYJS_COLORSCALES}), which
 *   are always available without registration.
 *
 * Everything else built in (the plotly.py palettes and scales in `colors/data/`) is registered by
 * {@link registerBuiltinColors}, which the full `@mk7s/holochart` bundle calls. Partial bundles
 * call it themselves, or register only the scales they use, so a scatter-only page does not ship
 * 100+ colorscales.
 */
import { evenStops, PLOTLYJS_COLORSCALES, type ColorscaleStops } from './plotlyjs.ts';

export type { ColorscaleStops } from './plotlyjs.ts';

/** A colorscale to register: `[position, color]` stops from 0 to 1, or evenly spaced colors. */
export type ColorscaleInput = ColorscaleStops | readonly string[];

interface Named<T> {
  /** Name as registered (original case). */
  name: string;
  value: T;
}

const scales = new Map<string, Named<ColorscaleStops>>();
const builtinScales = new Map<string, Named<ColorscaleStops>>(
  Object.entries(PLOTLYJS_COLORSCALES).map(([name, value]) => [
    name.toLowerCase(),
    { name, value },
  ]),
);
const reversedCache = new Map<string, ColorscaleStops>();
const colorwayMap = new Map<string, Named<readonly string[]>>();
let version = 0;

function bump(): void {
  version++;
  reversedCache.clear();
}

/** Normalize a registration input to stops (a plain color list is spread evenly). */
function toStops(input: ColorscaleInput): ColorscaleStops {
  if (input.length === 0) throw new RangeError('A colorscale needs at least one color');
  const first = input[0];
  if (typeof first === 'string') return evenStops(input as readonly string[]);
  return (input as ColorscaleStops).map(([p, c]) => [p, c] as const);
}

/** A scale with its stops mirrored: position `p` → `1 - p`, order reversed. */
export function reverseColorscale(stops: ColorscaleStops): ColorscaleStops {
  const out: (readonly [number, string])[] = [];
  for (let i = stops.length - 1; i >= 0; i--) {
    const [p, c] = stops[i]!;
    out.push([1 - p, c]);
  }
  return out;
}

function lookup(key: string): Named<ColorscaleStops> | undefined {
  return scales.get(key) ?? builtinScales.get(key);
}

/**
 * Register a named colorscale (replacing any scale of the same name, case-insensitively). Returns a
 * function that unregisters it.
 *
 * @example
 * ```ts
 * colors.register('Brand', ['#0b1f3a', '#1d6fa5', '#9ad0ec']);
 * colors.register('Traffic', [[0, 'green'], [0.5, 'gold'], [1, 'red']]);
 * // then: marker: { color: values, colorscale: 'Brand' } (or 'Brand_r')
 * ```
 */
export function registerColorscale(name: string, scale: ColorscaleInput): () => void {
  const key = name.trim().toLowerCase();
  if (key === '') throw new RangeError('A colorscale name must not be empty');
  const entry = { name: name.trim(), value: toStops(scale) };
  scales.set(key, entry);
  bump();
  return () => {
    if (scales.get(key) === entry) {
      scales.delete(key);
      bump();
    }
  };
}

/**
 * Register many colorscales at once. With `overwrite: false`, names that already resolve (a
 * registered scale or a plotly.js built-in) are skipped — how the built-in sets are added without
 * changing what existing names mean.
 */
export function registerColorscales(
  record: Readonly<Record<string, ColorscaleInput>>,
  options: { overwrite?: boolean } = {},
): void {
  const overwrite = options.overwrite !== false;
  for (const [name, scale] of Object.entries(record)) {
    const key = name.toLowerCase();
    if (!overwrite && lookup(key)) continue;
    scales.set(key, { name, value: toStops(scale) });
  }
  bump();
}

/**
 * The stops of a named colorscale (`'Viridis'`, `'viridis_r'`), or `undefined` for unknown names.
 * The result is shared: do not mutate it.
 */
export function getColorscale(name: string): ColorscaleStops | undefined {
  const key = name.trim().toLowerCase();
  const hit = lookup(key);
  if (hit) return hit.value;
  if (!key.endsWith('_r')) return undefined;
  const cached = reversedCache.get(key);
  if (cached) return cached;
  const base = lookup(key.slice(0, -2));
  if (!base) return undefined;
  const reversed = reverseColorscale(base.value);
  reversedCache.set(key, reversed);
  return reversed;
}

/** Whether `name` resolves to a colorscale (including `_r` variants). */
export function isColorscaleName(name: unknown): boolean {
  return typeof name === 'string' && getColorscale(name) !== undefined;
}

/** Names of every resolvable colorscale (registered and plotly.js built-ins), without `_r`. */
export function colorscaleNames(): string[] {
  const out = new Map<string, string>();
  for (const [key, { name }] of builtinScales) out.set(key, name);
  for (const [key, { name }] of scales) out.set(key, name);
  return [...out.values()];
}

/**
 * Changes whenever the colorscale registry changes, so caches of resolved scales (e.g. the render
 * stops in traces) can tell when to drop entries.
 */
export function colorscaleRegistryVersion(): number {
  return version;
}

/** Register a named colorway (qualitative palette). Returns a function that unregisters it. */
export function registerColorway(name: string, colorList: readonly string[]): () => void {
  const key = name.trim().toLowerCase();
  if (key === '') throw new RangeError('A colorway name must not be empty');
  if (colorList.length === 0) throw new RangeError('A colorway needs at least one color');
  const entry = { name: name.trim(), value: [...colorList] };
  colorwayMap.set(key, entry);
  return () => {
    if (colorwayMap.get(key) === entry) colorwayMap.delete(key);
  };
}

/** A named colorway's colors (case-insensitive), or `undefined`. Shared: do not mutate. */
export function getColorway(name: string): readonly string[] | undefined {
  return colorwayMap.get(name.trim().toLowerCase())?.value;
}

/** Names of every registered colorway. */
export function colorwayNames(): string[] {
  return [...colorwayMap.values()].map((e) => e.name);
}

/**
 * The colorscale registry as one object (`Holochart.colors.register('Brand', stops)`, plan E8.2).
 */
export const colors = {
  register: registerColorscale,
  registerAll: registerColorscales,
  get: getColorscale,
  has: isColorscaleName,
  names: colorscaleNames,
  reverse: reverseColorscale,
} as const;

/** The colorway (qualitative palette) registry as one object: `colorways.get('Dark24')`. */
export const colorways = {
  register: registerColorway,
  get: getColorway,
  names: colorwayNames,
} as const;
