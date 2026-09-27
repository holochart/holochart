/**
 * Where a polar trace draws (plan E11.4): its subplot's `domain` (the runtime's `subplotDomain`
 * hook, which places polar traces like domain traces, in the overlay).
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import { subplotOf } from './layout-defaults.ts';

function extent(v: unknown): [number, number] | undefined {
  return Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
    ? [v[0], v[1]]
    : undefined;
}

export function polarSubplotDomain(
  trace: FullTrace,
  fullLayout: FullLayout,
): { x: [number, number]; y: [number, number] } | undefined {
  const polar = fullLayout?.[subplotOf(trace)] as
    { domain?: { x?: unknown; y?: unknown } } | undefined;
  const d = polar?.domain;
  if (!d) return undefined;
  return { x: extent(d.x) ?? [0, 1], y: extent(d.y) ?? [0, 1] };
}
