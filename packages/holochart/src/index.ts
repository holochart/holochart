/**
 * @mk7s/holochart — the full bundle: core, the chart runtime, and every built-in trace and
 * component registered into the shared registry (ADR-019), 3D scenes and traces included. For
 * smaller bundles, import `@mk7s/holochart-runtime` and register only the modules you use (E21.1).
 *
 * The script-tag build splits this bundle in two (ADR-015): `holochart.iife.min.js` is
 * `bundle-2d.ts` (everything but the 3D package), and `holochart-3d.iife.min.js` (`iife-3d.ts`)
 * adds the 3D package to it.
 */
import { builtinComponents } from '@mk7s/holochart-components';
import { registerBuiltinColors } from '@mk7s/holochart-core';
import * as runtime from '@mk7s/holochart-runtime';
import { builtinThemes } from '@mk7s/holochart-themes';
import { traces3d } from '@mk7s/holochart-traces-3d';
import { traces2d } from './traces-2d.ts';

/** Every built-in module, registered through the same public `register` API plugins use (E22.1). */
export const builtins: readonly runtime.Registrable[] = [
  ...traces2d,
  ...traces3d,
  ...builtinComponents,
];

runtime.register(...builtins, ...builtinThemes);
// Every named palette and colorscale of plan E8.2 (partial bundles opt in; see core `colors`).
registerBuiltinColors();

export * from './exports.ts';
export * from '@mk7s/holochart-traces-3d';
