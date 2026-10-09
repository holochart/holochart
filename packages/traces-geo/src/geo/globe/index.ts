/**
 * The geometry of the 3D globe (backlog GEO8, ADR-028): polygons, lines and arcs on the unit
 * sphere, built once and placed by one matrix (`GeoSubplot.globeMatrix`). Pure: no rendering.
 *
 * This is the entry of a **lazy chunk** (ADR-026): a map that is not a globe loads none of it.
 * It is reached only through `loadGlobe()` of `globe-loader.ts`, which also hands it the stream
 * sink and render's triangulation ({@link provideGlobeDeps}), so that the chunk shares no module
 * with the package's initial code or with render.
 */
export { provideGlobeDeps, type GlobeDeps } from './deps.ts';
export {
  buildSphereMesh,
  buildSphereShell,
  DEFAULT_DENSIFY,
  DEFAULT_MAX_EDGE,
  type SphereMesh,
  type SphereMeshOptions,
} from './mesh.ts';
export {
  buildArcs,
  buildSphereLines,
  DEFAULT_LIFT,
  type ArcsOptions,
  type SphereLines,
  type SphereLinesOptions,
} from './lines.ts';
export { buildPrisms, type PrismMesh, type PrismsOptions } from './prisms.ts';
