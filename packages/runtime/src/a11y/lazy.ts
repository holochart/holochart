/**
 * Trace modules' lazily loaded accessibility parts (`TraceModule.a11y`, backlog S2.14): keyboard
 * stops, descriptions and view keys that load on first use, once per loader (a package's modules
 * share one), whatever chart asks first.
 */
import type { TraceA11y, TraceA11yParts, TraceModule } from '../contracts.ts';

const loaded = new WeakMap<object, TraceA11yParts | Promise<unknown>>();

/**
 * The loaded parts of `module` (those of its type, else the chunk's `'*'` parts): `undefined`
 * when it has none, or a promise while they load (it
 * settles either way; a failed load leaves the module without parts).
 */
export function a11yParts(
  module: Pick<TraceModule, 'a11y' | 'type'> | undefined,
): TraceA11y | Promise<unknown> | undefined {
  const load = module?.a11y;
  if (!load) return undefined;
  let parts = loaded.get(load);
  if (!parts) {
    loaded.set(
      load,
      (parts = load().then(
        (p) => loaded.set(load, p),
        (error: unknown) => {
          loaded.set(load, {});
          console.warn("holochart: loading a trace's accessibility code failed", error);
        },
      )),
    );
  }
  return parts instanceof Promise ? parts : (parts[module.type] ?? parts['*']);
}
