/**
 * Entry of the lazily loaded 3D mesh chunk (plan E2.11, E8.7, E2.14): the only module
 * `mesh-loader.ts` imports, with a dynamic `import()`. Nothing else imports these modules at run
 * time (render's index re-exports their types only), so bundlers split the mesh primitive, its
 * shaders, normals, lighting, material types and transparency sorting into their own chunk, which
 * 2D charts never load.
 */
export * from './mesh.ts';
export * from './mesh-geometry.ts';
export * from './mesh-material.ts';
export * from './lighting.ts';
export * from './transparency.ts';
