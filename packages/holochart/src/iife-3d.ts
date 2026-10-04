/**
 * Entry of `holochart-3d.iife.min.js`, the 3D add-on of the script-tag build (ADR-015), loaded
 * after `holochart.iife.min.js`:
 *
 * ```html
 * <script src="holochart.iife.min.js"></script>
 * <script src="holochart-3d.iife.min.js"></script>
 * ```
 *
 * It registers the 3D scene and trace modules (`traces3d`) into the main script's registry, adds
 * the 3D package's public exports to `window.Holochart` (`exports-3d.ts`, the names the ESM full
 * bundle exports), and provides render's lazily loaded 3D chunks (mesh, lines and markers) to the
 * main script's loaders, and the 2.5D chunk (`layout.view3d`, `depth`: the extrusion primitive and
 * the 2.5D view, with the full bundle's 2.5D view component's view).
 *
 * It bundles only the 3D package and those chunks: three.js, core, the runtime, render and
 * traces-basic are the main script's (the build maps them to `Holochart.__iife` and
 * `Holochart.render`, see `tsdown.config.ts`), so there is one three.js, one registry and one copy
 * of render's state per page. A banner stops the script with an error when the main script isn't
 * loaded.
 */
import { register } from '@mk7s/holochart-runtime';
import * as traces3dExports from './exports-3d.ts';
import { extrusion, linesMarkers3D, mesh } from 'holochart-iife:render-3d';
import type { IIFEHost } from './iife/host.ts';
import * as view3d from './view3d/view.ts';

type Global = Record<string, unknown> & { __iife: IIFEHost };

function install(hc: Global): void {
  const host = hc.__iife;
  if (host.version !== __HOLOCHART_VERSION__) {
    throw new Error(
      `[holochart] holochart-3d.iife.min.js ${__HOLOCHART_VERSION__} needs holochart.iife.min.js of the same version (loaded: ${host.version}).`,
    );
  }
  if ('traces3d' in hc) {
    console.warn(
      '[holochart] holochart-3d.iife.min.js is loaded twice; the second copy is ignored.',
    );
    return;
  }
  host.provideLazy3D('mesh', mesh);
  host.provideLazy3D('lines-markers-3d', linesMarkers3D);
  host.provideLazy3D('extrusion', extrusion);
  host.provideLazy3D('view3d', view3d);
  register(...traces3dExports.traces3d);
  for (const [name, value] of Object.entries(traces3dExports)) {
    // A name the main script already has keeps its value.
    if (!(name in hc)) Object.defineProperty(hc, name, { value, enumerable: true });
  }
}

install((globalThis as unknown as { Holochart: Global }).Holochart);
