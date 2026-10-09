/**
 * Where a geo subplot is (backlog GEO2): its `domain` on the plot area. Geo traces are placed by
 * their subplot's container (the runtime's `subplotDomain` hook, like polar traces and 3D
 * scenes), and the subplot's component and view need the same rect in px.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import { domainRect } from '@mk7s/holochart-runtime';
import { geoOf } from './layout-defaults.ts';

function extent(v: unknown): [number, number] | undefined {
  return Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
    ? [v[0], v[1]]
    : undefined;
}

function domainOf(
  fullLayout: FullLayout | undefined,
  id: string,
): { x: [number, number]; y: [number, number] } | undefined {
  const geo = fullLayout?.[id] as { domain?: { x?: unknown; y?: unknown } } | undefined;
  const d = geo?.domain;
  if (!d) return undefined;
  return { x: extent(d.x) ?? [0, 1], y: extent(d.y) ?? [0, 1] };
}

/** The domain a geo trace draws in: its subplot's (the runtime's `subplotDomain` hook). */
export function geoSubplotDomain(
  trace: FullTrace,
  fullLayout: FullLayout,
): { x: [number, number]; y: [number, number] } | undefined {
  return domainOf(fullLayout, geoOf(trace));
}

/**
 * The rect of geo subplot `id` in container px (top-left origin): its domain on the plot area,
 * the same rect the runtime gives the subplot's traces as `DomainInfo.rect`. `undefined` when the
 * layout has no such subplot.
 */
export function geoSubplotRect(
  fullLayout: FullLayout | undefined,
  id: string,
  plotArea: Readonly<ViewportRect>,
): ViewportRect | undefined {
  const d = domainOf(fullLayout, id);
  return d && domainRect(plotArea, d.x, d.y);
}
