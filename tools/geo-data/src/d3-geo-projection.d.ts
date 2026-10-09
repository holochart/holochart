/** The one function the build uses of `d3-geo-projection`, which ships no declarations. */
declare module 'd3-geo-projection' {
  /**
   * A copy of a GeoJSON object with the cuts along the antimeridian and at the poles removed:
   * polygon fragments that end on a cut are joined back into rings that cross it.
   */
  export function geoStitch<T>(object: T): T;
}
