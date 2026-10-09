import type { TraceA11yParts } from '@mk7s/holochart-runtime';
import { connectedComponents } from './data/metrics.ts';
import { nodeName } from './graph/describe.ts';
import { partHoverinfo } from './graph/hover.ts';
import { arrowsOf } from './graph/links.ts';

type Chunk = typeof import('./a11y.ts');
type Builders = {
  [K in keyof Chunk as Chunk[K] extends (...deps: never[]) => TraceA11yParts ? K : never]: Chunk[K];
};

/**
 * `TraceModule.a11y` of a trace of this package (backlog S2.14, G10): loads the package's
 * accessibility chunk on first use and builds the trace's parts from the functions they need.
 * Those are handed over, not imported by the chunk, so the chunk shares no module with the
 * package: an app's bundler adds no shared chunk for it, and a bundle with one trace of the
 * package doesn't keep the others' code.
 */
export const lazyA11y =
  <K extends keyof Builders>(part: K, ...deps: Parameters<Builders[K]>) =>
  (): Promise<TraceA11yParts> =>
    import('./a11y.ts').then((m) => (m[part] as (...d: unknown[]) => TraceA11yParts)(...deps));

/**
 * What the stops of `graph` and `graph3d` both need of the package. Pass it as it is, do not
 * spread it into the loader call: with `...graphKit` there, the bundler kept both trace modules
 * in a bundle that registers one of them, pure annotation or not (measured: an app with 2D graphs
 * carried `graph3d` and the 3D package, 3.9 kB; tests/bundle/esm-graph-no-3d.spec.ts).
 */
export const graphKit = [partHoverinfo, arrowsOf, nodeName, connectedComponents] as const;

/**
 * The parts of trace type `type` with the view keys of its 3D scene: `own` is this package's
 * loader for the type, `scene` the 3D package's (`sceneA11y`, whose chunk has the view keys under
 * `'*'`). The runtime takes a type's own parts or the `'*'` ones, not both, so they are joined
 * here. The scene loader is a parameter so that this file does not import the 3D package.
 */
export const withSceneKeys =
  (
    type: string,
    own: () => Promise<TraceA11yParts>,
    scene: () => Promise<TraceA11yParts>,
  ): (() => Promise<TraceA11yParts>) =>
  () =>
    Promise.all([scene(), own()]).then(([view, stops]) => ({
      [type]: { ...view['*'], ...stops[type] },
    }));
