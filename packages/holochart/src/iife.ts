/**
 * Entry of `holochart.iife.min.js`, the script-tag build (ADR-015): the 2D bundle
 * (`bundle-2d.ts`) as `window.Holochart`, plus what the `holochart-3d.iife.min.js` add-on uses
 * and is not API: the handle `Holochart.__iife` (`iife/host.ts`) and the packages' `@internal`
 * exports the 3D code imports (`iife/addon-shared.ts`).
 */
import { provideLazy3D, type IIFEHost } from './iife/host.ts';
import * as three from './iife/three.ts';

export * from './bundle-2d.ts';
export * from './iife/addon-shared.ts';

/** Internal: the handle add-on scripts use (`iife/host.ts`). Not public API. */
export const __iife: IIFEHost = {
  version: __HOLOCHART_VERSION__,
  three,
  provideLazy3D,
};
