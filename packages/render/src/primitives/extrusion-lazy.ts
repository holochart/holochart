/**
 * Entry of the lazily loaded 2.5D chunk (plan E8.9): the only module `extrusion-loader.ts` imports,
 * with a dynamic `import()`. Nothing else imports these modules at run time (render's index
 * re-exports their types only), so bundlers split the extrusion primitive, the prism geometry and
 * the 2.5D view (camera math, projector, clipping) into their own chunk, which flat charts never
 * load. The mesh primitive the prisms draw with comes from the mesh chunk (loaded alongside).
 */
export * from './extrusion.ts';
export * from './extrusion-geometry.ts';
export * from './extrusion-cartesian.ts';
export * from './extrusion-domain.ts';
export * from './view3d.ts';
export * from './view3d-camera.ts';
