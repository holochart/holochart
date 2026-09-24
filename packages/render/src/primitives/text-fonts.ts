/**
 * Font registry for the text primitive: CSS font family → font file URL resolution (plan E2.9,
 * E8.3), the built-in default font (E2.18), plus CSS font-string helpers shared with the font
 * metrics oracle.
 *
 * Pure module: it never imports troika, so layout code and unit tests can use it without WebGL.
 *
 * Why a registry: troika renders from font *files* (TTF/OTF/WOFF, not WOFF2) rather than CSS
 * families, so a `font.family` such as `'"Open Sans", verdana, sans-serif'` has to be mapped to a
 * URL. Families that are not registered are drawn with the default font:
 *
 * - the app's `configureText({ defaultFontURL })`, one file for every weight and style, if set;
 * - else Holochart's built-in default font, TeX Gyre Heros (a free Helvetica-style family, GUST
 *   Font License), shipped with the library in four faces (400/700 × upright/italic). Each face is
 *   loaded lazily, the first time text needs it (`../fonts/default-font-files.ts`), so charts
 *   without text load nothing and plain text loads only the regular face. No font is fetched from
 *   a CDN; troika still falls back to its CDN fonts for characters the font lacks (e.g. Cyrillic,
 *   CJK). `configureText({ defaultFontFaces })` swaps in self-hosted files.
 *
 * The metrics oracle measures with canvas and CSS fonts, so it must be told which font troika will
 * actually draw ({@link measurementFace}, plan E2.18): the registered family, else the app's default
 * font (registered as a CSS `FontFace` under {@link DEFAULT_FONT_CSS_FAMILY}), else the built-in
 * face (registered under {@link BUILTIN_FONT_CSS_FAMILY} once loaded). Measuring the CSS family list
 * instead would pick whatever system font matches, which differs from what is drawn and across
 * platforms.
 */
import { DEFAULT_FONT_FILES } from '../fonts/default-font-files.ts';

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
  forEachFamilyFace(faces, (url, weight, style) => {
    if (typeof url === 'string' && url.length > 0) list.push({ family, url, weight, style });
  });
  const offs = list.map((face) => registerFont(face, options));
  return () => {
    for (const off of offs) off();
  };
}

/** Visit the faces of a {@link FontFamilyFaces} in precedence order (later ones win). */
function forEachFamilyFace(
  faces: FontFamilyFaces,
  add: (url: string | undefined, weight: number, style: TextFontStyle) => void,
): void {
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
 * Returns `undefined` when no family is registered, meaning "use the default font" (see
 * {@link resolveDrawnFontURL}).
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
    const best = bestFace(faces, w, s);
    if (best) return { ...best };
  }
  return undefined;
}

/**
 * Resolve a CSS family list to a registered font URL ({@link resolveFontFace}). Returns `undefined`
 * when no family is registered, meaning "use the default font" ({@link resolveDrawnFontURL} also
 * resolves the built-in default font).
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
 * CSS family under which the app's default font (`configureText({ defaultFontURL })`) is registered
 * as a `FontFace`, so the canvas metrics oracle can measure with it. Internal: not meant for
 * figures.
 */
export const DEFAULT_FONT_CSS_FAMILY = 'holochart-default';

/**
 * CSS family under which the built-in default font's faces (TeX Gyre Heros, or the app's
 * `configureText({ defaultFontFaces })`) are registered as `FontFace`s once loaded, so the metrics
 * oracle measures with them. Internal: not meant for figures.
 */
export const BUILTIN_FONT_CSS_FAMILY = 'holochart-builtin-default';

/** The face the metrics oracle should measure a font request with ({@link measurementFace}). */
export interface MeasurementFace {
  /** CSS family list to measure with: the drawn font first, then the requested list as fallback. */
  family: string;
  weight: number;
  style: TextFontStyle;
  /**
   * Which font troika draws: a registered family, the app's default font URL, or a face of the
   * built-in default font.
   */
  source: 'registered' | 'default' | 'builtin';
}

