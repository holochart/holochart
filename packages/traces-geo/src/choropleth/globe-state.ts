/**
 * What hover asks of a `choropleth` drawn on a 3D globe (backlog GEO8, ADR-028). The globe's view
 * is lazy code (`globe.ts`); hover, selection and the keyboard stops are not. The view leaves
 * this for each calc it draws, and they read it: a few lines of the package's initial code.
 */

/** The regions of a trace as its globe view drew them. */
export interface GlobeRegions {
  /**
   * The location (an index into `locations`) drawn at the container point `(cx, cy)`, by a GPU
   * pick of the globe's viewport, or -1: nothing of this trace is in front there, or the pick of
   * this position has not resolved yet (hover is run again when it has).
   */
  locationAt(cx: number, cy: number): number;
  /**
   * Where the label of location `i` is anchored when its region is raised: the top of its prism
   * above the feature's point, in container px (top-left origin), or `null` when the globe hides
   * it or it is outside the part of the subplot that draws. `undefined` for a region that lies
   * on the surface, whose label is anchored as on a flat map.
   */
  anchor(i: number): [number, number] | null | undefined;
  /** The height of location `i`'s prism in globe radii; 0 for a region on the surface. */
  height(i: number): number;
}

const STATE = new WeakMap<object, GlobeRegions>();

/** Leave (or take back, with `undefined`) what the globe view drew for `calc`. */
export function setGlobeRegions(calc: object, regions: GlobeRegions | undefined): void {
  if (regions) STATE.set(calc, regions);
  else STATE.delete(calc);
}

/** What the globe view drew for `calc`; `undefined` when it drew nothing (yet). */
export function globeRegionsOf(calc: object): GlobeRegions | undefined {
  return STATE.get(calc);
}
