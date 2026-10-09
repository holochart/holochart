// `@types/d3-geo-projection` is not installed. Spike F (`f-geo-projection.ts`) uses one function of
// the package, so this declares just that. Delete it together with the spike page.
declare module 'd3-geo-projection' {
  import type { GeoStreamWrapper } from 'd3-geo';
  import type { Feature, FeatureCollection, Geometry } from 'geojson';

  /** Project a GeoJSON object to planar GeoJSON (clipped and resampled by `projection`). */
  export function geoProject(
    object: FeatureCollection,
    projection: GeoStreamWrapper,
  ): FeatureCollection<Geometry | null>;
  export function geoProject(
    object: Feature,
    projection: GeoStreamWrapper,
  ): Feature<Geometry | null>;
  export function geoProject(object: Geometry, projection: GeoStreamWrapper): Geometry | null;
}
