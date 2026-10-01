/**
 * Build-time names of the script-tag build (`tsdown.config.ts`); only `iife.ts` and `iife-3d.ts`
 * (never the ESM bundle) use them.
 */

/** The package version, inlined by the IIFE builds (`define`). */
declare const __HOLOCHART_VERSION__: string;

/**
 * Render's lazily loaded 3D chunks, bundled into the 3D add-on (a virtual module of its build:
 * render's `primitives/mesh-lazy.ts`, `primitives/lines-markers-3d.ts` and the 2.5D chunk
 * `primitives/extrusion-lazy.ts`).
 */
declare module 'holochart-iife:render-3d' {
  import type { ExtrusionModule, LinesMarkers3DModule, MeshModule } from '@mk7s/holochart-render';

  export const mesh: MeshModule;
  export const linesMarkers3D: LinesMarkers3DModule;
  export const extrusion: ExtrusionModule;
}
