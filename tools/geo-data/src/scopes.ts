/**
 * Which scopes a lake or a river belongs to. The package ships one world topology per resolution
 * and the loader derives Plotly's `scope` maps from it, so each country carries its continent and
 * each lake and river the continents (and `us`, for the `usa` scope) it lies in. Plotly's files
 * clip these layers to the scope's countries instead (sane-topojson, `scopeWith: 'src'`); rivers
 * are cut the same way here, at the border, and lakes are kept whole.
 */
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { CONTINENT_CODES, USA_ADM0, USA_CODE } from './config.ts';
import { planarContains, polygonsOf } from './geometry.ts';

/** The scope codes of the country at a position, space-separated (`'na us'`), `''` for none. */
export type Locate = (position: Position) => string;

/** The scope codes of a country: its continent, and `us` for the United States. */
export function countryCodes(properties: Record<string, unknown>): string {
  const continent = CONTINENT_CODES[String(properties['CONTINENT'])];
  const codes = continent ? [continent] : [];
  if (properties['ADM0_A3'] === USA_ADM0) codes.push(USA_CODE);
  return codes.join(' ');
}

/**
 * A lookup from a position to the scope codes of the country it is in. Positions at sea, and in
 * countries of no continent, give `''`. `countries` are Natural Earth's own features, before
 * stitching: cut at the antimeridian, so a test in the plane is right for them.
 */
export function countryLocator(countries: readonly Feature[]): Locate {
  interface Part {
    codes: string;
    polygon: Position[][];
    box: [number, number, number, number];
  }
  const parts: Part[] = [];
  for (const country of countries) {
    const codes = countryCodes(country.properties ?? {});
    const geometry = country.geometry as Polygon | MultiPolygon | null;
    if (!codes || !geometry) continue;
    for (const polygon of polygonsOf(geometry)) {
      const box: Part['box'] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x = 0, y = 0] of polygon[0] ?? []) {
        if (x < box[0]) box[0] = x;
        if (y < box[1]) box[1] = y;
        if (x > box[2]) box[2] = x;
        if (y > box[3]) box[3] = y;
      }
      parts.push({ codes, polygon, box });
    }
  }
  // Consecutive lookups are neighbours along a line: try the part that answered last first.
  let last: Part | undefined;
  const hit = (part: Part, position: Position): boolean => {
    const [x = 0, y = 0] = position;
    const [x0, y0, x1, y1] = part.box;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1 && planarContains(part.polygon, x, y);
  };
  return (position) => {
    if (last && hit(last, position)) return last.codes;
    for (const part of parts) {
      if (part !== last && hit(part, position)) {
        last = part;
        return part.codes;
      }
    }
    return '';
  };
}

/** A stretch of a line with the scope codes it lies in. */
export interface ScopedLine {
  codes: string;
  line: Position[];
}

/** Where on the segment `a`–`b` the codes change from those of `a`, by bisection. */
function crossing(a: Position, b: Position, codesAtA: string, locate: Locate): Position {
  let lo = a;
  let hi = b;
  for (let step = 0; step < 24; step++) {
    const mid: Position = [((lo[0] ?? 0) + (hi[0] ?? 0)) / 2, ((lo[1] ?? 0) + (hi[1] ?? 0)) / 2];
    // The sea between two coasts belongs to neither side; it stays with the side the line left.
    const codes = locate(mid);
    if (codes === codesAtA || codes === '') lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * `line` cut where it passes from one set of scope codes to another, so a river that crosses a
 * border is two stretches meeting on it. Vertices in no country (a river mouth just off a
 * generalized coast) stay with the stretch they follow.
 */
export function splitByScope(line: Position[], locate: Locate): ScopedLine[] {
  const located = line.map(locate);
  // Fill the vertices at sea from their neighbours: forward, then backward for a leading run.
  for (let i = 1; i < located.length; i++) if (!located[i]) located[i] = located[i - 1] ?? '';
  for (let i = located.length - 2; i >= 0; i--) if (!located[i]) located[i] = located[i + 1] ?? '';

  const out: ScopedLine[] = [];
  let current: Position[] = [];
  for (let i = 0; i < line.length; i++) {
    const position = line[i] as Position;
    const codes = located[i] ?? '';
    const before = located[i - 1];
    if (i > 0 && before !== undefined && before !== codes) {
      const cut = crossing(line[i - 1] as Position, position, before, locate);
      current.push(cut);
      out.push({ codes: before, line: current });
      current = [cut];
    }
    current.push(position);
  }
  if (current.length > 1) out.push({ codes: located[located.length - 1] ?? '', line: current });
  return out;
}

/**
 * The scope codes of every country `polygon`'s outline touches, sorted and space-separated: a
 * lake on a border belongs to both sides.
 */
export function polygonCodes(polygon: Position[][], locate: Locate): string {
  const codes = new Set<string>();
  for (const position of polygon[0] ?? []) {
    for (const code of locate(position).split(' ')) if (code) codes.add(code);
  }
  return [...codes].sort().join(' ');
}
