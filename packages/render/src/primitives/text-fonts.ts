/**
 * Font registry for the text primitive: CSS font family → font file URL resolution (plan E2.9,
 * E8.3), plus CSS font-string helpers shared with the font metrics oracle.
 *
 * Pure module: it never imports troika, so layout code and unit tests can use it without WebGL.
 *
 * Why a registry: troika renders from font *files* (TTF/OTF/WOFF, not WOFF2) rather than CSS
 * families, so a `font.family` such as `'"Open Sans", verdana, sans-serif'` has to be mapped to a
 * URL. Families that are not registered fall back to troika's default font — the URL configured via
 * `configureText({ defaultFontURL })`, or troika's CDN-hosted fallback font when none is configured.
 * Deterministic offline visual tests therefore need a vendored font file (e.g. Inter, OFL-licensed)
 * registered here or set as the default font URL.
 *
 * The metrics oracle measures with canvas and CSS fonts, so it must be told which font troika will
 * actually draw ({@link measurementFace}, plan E2.18): the registered family, else the default font
 * (registered as a CSS `FontFace` under {@link DEFAULT_FONT_CSS_FAMILY}), else troika's CDN fallback
 * font (registered lazily under {@link TROIKA_FALLBACK_CSS_FAMILY}). Measuring the CSS family list
 * instead would pick whatever system font matches, which differs from what is drawn and across
 * platforms.
 */

/** CSS font weight: a number in 1–1000, or the `normal` (400) / `bold` (700) keywords. */
export type TextFontWeight = number | 'normal' | 'bold';

/** CSS font style. `oblique` is treated as `italic`. */
export type TextFontStyle = 'normal' | 'italic';

/**
 * Capitals variant (Plotly `font.variant`, CSS `font-variant-caps`). The SDF renderer approximates
 * the small/petite caps variants (see `resolveTextTransform` in text-style.ts).
 */
export type TextFontVariant =
  'normal' | 'small-caps' | 'all-small-caps' | 'all-petite-caps' | 'petite-caps' | 'unicase';

/** Letter case transform (Plotly `font.textcase`). `word caps` is CSS `capitalize`. */
export type TextFontTextCase = 'normal' | 'word caps' | 'upper' | 'lower';

/**
 * Text decoration lines (Plotly `font.lineposition`): a flaglist of `under`, `over`, `through`
 * joined by `+` (e.g. `'under+over'`), or `none`.
 */
export type TextFontLinePosition = string;

/**
 * A font request: CSS family list, size in CSS px, weight, and style, plus Plotly's paint-level
 * font attributes (`variant`, `textcase`, `lineposition`, `shadow`).
 */
export interface TextFont {
  /** CSS font family list, e.g. `'Inter, "Open Sans", sans-serif'`. */
  family: string;
  /** Font size in CSS px (em-box height). */
  size: number;
  /** Default 400. */
  weight?: TextFontWeight;
  /** Default `'normal'`. */
  style?: TextFontStyle;
  /** Default `'normal'`. Changes the drawn (and measured) text and size. */
  variant?: TextFontVariant;
  /** Default `'normal'`. Changes the drawn (and measured) text. */
  textcase?: TextFontTextCase;
  /** Decoration lines, e.g. `'under'`, `'under+through'`. Default `'none'`. */
  lineposition?: TextFontLinePosition;
  /**
   * CSS `text-shadow`: `'none'` (default), `'auto'` (a thin halo in the text color's contrast
   * color), or e.g. `'1px 1px 2px black'`. Only the first shadow of a list is drawn.
   */
  shadow?: string;
}

/** One registered font file (one face of a family). */
export interface RegisteredFontFace {
  /** Family name as referenced from CSS family lists (matched case-insensitively). */
  family: string;
  /** URL of a TTF, OTF, or WOFF (not WOFF2) file. */
  url: string;
  /** Default 400. */
  weight?: TextFontWeight;
  /** Default `'normal'`. */
  style?: TextFontStyle;
}

export interface RegisterFontOptions {
  /**
   * Also register the file as a CSS `FontFace` (browsers only) so the canvas-based font metrics
   * oracle measures with the same font troika renders with. Default `true`. The font metrics cache
   * is cleared once the face has loaded.
   */
  cssFontFace?: boolean;
}

interface Face {
  /** Family name as registered (original case). */
  family: string;
  url: string;
  weight: number;
  style: TextFontStyle;
}