/** A family, weight and style to draw: what picks a font file. */
export type TextFontRequest = Pick<TextFont, 'family' | 'weight' | 'style'>;

/** A face of the built-in default font chosen for a request ({@link defaultFontFace}). */
export interface DefaultFontFace {
  weight: number;
  style: TextFontStyle;
  /** The URL troika draws the face from, once it has loaded; `undefined` before. */
  url: string | undefined;
}

interface DefaultFontState {
  url: string;
  cssFace: FontFace | null;
}

/** One face of the built-in default font and its loading state. */
interface BuiltinFace {
  weight: number;
  style: TextFontStyle;
  /** Resolves the face's file URL: loads its chunk (ESM), or resolves next to the script (IIFE). */
  source: () => Promise<string>;
  /** Drawable URL once loaded (a `blob:` URL for `data:` sources), else `null`. */
  url: string | null;
  /** In-flight load; never rejects. */
  loading: Promise<void> | null;
  /** The last load failed: not retried until a caller asks to ({@link loadDefaultFontFaces}). */
  failed: boolean;
  cssFace: FontFace | null;
  /** Object URL created for the face (revoked when the faces are replaced). */
  objectURL: string | null;
}

let defaultFont: DefaultFontState | null = null;
let builtinFaces: BuiltinFace[] = createBuiltinFaces(null);
let fontErrorReported = false;

function builtinFace(weight: number, style: TextFontStyle, source: () => Promise<string>) {
  const face: BuiltinFace = {
    weight,
    style,
    source,
    url: null,
    loading: null,
    failed: false,
    cssFace: null,
    objectURL: null,
  };
  return face;
}

/** The shipped faces, or the app's replacements (`configureText({ defaultFontFaces })`). */
function createBuiltinFaces(faces: FontFamilyFaces | null): BuiltinFace[] {
  if (!faces) {
    return DEFAULT_FONT_FILES.map((file) => builtinFace(file.weight, file.style, file.load));
  }
  const out: BuiltinFace[] = [];
  const add = (url: string | undefined, weight: number, style: TextFontStyle): void => {
    if (typeof url !== 'string' || url.length === 0) return;
    const i = out.findIndex((f) => f.weight === weight && f.style === style);
    if (i >= 0) out.splice(i, 1);
    out.push(builtinFace(weight, style, () => Promise.resolve(url)));
  };
  forEachFamilyFace(faces, add);
  return out;
}

/**
 * Record the app's default font URL (troika's `defaultFontURL`, used for every unregistered family)
 * and register it as a CSS `FontFace` under {@link DEFAULT_FONT_CSS_FAMILY} (browsers only), so text
 * is measured with the font that is drawn. `configureText` calls this; call it directly only when
 * configuring troika yourself. While set, the built-in default font is not used. `null` forgets
 * it (the built-in default font applies again).
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

/** The app's default font URL, or `undefined` when the built-in default font applies. */
export function getDefaultFontURL(): string | undefined {
  return defaultFont?.url;
}

/**
 * Replace the files of the built-in default font (TeX Gyre Heros, shipped with Holochart) with the
 * app's own, e.g. the same OTF files self-hosted, so no `data:` URL or `blob:` URL is involved.
 * Faces are picked by weight and style like a registered family's ({@link resolveFontFace}), and
 * loaded only when text needs them. `null` restores the shipped files. `configureText` calls this.
 */
export function setDefaultFontFaces(faces: FontFamilyFaces | null): void {
  for (const face of builtinFaces) releaseBuiltinFace(face);
  builtinFaces = createBuiltinFaces(faces);
  notifyFontChange();
}

function releaseBuiltinFace(face: BuiltinFace): void {
  if (face.cssFace && typeof document !== 'undefined') document.fonts?.delete(face.cssFace);
  // troika keeps fonts it has parsed; only future loads of this URL would fail.
  if (face.objectURL) URL.revokeObjectURL(face.objectURL);
  face.cssFace = null;
  face.objectURL = null;
}

