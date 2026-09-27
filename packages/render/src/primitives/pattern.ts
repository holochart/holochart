/**
 * Pattern fills (plan E8.10): Plotly's `marker.pattern` / `fillpattern` hatches, drawn procedurally
 * in the fragment shader of the rect, arc and fill primitives. This module is in every bundle that
 * draws those primitives, so it only keeps the data types and one promise; resolving Plotly's
 * pattern attributes per item, the pattern shader code and the attribute writer are in
 * `pattern-code.ts`, loaded with a dynamic `import()` the first time a primitive draws a pattern
 * (like the custom markers, `markers/custom.ts`). Primitives without a pattern keep their shaders
 * untouched: the code is injected at their `// @pattern-…` hooks only while they draw one.
 *
 * ## Tiles
 *
 * Tiles are `size` CSS px (Plotly: SVG `<pattern patternUnits="userSpaceOnUse">`), so they keep
 * their size under zoom and at any device pixel ratio. They are anchored at the top-left corner of
 * the viewport (the plot area of a cartesian subplot) for rects and fills, and at the center for
 * arcs (pie, barpolar). See `pattern-coverage.ts` for the shapes and the solidity mapping.
 */
import type { Mesh, ShaderMaterial } from 'three';
import type { RGBA } from '../types.ts';

/** Plotly's `pattern.shape` values; a shape's code is its index (0, `''`: no pattern). */
export const PATTERN_SHAPES = ['', '/', '\\', 'x', '-', '|', '+', '.'] as const;

/** A Plotly pattern shape. */
export type PatternShape = (typeof PATTERN_SHAPES)[number];

/**
 * Plotly's pattern attributes (`marker.pattern`, `fillpattern`) as in a full trace: `shape`,
 * `size` and `solidity` (numbers), `fgcolor` and `bgcolor` (CSS colors) may be arrays (per item);
 * `fillmode` (`'replace'` | `'overlay'`) and `fgopacity` are single values.
 */
export type PatternAttributes = Readonly<Record<string, unknown>>;

/**
 * Pattern fills of a primitive's items (rects, arcs or fill polygons), resolved per item by the
 * lazily loaded code with Plotly's rules: where `fgcolor` / `bgcolor` are unset, `fillmode:
 * 'replace'` draws the item's color on a transparent background, `'overlay'` draws the item's
 * contrast color (white on dark colors, `#444` on light ones) at `fgopacity` 0.5 over the item's
 * color. Items without a shape keep their plain fill.
 */
export interface PatternFill {
  /** One pattern for every item (array attributes index the items), or one per item. */
  pattern: PatternAttributes | readonly (PatternAttributes | null | undefined)[];
  /** Each item's color (sRGB RGBA, 4 floats per item, before opacity): the default colors. */
  color: ArrayLike<number>;
  /** Each item's opacity, or one for all, multiplying the pattern's colors. Default 1. */
  opacity?: ArrayLike<number> | number;
  /**
   * Item → index into `color`, `opacity` and array attributes, or -1 for no pattern (default: the
   * item's own index), e.g. for items drawn out of a longer list.
   */
  index?: ArrayLike<number>;
  /**
   * The CSS color behind the items (e.g. `plot_bgcolor`): translucent colors are composited over
   * it before picking their contrast color. Default white (Plotly).
   */
  background?: unknown;
  /** Parses `fgcolor`, `bgcolor` and `background` (e.g. core's `toRGBA`). */
  parse: (css: string) => RGBA | null | undefined;
  /**
   * Legend glyphs (per-item patterns): Plotly draws their first item's shape and colors, arrays of
   * `size` / `solidity` at 8 / 0.5, sizes above 10 at 10, and scales the tiles by 0.8.
   */
  legend?: boolean;
}

/** The lazily loaded half (`pattern-code.ts`). */
export type PatternModule = typeof import('./pattern-code.ts');

let mod: PatternModule | undefined;
let loading: Promise<PatternModule> | undefined;
let pending: Promise<void> = Promise.resolve();

/** Load the pattern code once (concurrent callers share it; a failed load is retried). */
function load(): Promise<PatternModule> {
  return (loading ??= import('./pattern-code.ts').then(
    (m) => (mod = m),
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  ));
}

/**
 * Run `work` with the pattern code: at once when it has loaded, else once it has
 * ({@link patternsReady} covers it). Never rejects: a failed load is reported.
 */
export function withPatterns(work: (m: PatternModule) => void): void {
  if (mod) {
    work(mod);
    return;
  }
  const done = load()
    .then(work)
    .catch((error: unknown) => console.warn('[holochart] patterns:', error));
  pending = Promise.all([pending, done]).then(() => undefined);
}

/**
 * Resolves once every pattern requested so far is drawn (or its code failed to load). The same
 * promise until new work arrives.
 */
export function patternsReady(): Promise<void> {
  return pending;
}

/** Set a material's shaders (recompiling only when they changed). */
export function setShaders(material: ShaderMaterial, vertex: string, fragment: string): void {
  if (material.vertexShader === vertex && material.fragmentShader === fragment) return;
  material.vertexShader = vertex;
  material.fragmentShader = fragment;
  material.needsUpdate = true;
}

/**
 * Draw the `pattern()` of the instanced rect or arc `mesh` (per-instance attributes for its
 * `count()` instances and the pattern shaders, once the code is in), or go back to the plain
 * `shaders` without one. The getters are read when the work runs, so a pattern replaced or removed
 * (or a primitive disposed: `pattern()` null) while the code loads is never drawn.
 */
export function syncInstancePattern(
  mesh: Mesh,
  shaders: readonly [vertex: string, fragment: string],
  pattern: () => PatternFill | null,
  count: () => number,
  invalidate: () => void,
): void {
  if (!pattern()) {
    setShaders(mesh.material as ShaderMaterial, ...shaders);
    return;
  }
  withPatterns((m) => {
    const p = pattern();
    if (!p) return;
    m.writeInstancePattern(mesh, shaders, p, count());
    invalidate();
  });
}
