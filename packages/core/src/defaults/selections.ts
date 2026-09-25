/**
 * `layout.selections[]` defaults that depend on other values (plan E5.12; plotly.js
 * `components/selections/defaults.js`): `type` → `path` when `path` is set, else `rect`; a `rect`
 * drops `path`. `line.color` stays unset (drawn in a color contrasting with `plot_bgcolor`), and a
 * `rect` missing one of `x0`, `x1`, `y0`, `y1` stays incomplete (it selects nothing). An empty
 * list is removed from the full layout, so figures without selections default as before.
 * Idempotent.
 */
import type { FullLayout } from './types.ts';

export function supplySelectionDefaults(fullLayout: FullLayout): void {
  const out = fullLayout as unknown as Record<string, unknown>;
  const list = out['selections'];
  if (!Array.isArray(list)) return;
  if (list.length === 0) {
    delete out['selections'];
    return;
  }
  for (const s of list as Record<string, unknown>[]) {
    const path = s['path'];
    s['type'] ??= typeof path === 'string' && path.trim() !== '' ? 'path' : 'rect';
    if (s['type'] !== 'path') delete s['path'];
  }
}