/** The built-in face that draws a request, or `undefined` when a registered or app font does. */
function builtinFaceFor(family: string, weight?: TextFontWeight, style?: TextFontStyle) {
  if (defaultFont || resolveFontFace(family, weight, style)) return undefined;
  return bestFace(builtinFaces, normalizeFontWeight(weight), normalizeFontStyle(style));
}

/**
 * The face of the built-in default font that draws a request: `undefined` when the family is
 * registered or the app set a default font URL. Unregistered families (e.g. `'Helvetica Neue',
 * Helvetica, Arial, sans-serif`) are drawn with the built-in font's face closest to the requested
 * weight and style (CSS matching, {@link fontWeightRank}): 400/700 × upright/italic.
 */
export function defaultFontFace(
  family: string,
  weight?: TextFontWeight,
  style?: TextFontStyle,
): DefaultFontFace | undefined {
  const face = builtinFaceFor(family, weight, style);
  return face ? { weight: face.weight, style: face.style, url: face.url ?? undefined } : undefined;
}

/**
 * The font file troika draws a request with: the registered face's URL, else the built-in default
 * font's face once loaded ({@link loadDefaultFontFaces}). While that face has not loaded (or
 * failed to), the closest built-in face that has loaded stands in, so troika never falls back to
 * its CDN font for a whole label (the text primitive waits for the faces it needs, so this only
 * covers empty labels and failed loads). `undefined` means "troika's default font": the app's
 * `defaultFontURL`, or no built-in face loaded yet.
 */
export function resolveDrawnFontURL(
  family: string,
  weight?: TextFontWeight,
  style?: TextFontStyle,
): string | undefined {
  const registered = resolveFontFace(family, weight, style);
  if (registered) return registered.url;
  if (defaultFont) return undefined;
  const w = normalizeFontWeight(weight);
  const s = normalizeFontStyle(style);
  const best = bestFace(builtinFaces, w, s);
  if (best?.url) return best.url;
  return (
    bestFace(
      builtinFaces.filter((face) => face.url !== null),
      w,
      s,
    )?.url ?? undefined
  );
}

/**
 * Whether some request could still need a built-in face to load: false once every face has loaded
 * (or failed, unless `retryFailed`), or while the app's default font URL replaces them. A cheap
 * check that lets callers skip collecting requests for {@link loadDefaultFontFaces}.
 */
export function defaultFontFacesPending(retryFailed = false): boolean {
  return (
    !defaultFont && builtinFaces.some((face) => face.url === null && (retryFailed || !face.failed))
  );
}

/** Options of {@link loadDefaultFontFaces}. */
export interface LoadDefaultFontFacesOptions {
  /** Retry faces whose last load failed (default true). */
  retryFailed?: boolean;
}

/**
 * Load the built-in default font faces that draw these requests and have not loaded yet (the
 * regular face for plain text, bold or italic only when requested). Returns a promise that resolves
 * once they have loaded (or failed: text then draws with troika's default font, and the error is
 * logged once), or `null` when nothing needs loading. Each face is loaded once, and its load
 * includes its CSS `FontFace` for the metrics oracle, so text measured afterwards uses it.
 */
export function loadDefaultFontFaces(
  requests: Iterable<TextFontRequest>,
  options: LoadDefaultFontFacesOptions = {},
): Promise<void> | null {
  const retryFailed = options.retryFailed !== false;
  if (!defaultFontFacesPending(retryFailed)) return null;
  const loads = new Set<Promise<void>>();
  for (const request of requests) {
    const face = builtinFaceFor(request.family, request.weight, request.style);
    if (!face || face.url !== null) continue;
    if (face.failed && !retryFailed) continue;
    loads.add(loadBuiltinFace(face));
  }
  if (loads.size === 0) return null;
  return Promise.all(loads).then(() => undefined);
}

/**
 * Load one built-in face (once; concurrent callers share the load): resolve its URL, turn a `data:`
 * URL into a `blob:` URL, register its CSS face and wait for it to load. Never rejects.
 */
