/**
 * Entry of the lazily loaded picker chunk (GEO8): the only module `picker-loader.ts` imports, with
 * a dynamic `import()`.
 *
 * `createPicker` is a public export of the package, and the 3D scenes use it that way. A bundler
 * resolves that statically, so code which picks only on rare occasions, from a lazy chunk of its
 * own (the 3D globe of a map), would bring the pickers into its app's initial chunk by importing
 * it: 5.7 kB gzipped for every map, globe or not. Through `loadPicker` they stay out of it. As for
 * the fill chunk (`primitives/fill-lazy.ts`), render's ESM build emits this entry as its own file,
 * `dist/picker-lazy.js`, with its own copy of the picking modules; the point index, which every
 * chart has, it takes from `./index.js`. A picker holds no state outside itself, so the two
 * copies do not meet. Source builds (vitest, dev servers, the IIFE) resolve this module normally.
 */
export { createPicker } from './picker.ts';
