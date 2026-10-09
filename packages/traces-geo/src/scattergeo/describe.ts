/**
 * Accessible description of `scattergeo` traces (plan E17.1, backlog GEO6): the kind (map scatter,
 * map line, map area), the point count, the extent in longitude and latitude (formatted like the
 * hover labels), and a table of the first points. A trace given by `locations` has them as the
 * first column of the table, before the coordinates they are drawn at.
 */
import {
  accessibleText,
  countText,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { ScattergeoCalc } from './calc.ts';
import { geoLabel } from './hover.ts';
import { hasFlag } from './plot.ts';

/** `'map area'`, `'map line'` or `'map scatter'`. */
export function scattergeoKind(trace: Readonly<Record<string, unknown>>): string {
  if (trace['fill'] === 'toself') return 'map area';
  return hasFlag(trace['mode'], 'lines') ? 'map line' : 'map scatter';
}

/** The `scattergeo` trace's `describe()`. */
export function describeScattergeo(ctx: DescribeContext<ScattergeoCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const kind = scattergeoKind(trace);
  const name = traceNameText(trace['name'], ctx.index);
  const { lon, lat, length: n } = calc;
  const degrees = (v: number): string => {
    const label = geoLabel(ctx.fullLayout, v);
    return label === '' ? '' : `${label}°`;
  };
  let valid = 0;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = lon[i] as number;
    const y = lat[i] as number;
    if (Number.isNaN(x)) continue;
    valid++;
    if (x < west) west = x;
    if (x > east) east = x;
    if (y < south) south = y;
    if (y > north) north = y;
  }
  let summary = `${kind.charAt(0).toUpperCase()}${kind.slice(1)} "${name}": ${countText(n, 'point')}.`;
  if (valid > 1) {
    summary += ` Longitude ${degrees(west)} to ${degrees(east)}, latitude ${degrees(south)} to ${degrees(north)}.`;
  } else if (valid === 1) {
    summary += ` At longitude ${degrees(west)}, latitude ${degrees(south)}.`;
  }
  if (calc.unresolved) summary += ' Its locations are not drawn.';
  else if (valid < n) summary += ` ${countText(n - valid, 'point')} without a position.`;
  const text = trace['text'];
  const hasText = Array.isArray(text);
  const locations = calc.locations?.locations;
  const columns = [...(locations ? ['location'] : []), 'longitude', 'latitude'];
  if (hasText) columns.push('text');
  const row = (i: number): string[] => {
    const cells = [degrees(lon[i] as number), degrees(lat[i] as number)];
    if (locations) cells.unshift(accessibleText(locations[i]));
    if (hasText) cells.push(accessibleText((text as unknown[])[i]));
    return cells;
  };
  const rows: string[][] = [];
  for (let i = 0; i < Math.min(n, ctx.maxRows); i++) rows.push(row(i));
  return { kind, summary, table: { caption: name, columns, rows, total: n, row } };
}
