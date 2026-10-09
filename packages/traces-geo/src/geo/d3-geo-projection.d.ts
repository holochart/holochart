// `d3-geo-projection` ships no types and there is no `@types` package for version 4. This declares
// the factories of Plotly's projections, which is all the geo subplot imports from it
// (`projections-extra.ts`). It is an ambient declaration: `projections-extra.ts` references it by
// path, so it is found by any program that compiles that file.
declare module 'd3-geo-projection' {
  import type { GeoProjection } from 'd3-geo';

  /** The tilted perspective projection: `distance` is in Earth radii from the centre. */
  export interface GeoSatelliteProjection extends GeoProjection {
    distance(): number;
    distance(distance: number): this;
    tilt(): number;
    tilt(degrees: number): this;
  }

  export function geoAiry(): GeoProjection;
  export function geoAitoff(): GeoProjection;
  export function geoAugust(): GeoProjection;
  export function geoBaker(): GeoProjection;
  export function geoBertin1953(): GeoProjection;
  export function geoBoggs(): GeoProjection;
  export function geoBonne(): GeoProjection;
  export function geoBottomley(): GeoProjection;
  export function geoBromley(): GeoProjection;
  export function geoCollignon(): GeoProjection;
  export function geoCraig(): GeoProjection;
  export function geoCraster(): GeoProjection;
  export function geoCylindricalEqualArea(): GeoProjection;
  export function geoCylindricalStereographic(): GeoProjection;
  export function geoEckert1(): GeoProjection;
  export function geoEckert2(): GeoProjection;
  export function geoEckert3(): GeoProjection;
  export function geoEckert4(): GeoProjection;
  export function geoEckert5(): GeoProjection;
  export function geoEckert6(): GeoProjection;
  export function geoEisenlohr(): GeoProjection;
  export function geoFahey(): GeoProjection;
  export function geoFoucaut(): GeoProjection;
  export function geoFoucautSinusoidal(): GeoProjection;
  export function geoGinzburg4(): GeoProjection;
  export function geoGinzburg5(): GeoProjection;
  export function geoGinzburg6(): GeoProjection;
  export function geoGinzburg8(): GeoProjection;
  export function geoGinzburg9(): GeoProjection;
  export function geoGringorten(): GeoProjection;
  export function geoGringortenQuincuncial(): GeoProjection;
  export function geoGuyou(): GeoProjection;
  export function geoHammer(): GeoProjection;
  export function geoHill(): GeoProjection;
  export function geoHomolosine(): GeoProjection;
  export function geoHufnagel(): GeoProjection;
  export function geoHyperelliptical(): GeoProjection;
  export function geoKavrayskiy7(): GeoProjection;
  export function geoLagrange(): GeoProjection;
  export function geoLarrivee(): GeoProjection;
  export function geoLaskowski(): GeoProjection;
  export function geoLoximuthal(): GeoProjection;
  export function geoMiller(): GeoProjection;
  export function geoMollweide(): GeoProjection;
  export function geoMtFlatPolarParabolic(): GeoProjection;
  export function geoMtFlatPolarQuartic(): GeoProjection;
  export function geoMtFlatPolarSinusoidal(): GeoProjection;
  export function geoNaturalEarth2(): GeoProjection;
  export function geoNellHammer(): GeoProjection;
  export function geoNicolosi(): GeoProjection;
  export function geoPatterson(): GeoProjection;
  export function geoPeirceQuincuncial(): GeoProjection;
  export function geoPolyconic(): GeoProjection;
  export function geoRectangularPolyconic(): GeoProjection;
  export function geoRobinson(): GeoProjection;
  export function geoSatellite(): GeoSatelliteProjection;
  export function geoSinuMollweide(): GeoProjection;
  export function geoSinusoidal(): GeoProjection;
  export function geoTimes(): GeoProjection;
  export function geoVanDerGrinten(): GeoProjection;
  export function geoVanDerGrinten2(): GeoProjection;
  export function geoVanDerGrinten3(): GeoProjection;
  export function geoVanDerGrinten4(): GeoProjection;
  export function geoWagner4(): GeoProjection;
  export function geoWagner6(): GeoProjection;
  export function geoWiechel(): GeoProjection;
  export function geoWinkel3(): GeoProjection;
}
