/**
 * Custom marker symbols and image sprites (plan E8.11): the registry and the glue the marker
 * primitives use. This module is in every bundle that draws markers, so it only keeps names, slots
 * and one promise; the SDF generator, the atlases, their listeners and their shader code are in
 * `custom-markers.ts`, loaded with a dynamic `import()` the first time a custom symbol is registered
 * or an image is drawn (like the fill primitive, `fill-loader.ts`).
 *
 * ## Codes
 *
 * Built-in symbols use Plotly's codes (`base + 100 × variant`, below 400). Custom ones are internal
 * codes from {@link CUSTOM_CODE_BASE}: `1000 + 8 × slot + k`, where `k` 0–3 is the variant of the
 * registered SDF symbol in `slot` (filled, `-open`, `-dot`, `-open-dot`) and `k` = 4 draws image
 * atlas `slot` (a `marker.image` URL or a `text:` glyph). Codes are exact in the float32 `aStyle`
 * attribute; they are never user input (a numeric `marker.symbol` of 1000 is still invalid).
 *
 * ## Readiness
 *
 * A symbol's SDF and an image's pixels arrive asynchronously (lazy code, image decoding). Until
 * then those markers are not drawn; {@link customMarkersReady} resolves once everything requested
 * so far is in the atlases (or failed, with a warning), and marker primitives that use custom codes
 * return it as their `ready`, so `chart.ready`, update promises and image export wait for it.
 */

/** First internal code of custom symbols and images (see the module docs). */
export const CUSTOM_CODE_BASE = 1000;
/** `k` of image codes. */
export const CUSTOM_IMAGE_KIND = 4;
/** At most this many SDF symbols, and this many distinct images / glyphs (atlas slots). */
export const CUSTOM_SLOT_LIMIT = 256;

/** A custom marker symbol for `symbols.register`. @public */
export interface CustomSymbolDefinition {
  /** SVG path data (the `d` attribute) in {@link viewBox} coordinates (y down, like SVG). */
  path: string;
  /**
   * The path's coordinate box `[minX, minY, width, height]` (or the SVG attribute string). Its
   * larger side spans the marker's `size`, like the built-in `square`. Default `[0, 0, 24, 24]`,
   * the common icon grid.
   */
  viewBox?: readonly [number, number, number, number] | string;
  /** The point of the viewBox placed at the data point. Default: the viewBox center. */
  anchor?: readonly [number, number];
  /** SVG / canvas fill rule of the path. Default `'nonzero'`. */
  fillRule?: 'nonzero' | 'evenodd';
}

/** The lazily loaded half (`custom-markers.ts`). */
export type CustomMarkersModule = typeof import('./custom-markers.ts');

/** Registered symbols: lower-case name → SDF slot. */
const symbolSlots = new Map<string, number>();
/** Images and glyphs: URL or `text:…` → image slot. */
const imageSlots = new Map<string, number>();

let mod: CustomMarkersModule | undefined;
let loading: Promise<CustomMarkersModule> | undefined;
let pending: Promise<void> = Promise.resolve();

/** Load the custom-marker code once (concurrent callers share it; a failed load is retried). */
function load(): Promise<CustomMarkersModule> {
  return (loading ??= import('./custom-markers.ts').then(
    (m) => (mod = m),
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  ));
}

/**
 * Run `work` once the custom-marker code is in; {@link customMarkersReady} covers it. Never
 * rejects: a failed load is reported (the lazy code reports its own failures).
 */
export function withCustomMarkers(work: (m: CustomMarkersModule) => unknown): void {
  const done = load()
    .then(work)
    .catch((error: unknown) => console.warn('[holochart] custom markers:', error));
  pending = Promise.all([pending, done]).then(() => undefined);
}

/**
 * Resolves once every symbol registered and image requested so far is in the atlases (or failed).
 * The same promise until new work arrives.
 * @public
 */
export function customMarkersReady(): Promise<void> {
  return pending;
}

/**
 * `source` (a marker vertex or fragment shader) with the custom-marker code injected at its
 * `// @custom-…` hooks, or `undefined` until that code has loaded.
 */
export function customShader(source: string, fragment: boolean): string | undefined {
  return mod?.customShader(source, fragment);
}

/** Register (or replace) the SDF symbol `name` (lower-case, checked by the caller). */
export function defineCustomSymbol(name: string, def: CustomSymbolDefinition): void {
  let slot = symbolSlots.get(name);
  if (slot === undefined) {
    if (symbolSlots.size >= CUSTOM_SLOT_LIMIT) throw new RangeError('too many custom symbols');
    symbolSlots.set(name, (slot = symbolSlots.size));
  }
  const s = slot;
  withCustomMarkers((m) => m.setSymbol(s, def));
}

/** Names of the registered symbols, in registration order. @public */
export function customSymbolNames(): string[] {
  return [...symbolSlots.keys()];
}

/** Internal code of an image (URL or data URI, or `text:…`); starts loading it. */
export function customImageCode(source: string): number | undefined {
  let slot = imageSlots.get(source);
  if (slot === undefined) {
    if (imageSlots.size >= CUSTOM_SLOT_LIMIT) return undefined;
    imageSlots.set(source, (slot = imageSlots.size));
    const s = slot;
    withCustomMarkers((m) => m.setImage(s, source));
  }
  return CUSTOM_CODE_BASE + 8 * slot + CUSTOM_IMAGE_KIND;
}

const VARIANT = /^(.+?)(-open)?(-dot)?$/;

/**
 * Internal code of a custom symbol: a registered name with an optional variant suffix
 * (`'pin-open'`), or a `text:` glyph (`'text:🚀'`, drawn from the image atlas; only with `glyphs`,
 * which also starts drawing it). `undefined` for anything else.
 */
export function customSymbolCode(symbol: string, glyphs = true): number | undefined {
  const s = symbol.trim();
  if (s.startsWith('text:')) {
    return s.length > 5 ? (glyphs ? customImageCode(s) : CUSTOM_CODE_BASE) : undefined;
  }
  const m = VARIANT.exec(s.toLowerCase());
  const slot = m ? symbolSlots.get(m[1]!) : undefined;
  return slot === undefined
    ? undefined
    : CUSTOM_CODE_BASE + 8 * slot + (m![2] ? 1 : 0) + (m![3] ? 2 : 0);
}

/**
 * Whether `value` names a custom symbol: a registered name (with an optional variant suffix) or a
 * `text:` glyph. The schema's `marker.symbol` accepts these besides Plotly's symbols.
 * @public
 */
export function isCustomSymbol(value: unknown): boolean {
  return typeof value === 'string' && customSymbolCode(value, false) !== undefined;
}
