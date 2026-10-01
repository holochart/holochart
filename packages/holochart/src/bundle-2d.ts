/**
 * The 2D bundle of the script-tag build (ADR-015): the full bundle (`index.ts`) without the 3D
 * package (`@mk7s/holochart-traces-3d`, and with it render's lazily loaded 3D mesh, line and marker
 * code). `iife.ts` builds `holochart.iife.min.js` from it; the `holochart-3d.iife.min.js` add-on
 * (`iife-3d.ts`) registers the 3D modules into the same registry.
 */
import { builtinComponents } from '@mk7s/holochart-components';
import { registerBuiltinColors } from '@mk7s/holochart-core';
import * as runtime from '@mk7s/holochart-runtime';
import { builtinThemes } from '@mk7s/holochart-themes';
import { traces2d } from './traces-2d.ts';
import { withView3D } from './view3d/index.ts';

/**
 * Every built-in module of the 2D bundle, registered through the same public `register` API
 * plugins use (E22.1). The 3D add-on's modules are `traces3d`.
 */
export const builtins: readonly runtime.Registrable[] = withView3D([
  ...traces2d,
  ...builtinComponents,
]);

runtime.register(...builtins, ...builtinThemes);
// Every named palette and colorscale of plan E8.2 (partial bundles opt in; see core `colors`).
registerBuiltinColors();

export * from './exports.ts';
