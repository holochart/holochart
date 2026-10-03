import {
  accessibleText,
  countText,
  formatPlainNumber,
  traceNameText,
  type TraceA11yParts,
} from '@mk7s/holochart-runtime';
import { sceneCameraPayload } from './scene/camera.ts';
import { applyMotion } from './scene/controls.ts';
import { sceneAxisHoverText } from './scene/hover.ts';
import { sceneFor } from './scene/scene.ts';

type Chunk = typeof import('./a11y.ts');
type Builders = {
  [K in keyof Chunk as Chunk[K] extends (...deps: never[]) => TraceA11yParts ? K : never]: Chunk[K];
};

/**
 * `TraceModule.a11y` of a trace of this package (backlog S2.14): loads the package's
 * accessibility chunk on first use and builds the trace's parts from the functions they need.
 * Those are handed over, not imported by the chunk, so the chunk shares no module with the
 * package: an app's bundler adds no shared chunk for it, and a bundle with one trace of the
 * package doesn't keep the others' code.
 */
export const lazyA11y =
  <K extends keyof Builders>(part: K, ...deps: Parameters<Builders[K]>) =>
  (): Promise<TraceA11yParts> =>
    import('./a11y.ts').then((m) => (m[part] as (...d: unknown[]) => TraceA11yParts)(...deps));

/** What the scene parts of the chunk need of the package and the runtime. */
export const sceneKit = [
  sceneFor,
  sceneAxisHoverText,
  sceneCameraPayload,
  applyMotion,
  accessibleText,
  countText,
  formatPlainNumber,
  traceNameText,
] as const;

/** `TraceModule.a11y` of the 3D traces: their scene's view keys and their descriptions. */
export const sceneA11y = /* @__PURE__ */ lazyA11y('scene', ...sceneKit);
