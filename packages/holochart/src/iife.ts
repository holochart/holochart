/**
 * Entry of `holochart.iife.min.js`, the script-tag build (ADR-015): the 2D bundle
 * (`bundle-2d.ts`) as `window.Holochart`, plus the internal handle the
 * `holochart-3d.iife.min.js` add-on uses (`Holochart.__iife`, see `iife/host.ts`).
 */
import { provideLazy3D, type IIFEHost } from './iife/host.ts';
import * as three from './iife/three.ts';

export * from './bundle-2d.ts';

/** Internal: the handle add-on scripts use (`iife/host.ts`). Not public API. */
export const __iife: IIFEHost = {
  version: __HOLOCHART_VERSION__,
  three,
  provideLazy3D,
};