/** A registered face chosen for a font request (see {@link resolveFontFace}). */
export interface ResolvedFontFace {
  /** Registered family name. */
  family: string;
  /** Font file URL. */
  url: string;
  /** Weight of the registered face (not necessarily the requested one). */
  weight: number;
  /** Style of the registered face. */
  style: TextFontStyle;
}

const registry = new Map<string, Face[]>();
const listeners = new Set<() => void>();
/** Memo of {@link measurementFace}, cleared on every font change (registration, load). */
const measurementFaces = new Map<string, MeasurementFace>();

/** CSS generic family keywords: never quoted, never registered. */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);

/** Normalize a CSS weight keyword or number to a number in [1, 1000] (invalid → 400). */
export function normalizeFontWeight(weight: TextFontWeight | undefined): number {
  if (weight === undefined || weight === 'normal') return 400;
  if (weight === 'bold') return 700;
  if (!Number.isFinite(weight)) return 400;
  return Math.min(1000, Math.max(1, weight));
}

/** Normalize a CSS font style (anything but `italic`/`oblique` → `normal`). */
export function normalizeFontStyle(style: string | undefined): TextFontStyle {
  return style === 'italic' || style === 'oblique' ? 'italic' : 'normal';
}

/**
 * Split a CSS font family list into unquoted names, e.g. `'"Open Sans", arial'` →
 * `['Open Sans', 'arial']`. Commas inside quoted names are not supported (none of the common font
 * names contain them).
 */
