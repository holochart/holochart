/**
 * Entry of the lazily loaded fill chunk (plan E21.6): the only module `fill-loader.ts` imports,
 * with a dynamic `import()`, so the fill primitive, earcut and the exact fill-rule code
 * (`fill-arrangement.ts`) stay out of the initial chunk of charts that never draw a fill.
 *
 * `FillPrimitive` and `createFillPrimitive` are also public exports of the package, which bundlers
 * resolve statically: a module both statically and dynamically reachable is never split out. So
 * render's ESM build emits this entry as its own file, `dist/fill-lazy.js`, with its own copy of
 * the fill modules; everything else it needs (three.js, the shared primitive helpers) it imports
 * from `./index.js`. An app that imports the public fill exports directly bundles `dist/index.js`'s
 * copy up front and still loads this chunk the first time a chart draws a fill (see
 * `packages/render/tsdown.config.ts`). Source builds (vitest, dev servers, the IIFE) resolve this
 * module normally: one copy, and the IIFE inlines it.
 */
export { createFillPrimitive } from './fill.ts';
