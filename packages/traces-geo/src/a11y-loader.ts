import type { TraceA11yParts } from '@mk7s/holochart-runtime';
import { laidOutGeoSubplots } from './geo/cross-trace.ts';
import { geoResetRelayout, keyGeoView } from './geo/interact.ts';
import { geoOf } from './geo/layout-defaults.ts';
import { geoLabel } from './scattergeo/hover.ts';

type Chunk = typeof import('./a11y.ts');
type Builders = {
  [K in keyof Chunk as Chunk[K] extends (...deps: never[]) => TraceA11yParts ? K : never]: Chunk[K];
};

/**
 * `TraceModule.a11y` of a trace of this package (backlog S2.14, GEO6): loads the package's
 * accessibility chunk on first use and builds the trace's parts from the functions they need.
 * Those are handed over, not imported by the chunk, so the chunk shares no module with the
 * package: an app's bundler adds no shared chunk for it, and a bundle with one trace of the
 * package doesn't keep the others' code.
 */
export const lazyA11y =
  <K extends keyof Builders>(part: K, ...deps: Parameters<Builders[K]>) =>
  (): Promise<TraceA11yParts> =>
    import('./a11y.ts').then((m) => (m[part] as (...d: unknown[]) => TraceA11yParts)(...deps));

/** What the view keys of the chunk need of the package: every geo trace hands it over. */
export const viewKit = [laidOutGeoSubplots, geoOf, keyGeoView, geoResetRelayout, geoLabel] as const;