export function parseFontFamilyList(family: string): string[] {
  return family
    .split(',')
    .map((name) =>
      name
        .trim()
        .replace(/^(['"])(.*)\1$/, '$2')
        .trim(),
    )
    .filter((name) => name.length > 0);
}

/**
 * Canonical CSS family list: names quoted unless they are generic keywords, e.g.
 * `'Open Sans, sans-serif'` → `'"Open Sans", sans-serif'`. An empty list yields `sans-serif`.
 */
export function cssFontFamily(family: string): string {
  const names = parseFontFamilyList(family);
  if (names.length === 0) return 'sans-serif';
  return names
    .map((name) =>
      GENERIC_FAMILIES.has(name.toLowerCase())
        ? name.toLowerCase()
        : `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    )
    .join(', ');
}

/**
 * CSS `font` shorthand for canvas `ctx.font`, e.g. `'italic 700 12px "Open Sans", sans-serif'`.
 * `size` overrides `font.size` (the metrics oracle measures at a fixed reference size).
 */
export function cssFontString(font: Omit<TextFont, 'size'>, size: number): string {
  const style = normalizeFontStyle(font.style);
  const weight = normalizeFontWeight(font.weight);
  return `${style} ${weight} ${size}px ${cssFontFamily(font.family)}`;
}

/**
 * Rank of a face weight for a requested weight, following the CSS Fonts 4 matching order (lower is
 * better): exact match; for 400–500 then heavier up to 500, lighter, heavier beyond 500; for < 400
 * lighter first; for > 500 heavier first.
 */
export function fontWeightRank(target: number, weight: number): number {
  if (weight === target) return 0;
  if (target < 400) {
    return weight < target ? target - weight : 1000 + (weight - target);
  }
  if (target > 500) {
    return weight > target ? weight - target : 1000 + (target - weight);
  }
  if (weight > target && weight <= 500) return weight - target;
  if (weight < target) return 1000 + (target - weight);
  return 2000 + (weight - target);
}

/**
 * Register a font file for a family/weight/style. Registering the same family/weight/style again
 * replaces the URL. Returns a function that unregisters the face.
 */
export function registerFont(
  face: RegisteredFontFace,
  options: RegisterFontOptions = {},
): () => void {
  const key = face.family.trim().toLowerCase();
  const entry: Face = {
    family: face.family.trim(),
    url: face.url,
    weight: normalizeFontWeight(face.weight),
    style: normalizeFontStyle(face.style),
  };
  const faces = registry.get(key) ?? [];
  const existing = faces.findIndex((f) => f.weight === entry.weight && f.style === entry.style);
  if (existing >= 0) faces.splice(existing, 1);
  faces.push(entry);
  registry.set(key, faces);
  notifyFontChange();
  if (options.cssFontFace !== false) loadCSSFontFace(face, entry);
  return () => {
    const list = registry.get(key);
    const i = list ? list.indexOf(entry) : -1;
    if (list && i >= 0) {
      list.splice(i, 1);
      if (list.length === 0) registry.delete(key);
      notifyFontChange();
    }
  };
}

/** A URL, or per-style URLs, for one weight in {@link FontFamilyFaces.weights}. */
export type FontWeightFaces = string | { normal?: string; italic?: string };

/** Font files of one family for {@link registerFontFamily}. Every field is optional. */
export interface FontFamilyFaces {
  /** Upright 400. */
  regular?: string;
  /** Upright 700. */
  bold?: string;
  /** Italic 400. */
  italic?: string;
  /** Italic 700. */
  boldItalic?: string;
  /**
   * Faces by numeric weight (e.g. `{ 300: 'light.woff', 600: { normal: 'sb.woff', italic:
   * 'sbi.woff' } }`); a plain URL is the upright face. Overrides the named faces on conflict.
   */
  weights?: Readonly<Record<number, FontWeightFaces>>;
}

/**
 * Register several faces of one family at once (plan E8.3: `fonts.register('Inter', { regular,
 * bold, italic })`). Each face goes through {@link registerFont}, so troika resolution and the
 * metrics oracle's CSS `FontFace` registration both apply. Returns a function that unregisters
 * every face registered by this call (faces replaced by a later registration are left alone).
 */
export function registerFontFamily(
  family: string,
  faces: FontFamilyFaces,
  options: RegisterFontOptions = {},
): () => void {
  const list: RegisteredFontFace[] = [];
  const add = (url: string | undefined, weight: number, style: TextFontStyle): void => {
    if (typeof url === 'string' && url.length > 0) list.push({ family, url, weight, style });
  };
  add(faces.regular, 400, 'normal');
  add(faces.bold, 700, 'normal');
  add(faces.italic, 400, 'italic');
  add(faces.boldItalic, 700, 'italic');
  for (const [key, value] of Object.entries(faces.weights ?? {})) {
    const weight = Number(key);
    if (!Number.isFinite(weight)) continue;
    if (typeof value === 'string') add(value, weight, 'normal');
    else {
      add(value.normal, weight, 'normal');
      add(value.italic, weight, 'italic');
    }
  }
  const offs = list.map((face) => registerFont(face, options));
  return () => {
    for (const off of offs) off();
  };
}

/** Names of the registered families (as first registered), in registration order. */
export function registeredFontFamilies(): string[] {
  const out: string[] = [];
  for (const faces of registry.values()) {
    const first = faces[0];
    if (first) out.push(first.family);
  }
  return out;
}

/** Remove every registered font (tests, hot reload). */
export function clearFontRegistry(): void {
  registry.clear();
  notifyFontChange();
}

/**
 * Resolve a CSS family list to a registered face: the first registered family in the list wins,
 * then the best face by style (exact, else the other style) and weight ({@link fontWeightRank}).
 * Returns `undefined` when no family is registered, meaning "use troika's default font".
 */
export function resolveFontFace(
  family: string,
  weight?: TextFontWeight,
  style?: TextFontStyle,
): ResolvedFontFace | undefined {
  const w = normalizeFontWeight(weight);
  const s = normalizeFontStyle(style);
  for (const name of parseFontFamilyList(family)) {
    const faces = registry.get(name.toLowerCase());
    if (!faces || faces.length === 0) continue;
    let best: Face | undefined;
    let bestRank = Infinity;
    for (const face of faces) {
      const rank = (face.style === s ? 0 : 10000) + fontWeightRank(w, face.weight);
      if (rank < bestRank) {
        bestRank = rank;
        best = face;
      }
    }
    if (best) return { ...best };
  }
  return undefined;
}

/**
 * Resolve a CSS family list to a registered font URL ({@link resolveFontFace}). Returns `undefined`
 * when no family is registered, meaning "use troika's default font".
 */
export function resolveFontURL(
  family: string,
  weight?: TextFontWeight,
  style?: TextFontStyle,
): string | undefined {
  return resolveFontFace(family, weight, style)?.url;
}

// ---- Default font and measurement faces (E2.18) -------------------------------------------------

/**
 * CSS family under which the default font (`configureText({ defaultFontURL })`) is registered as a
 * `FontFace`, so the canvas metrics oracle can measure with it. Internal: not meant for figures.
 */
export const DEFAULT_FONT_CSS_FAMILY = 'holochart-default';

/**
 * CSS family under which troika's CDN fallback font (Latin, sans-serif) is registered when no
 * default font URL is configured. Internal: not meant for figures.
 */
export const TROIKA_FALLBACK_CSS_FAMILY = 'holochart-troika-fallback';

/**
 * troika's default `unicodeFontsURL` (unicode-font-resolver data, troika-three-text 0.52). Must
 * track troika's version: the fallback faces below point at the same files troika downloads.
 */
export const TROIKA_UNICODE_FONTS_URL =
  'https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/packages/data';

/**
 * Code points of unicode-font-resolver's `latin` font (its `font-meta/latin.json`). Other scripts
 * resolve to other fonts in troika; for those the canvas falls through to the CSS family list.
 */
const TROIKA_LATIN_RANGE =
  'U+0-FF,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+300-301,U+303-304,U+308-309,U+323,' +
  'U+329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

/** Weights the `latin` sans-serif typeform ships in, both upright and italic. */
const TROIKA_LATIN_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/** The face the metrics oracle should measure a font request with ({@link measurementFace}). */
export interface MeasurementFace {
  /** CSS family list to measure with: the drawn font first, then the requested list as fallback. */
  family: string;
  weight: number;
  style: TextFontStyle;
  /**
   * Which font troika draws: a registered family, the configured default font, or troika's CDN
   * fallback font.
   */
  source: 'registered' | 'default' | 'troika';
}

interface DefaultFontState {
  url: string;
  cssFace: FontFace | null;
}

let defaultFont: DefaultFontState | null = null;
let unicodeFontsURL = TROIKA_UNICODE_FONTS_URL;
let troikaFaces: FontFace[] | null = null;

/**
 * Record the default font URL (troika's `defaultFontURL`, used for every unregistered family) and
 * register it as a CSS `FontFace` under {@link DEFAULT_FONT_CSS_FAMILY} (browsers only), so text is
 * measured with the font that is drawn. `configureText` calls this; call it directly only when
 * configuring troika yourself. `null` forgets the default (troika's CDN fallback font applies).
 *
 * The face is loaded eagerly: `document.fonts` reports `loading` meanwhile (charts wait for it),
 * and font-change subscribers are notified when it has loaded.
 */
export function setDefaultFontURL(url: string | null): void {
  if ((defaultFont?.url ?? null) === url) return;
  if (defaultFont?.cssFace && typeof document !== 'undefined') {
    document.fonts?.delete(defaultFont.cssFace);
  }
  // troika draws every weight and style of an unregistered family with this one file (it never
  // synthesizes bold or italic), so one upright 400 face describes it exactly.
  defaultFont =
    url === null
      ? null
      : {
          url,
          cssFace: addCSSFontFace(
            DEFAULT_FONT_CSS_FAMILY,
            url,
            {
              weight: '400',
              style: 'normal',
            },
            true,
          ),
        };
  notifyFontChange();
}

/** The configured default font URL, or `undefined` when troika's CDN fallback font applies. */
export function getDefaultFontURL(): string | undefined {
  return defaultFont?.url;
}

/**
 * Record troika's `unicodeFontsURL` (where its fallback fonts come from), so the CDN fallback faces
 * registered for measurement point at the same files. `configureText` calls this.
 */
export function setUnicodeFontsURL(url: string | null): void {
  const next = (url ?? TROIKA_UNICODE_FONTS_URL).replace(/\/+$/, '');
  if (next === unicodeFontsURL) return;
  unicodeFontsURL = next;
  if (troikaFaces && typeof document !== 'undefined') {
    for (const face of troikaFaces) document.fonts?.delete(face);
  }
  troikaFaces = null;
  notifyFontChange();
}

/**
 * The weight troika's unicode-font-resolver picks for a requested weight: the nearest available
 * one, the lighter on ties (it scans ascending and keeps strictly closer matches).
 */
export function troikaFallbackWeight(weight: TextFontWeight | undefined): number {
  const w = normalizeFontWeight(weight);
  let best: number = TROIKA_LATIN_WEIGHTS[0];
  for (const candidate of TROIKA_LATIN_WEIGHTS) {
    if (Math.abs(candidate - w) < Math.abs(best - w)) best = candidate;
  }
  return best;
}

/**
 * The face to measure a font request with, i.e. the font troika will draw it with (plan E2.18):
 *
 * 1. A registered family ({@link resolveFontFace}): its name and the registered face's weight and
 *    style (troika draws that file as is, without synthesizing bold or italic).
 * 2. Else, with a default font URL: {@link DEFAULT_FONT_CSS_FAMILY} at 400/normal.
 * 3. Else troika's CDN fallback font: {@link TROIKA_FALLBACK_CSS_FAMILY} at troika's nearest
 *    weight and the requested style. The CSS faces are registered lazily on first use (browsers
 *    only) and download only when the canvas measures with them, from the same URLs troika uses.
 *
 * The requested family list follows the drawn family as a CSS fallback, so measurements taken before
 * a face has loaded use the requested font rather than the browser default (the cache is cleared
 * when the face loads). Results are memoized until the next font change.
 */
export function measurementFace(face: Omit<TextFont, 'size'>): MeasurementFace {
  const key = `${normalizeFontStyle(face.style)}|${normalizeFontWeight(face.weight)}|${face.family}`;
  const hit = measurementFaces.get(key);
  if (hit) return hit;
  const requested = cssFontFamily(face.family);
  let out: MeasurementFace;
  const registered = resolveFontFace(face.family, face.weight, face.style);
  if (registered) {
    out = {
      family: `${cssFontFamily(registered.family)}, ${requested}`,
      weight: registered.weight,
      style: registered.style,
      source: 'registered',
    };
  } else if (defaultFont) {
    out = {
      family: `${DEFAULT_FONT_CSS_FAMILY}, ${requested}`,
      weight: 400,
      style: 'normal',
      source: 'default',
    };
  } else {
    ensureTroikaFallbackFaces();
    out = {
      family: `${TROIKA_FALLBACK_CSS_FAMILY}, ${requested}`,
      weight: troikaFallbackWeight(face.weight),
      style: normalizeFontStyle(face.style),
      source: 'troika',
    };
  }
  measurementFaces.set(key, out);
  return out;
}

/** Register troika's Latin CDN fallback faces as lazily loading CSS font faces (once). */
function ensureTroikaFallbackFaces(): void {
  if (troikaFaces) return;
  troikaFaces = [];
  for (const style of ['normal', 'italic'] as const) {
    for (const weight of TROIKA_LATIN_WEIGHTS) {
      // Same naming as unicode-font-resolver: font-files/<id>/<category>.<style>.<weight>.woff.
      const url = `${unicodeFontsURL}/font-files/latin/sans-serif.${style}.${weight}.woff`;
      const face = addCSSFontFace(
        TROIKA_FALLBACK_CSS_FAMILY,
        url,
        { weight: String(weight), style, unicodeRange: TROIKA_LATIN_RANGE },
        false,
      );
      if (face) troikaFaces.push(face);
    }
  }
}

/**
 * Add a CSS font face to `document.fonts` (browsers only) and notify font-change subscribers once
 * it has loaded. `eager` starts the download now; otherwise the browser loads it when text is first
 * measured or drawn with it. Returns `null` where CSS font faces are unavailable or rejected.
 */
function addCSSFontFace(
  family: string,
  url: string,
  descriptors: FontFaceDescriptors,
  eager: boolean,
): FontFace | null {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    return null;
  }
  try {
    const cssFace = new FontFace(family, `url(${JSON.stringify(url)})`, descriptors);
    document.fonts.add(cssFace);
    // A failed load only affects metrics accuracy (the requested family list is measured instead);
    // troika reports its own font errors.
    const noop = (): void => undefined;
    if (eager) cssFace.load().then(notifyFontChange, noop);
    else cssFace.loaded.then(notifyFontChange, noop);
    return cssFace;
  } catch {
    // Invalid descriptors or CSP restrictions: metrics fall back to the requested family list.
    return null;
  }
}

/**
 * Subscribe to font changes (registrations, CSS font faces finishing loading). Used by the default
 * font metrics oracle to drop measurements taken with a fallback font. Returns an unsubscribe.
 */
export function subscribeFontChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyFontChange(): void {
  measurementFaces.clear();
  for (const listener of listeners) listener();
}

function loadCSSFontFace(face: RegisteredFontFace, entry: Face): void {
  addCSSFontFace(
    entry.family,
    face.url,
    { weight: String(entry.weight), style: entry.style },
    true,
  );
}

/**
 * The font registry as one namespace (plan E8.3, `Holochart.fonts`): `register` a family's faces,
 * `registerFace` one file, `resolve` a CSS family list to a registered face, list the registered
 * `families`, or `clear` the registry.
 *
 * @example
 * ```ts
 * fonts.register('Inter', { regular: '/fonts/Inter.woff', bold: '/fonts/Inter-Bold.woff' });
 * fonts.resolve('"Brand", Inter, sans-serif', 'bold')?.url; // '/fonts/Inter-Bold.woff'
 * ```
 */
export const fonts = {
  register: registerFontFamily,
  registerFace: registerFont,
  resolve: resolveFontFace,
  families: registeredFontFamilies,
  clear: clearFontRegistry,
} as const;
