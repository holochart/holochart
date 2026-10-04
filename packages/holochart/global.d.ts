/**
 * Types of `window.Holochart`, the global of the script-tag build (`dist/holochart.iife.min.js`,
 * ADR-015), for code that uses Holochart from a `<script>` tag instead of `import`. Add them with
 *
 * ```ts
 * /// <reference types="@mk7s/holochart/global" />
 * ```
 *
 * or `"types": ["@mk7s/holochart/global"]` in `tsconfig.json` / `jsconfig.json`.
 *
 * The main script exposes the 2D bundle: every export of `@mk7s/holochart` but the 3D package's.
 * Those (`traces3d`, …) are added by the 3D add-on (`dist/holochart-3d.iife.min.js`), so they are
 * optional here. Type-only exports (`Figure`, …) are imported from `@mk7s/holochart` as usual.
 *
 * The script sets a few more properties for the add-on: `__iife` and the `@internal` exports of the
 * packages the 3D code imports. They are not typed here and are not API.
 */
import type * as Bundle from './dist/index.js';
import type * as Traces3D from '@mk7s/holochart-traces-3d';

/** The names the 3D add-on adds to the global. */
type AddOnName = keyof typeof Traces3D & keyof typeof Bundle;

/** `window.Holochart`: the 2D bundle, plus the 3D add-on's exports once that script has run. */
export type HolochartGlobal = Omit<typeof Bundle, AddOnName> &
  Partial<Pick<typeof Bundle, AddOnName>>;

declare global {
  /** The script-tag build's global (`holochart.iife.min.js`). */
  var Holochart: HolochartGlobal;
  interface Window {
    /** The script-tag build's global (`holochart.iife.min.js`). */
    Holochart: HolochartGlobal;
  }
}