function loadBuiltinFace(face: BuiltinFace): Promise<void> {
  if (face.url !== null) return Promise.resolve();
  face.failed = false;
  face.loading ??= face.source().then(
    async (source) => {
      if (!builtinFaces.includes(face)) return; // replaced while loading
      const url = drawableURL(source);
      face.objectURL = url === source ? null : url;
      const cssFace = addCSSFontFace(
        BUILTIN_FONT_CSS_FAMILY,
        url,
        { weight: String(face.weight), style: face.style },
        true,
      );
      face.cssFace = cssFace;
      // Loaded means drawable *and* measurable: wait for the CSS face, so text laid out after this
      // load is measured with it. Subscribers are notified when it has loaded (addCSSFontFace).
      if (cssFace) await cssFace.loaded.catch(() => undefined);
      if (!builtinFaces.includes(face)) return;
      face.url = url;
      face.loading = null;
      if (!cssFace) notifyFontChange();
    },
    (error: unknown) => {
      face.loading = null;
      face.failed = true;
      reportFontError(error);
    },
  );
  return face.loading ?? Promise.resolve();
}

/**
 * A `blob:` URL for a base64 `data:` URL (browsers): troika sends the font URL to its worker with
 * every typesetting request and caches parsed fonts by URL, so a short URL avoids copying and
 * hashing ~180 kB strings per label. Other URLs are returned as they are.
 */
function drawableURL(url: string): string {
  const comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0) return url;
  const meta = url.slice(5, comma);
  if (
    !meta.endsWith(';base64') ||
    typeof Blob === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof atob !== 'function'
  ) {
    return url;
  }
  try {
    const binary = atob(url.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: meta.slice(0, -7) }));
  } catch {
    // Blob URLs unavailable (e.g. a CSP without blob:): troika can read the data: URL directly.
    return url;
  }
}

function reportFontError(error: unknown): void {
  if (fontErrorReported) return;
  fontErrorReported = true;
  console.error('[holochart] could not load the built-in default font:', error);
}

/** The best face for a weight and style: exact style first, then {@link fontWeightRank}. */
function bestFace<T extends { weight: number; style: TextFontStyle }>(
  faces: readonly T[],
  weight: number,
  style: TextFontStyle,
): T | undefined {
  let best: T | undefined;
  let bestRank = Infinity;
  for (const face of faces) {
    const rank = (face.style === style ? 0 : 10000) + fontWeightRank(weight, face.weight);
    if (rank < bestRank) {
      bestRank = rank;
      best = face;
    }
  }
  return best;
}

/**
 * The face to measure a font request with, i.e. the font troika will draw it with (plan E2.18):
 *
 * 1. A registered family ({@link resolveFontFace}): its name and the registered face's weight and
 *    style (troika draws that file as is, without synthesizing bold or italic).
 * 2. Else, with an app default font URL: {@link DEFAULT_FONT_CSS_FAMILY} at 400/normal.
 * 3. Else the built-in default font: {@link BUILTIN_FONT_CSS_FAMILY} at the weight and style of the
 *    face that draws the request ({@link defaultFontFace}). Asking starts loading that face (text
 *    is being measured, so it is about to be drawn); its CSS face is registered once loaded.
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
  const builtin = registered ? undefined : builtinFaceFor(face.family, face.weight, face.style);
  if (registered) {
    out = {
      family: `${cssFontFamily(registered.family)}, ${requested}`,
      weight: registered.weight,
      style: registered.style,
      source: 'registered',
    };
  } else if (defaultFont || !builtin) {
    // No built-in face at all (an empty `defaultFontFaces`) behaves like troika's default font.
    out = {
      family: `${DEFAULT_FONT_CSS_FAMILY}, ${requested}`,
      weight: 400,
      style: 'normal',
      source: 'default',
    };
  } else {
    if (builtin.url === null && !builtin.failed) void loadBuiltinFace(builtin);
    out = {
      family: `${BUILTIN_FONT_CSS_FAMILY}, ${requested}`,
      weight: builtin.weight,
      style: builtin.style,
      source: 'builtin',
    };
  }
  measurementFaces.set(key, out);
  return out;
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
