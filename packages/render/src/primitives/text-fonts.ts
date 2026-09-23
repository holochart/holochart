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
 */

/** CSS font weight: a number in 1–1000, or the `normal` (400) / `bold` (700) keywords. */
export type TextFontWeight = number | 'normal' | 'bold';

/** CSS font style. `oblique` is treated as `italic`. */
export type TextFontStyle = 'normal' | 'italic';

/** A font request: CSS family list, size in CSS px, weight, and style. */
export interface TextFont {
  /** CSS font family list, e.g. `'Inter, "Open Sans", sans-serif'`. */
  family: string;
  /** Font size in CSS px (em-box height). */
  size: number;
  /** Default 400. */
  weight?: TextFontWeight;
  /** Default `'normal'`. */
  style?: TextFontStyle;
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
  url: string;
  weight: number;
  style: TextFontStyle;
}

const registry = new Map<string, Face[]>();
const listeners = new Set<() => void>();

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

/** Remove every registered font (tests, hot reload). */
export function clearFontRegistry(): void {
  registry.clear();
  notifyFontChange();
}

/**
 * Resolve a CSS family list to a registered font URL: the first registered family in the list wins,
 * then the best face by style (exact, else the other style) and weight ({@link fontWeightRank}).
 * Returns `undefined` when no family is registered, meaning "use troika's default font".
 */
export function resolveFontURL(
  family: string,
  weight?: TextFontWeight,
  style?: TextFontStyle,
): string | undefined {
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
    if (best) return best.url;
  }
  return undefined;
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
  for (const listener of listeners) listener();
}

function loadCSSFontFace(face: RegisteredFontFace, entry: Face): void {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    return;
  }
  try {
    const cssFace = new FontFace(face.family.trim(), `url(${JSON.stringify(face.url)})`, {
      weight: String(entry.weight),
      style: entry.style,
    });
    document.fonts.add(cssFace);
    cssFace.load().then(notifyFontChange, () => {
      // A failed CSS load only affects metrics accuracy; troika reports its own font errors.
    });
  } catch {
    // Invalid descriptors or CSP restrictions: metrics fall back to the browser's fallback font.
  }
}
