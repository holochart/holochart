import * as d3Geo from 'd3-geo';
import * as d3GeoProjection from 'd3-geo-projection';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  D3_GEO_PROJECTION_PROJECTIONS,
  D3_GEO_PROJECTIONS,
  FITBOUNDS_INCOMPATIBLE,
  LATAXIS_SPAN,
  LONAXIS_SPAN,
  PROJECTION_TYPES,
  type ExtraProjectionType,
} from './constants.ts';
import {
  createProjection,
  GLOBE_PROJECTION,
  isAlbersUsaProjection,
  isBuiltinProjection,
  isClippedProjection,
  isConicProjection,
  isExtraProjection,
  isGlobeProjection,
  isProjectionReady,
  isProjectionType,
  isSatelliteProjection,
  loadProjection,
  projectionClipAngle,
} from './projections.ts';
import { EXTRA_PROJECTIONS } from './projections-extra.ts';

const builtin = Object.keys(D3_GEO_PROJECTIONS);
const extra = Object.keys(D3_GEO_PROJECTION_PROJECTIONS) as ExtraProjectionType[];

/** A point every projection draws: inside the contiguous states for Albers USA. */
const SEEN: [number, number] = [-98, 39];

describe('the projection tables', () => {
  it("are Plotly's 82 types: 15 of d3-geo and 67 of d3-geo-projection, with two aliases", () => {
    expect(new Set(Object.values(D3_GEO_PROJECTIONS)).size).toBe(15);
    expect(new Set(Object.values(D3_GEO_PROJECTION_PROJECTIONS)).size).toBe(67);
    expect(builtin.filter((type) => extra.includes(type as ExtraProjectionType))).toEqual([]);
    // The schema's enumeration is those and the globe, which is in neither of Plotly's tables.
    expect(PROJECTION_TYPES).toHaveLength(builtin.length + extra.length + 1);
    expect([...PROJECTION_TYPES]).toEqual([...builtin, ...extra, GLOBE_PROJECTION].sort());
    expect(builtin).not.toContain(GLOBE_PROJECTION);
    expect(extra).not.toContain(GLOBE_PROJECTION);
  });

  it('name a factory that the installed d3-geo has, and it is the one built', () => {
    const d3 = d3Geo as unknown as Record<string, unknown>;
    for (const [type, name] of Object.entries(D3_GEO_PROJECTIONS)) {
      expect(typeof d3[name], `d3-geo.${name}`).toBe('function');
      expect(isBuiltinProjection(type), type).toBe(true);
      const made = createProjection(type);
      const reference = (d3[name] as () => d3Geo.GeoProjection)();
      expect(made, type).toBeDefined();
      expect(made!(SEEN), type).toEqual(reference(SEEN));
    }
  });

  it('name a factory that the installed d3-geo-projection has, and the chunk holds it', () => {
    const d3 = d3GeoProjection as unknown as Record<string, unknown>;
    for (const [type, name] of Object.entries(D3_GEO_PROJECTION_PROJECTIONS)) {
      expect(typeof d3[name], `d3-geo-projection.${name}`).toBe('function');
      expect(EXTRA_PROJECTIONS[type as ExtraProjectionType], type).toBe(d3[name]);
    }
    expect(Object.keys(EXTRA_PROJECTIONS).sort()).toEqual([...extra].sort());
  });

  it('tell the types apart', () => {
    expect(isBuiltinProjection('mercator')).toBe(true);
    expect(isExtraProjection('mercator')).toBe(false);
    expect(isExtraProjection('robinson')).toBe(true);
    expect(isProjectionType('winkel tripel')).toBe(true);
    expect(isGlobeProjection('globe3d')).toBe(true);
    expect(isGlobeProjection('orthographic')).toBe(false);
    expect(isProjectionType('globe3d')).toBe(true);
    // Holochart's own type is not one of the tables ported from Plotly.
    expect(isBuiltinProjection('globe3d')).toBe(false);
    expect(isExtraProjection('globe3d')).toBe(false);
    // Names every object has must not pass for a projection.
    for (const name of ['constructor', 'toString', '__proto__', '*', '']) {
      expect(isProjectionType(name), name).toBe(false);
      expect(createProjection(name), name).toBeUndefined();
      expect(isProjectionReady(name), name).toBe(false);
    }
  });
});

describe("the globe ('globe3d', ADR-028)", () => {
  it('is the orthographic projection, always ready', async () => {
    expect(GLOBE_PROJECTION).toBe('globe3d');
    expect(isProjectionReady('globe3d')).toBe(true);
    const made = createProjection('globe3d');
    const reference = d3Geo.geoOrthographic();
    expect(made).toBeDefined();
    expect(createProjection('globe3d')).not.toBe(made);
    for (const point of [SEEN, [0, 0], [120, -40]] as [number, number][]) {
      expect(made!(point)).toEqual(reference(point));
    }
    expect(made!.clipAngle()).toBe(reference.clipAngle());
    const loaded = await loadProjection('globe3d');
    expect(loaded(SEEN)).toEqual(reference(SEEN));
    // No chunk was needed for it.
    expect(isProjectionReady('robinson')).toBe(false);
  });

  it('has the flags, spans, clip angle and fit of the orthographic projection', () => {
    expect(isClippedProjection('globe3d')).toBe(true);
    expect(projectionClipAngle('globe3d')).toBe(projectionClipAngle('orthographic'));
    expect(LONAXIS_SPAN['globe3d']).toBe(LONAXIS_SPAN['orthographic']);
    expect(LATAXIS_SPAN['globe3d']).toBe(LATAXIS_SPAN['orthographic']);
    expect(FITBOUNDS_INCOMPATIBLE.has('globe3d')).toBe(FITBOUNDS_INCOMPATIBLE.has('orthographic'));
    expect(isConicProjection('globe3d')).toBe(false);
    expect(isAlbersUsaProjection('globe3d')).toBe(false);
    expect(isSatelliteProjection('globe3d')).toBe(false);
  });
});

// These run in order: the chunk loads once per module instance.
describe('the lazy chunk', () => {
  it('is not loaded until a figure asks for one of its projections', () => {
    expect(isProjectionReady('equirectangular')).toBe(true);
    expect(isProjectionReady('robinson')).toBe(false);
    expect(createProjection('robinson')).toBeUndefined();
  });

  it('resolves at once for a d3-geo projection, without loading the chunk', async () => {
    const projection = await loadProjection('orthographic');
    expect(projection([0, 0])).toEqual(d3Geo.geoOrthographic()([0, 0]));
    expect(isProjectionReady('robinson')).toBe(false);
  });

  it('loads on demand and yields a working projection', async () => {
    const projection = await loadProjection('robinson');
    const reference = d3GeoProjection.geoRobinson();
    expect(projection([30, 40])).toEqual(reference([30, 40]));
    const back = projection.invert!(projection([30, 40])!)!;
    expect(back[0]).toBeCloseTo(30, 6);
    expect(back[1]).toBeCloseTo(40, 6);
  });

  it('makes all 67 ready together, each a new projection every time', () => {
    for (const type of extra) {
      expect(isProjectionReady(type), type).toBe(true);
      const a = createProjection(type);
      const b = createProjection(type);
      expect(a, type).toBeDefined();
      expect(a, type).not.toBe(b);
      expect(typeof a!.stream, type).toBe('function');
    }
  });

  it('rejects for a type that is not one of Plotly’s, naming it', async () => {
    await expect(loadProjection('armadillo')).rejects.toThrow(/'armadillo'/);
  });

  it('draws a finite pixel for a visible point in every type', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PROJECTION_TYPES), (type) => {
        const px = createProjection(type)!(SEEN);
        expect(px, type).not.toBeNull();
        expect(Number.isFinite(px![0] + px![1]), type).toBe(true);
      }),
    );
  });
});

describe('a failed chunk load', () => {
  afterEach(() => {
    vi.doUnmock('./projections-extra.ts');
    vi.resetModules();
  });

  it('rejects with an error that names the projection, and is tried again the next time', async () => {
    vi.resetModules();
    vi.doMock('./projections-extra.ts', () => {
      throw new Error('offline');
    });
    const fresh = await import('./projections.ts');

    await expect(fresh.loadProjection('robinson')).rejects.toThrow(/'robinson'/);
    const error = await fresh.loadProjection('mollweide').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("'mollweide'");
    expect((error as Error).cause).toBeDefined();
    expect(fresh.isProjectionReady('robinson')).toBe(false);
    expect(fresh.createProjection('robinson')).toBeUndefined();
    // The projections of d3-geo do not depend on the chunk.
    await expect(fresh.loadProjection('mercator')).resolves.toBeTypeOf('function');

    // The failure was not cached: once the chunk can load, the same module instance loads it.
    vi.doUnmock('./projections-extra.ts');
    const projection = await fresh.loadProjection('robinson');
    expect(projection([0, 0])).toEqual(d3GeoProjection.geoRobinson()([0, 0]));
    expect(fresh.isProjectionReady('mollweide')).toBe(true);
  });
});

describe("Plotly's flags of a type", () => {
  it('follow layout_defaults.js', () => {
    expect(isAlbersUsaProjection('albers usa')).toBe(true);
    expect(isAlbersUsaProjection('albers')).toBe(false);
    expect(isSatelliteProjection('satellite')).toBe(true);
    expect(PROJECTION_TYPES.filter(isConicProjection)).toEqual([
      'albers',
      'conic conformal',
      'conic equal area',
      'conic equidistant',
      'polyconic',
      'rectangular polyconic',
    ]);
    expect(PROJECTION_TYPES.filter(isClippedProjection).sort()).toEqual(
      Object.keys(LONAXIS_SPAN)
        .filter((type) => type !== '*')
        .sort(),
    );
    expect(isClippedProjection('*')).toBe(false);
    expect(isClippedProjection('mercator')).toBe(false);
  });

  it('give the clip angle Plotly sets, before its pad', () => {
    expect(projectionClipAngle('orthographic')).toBe(90);
    expect(projectionClipAngle('globe3d')).toBe(90);
    expect(projectionClipAngle('gnomonic')).toBe(80);
    expect(projectionClipAngle('azimuthal equal area')).toBe(180);
    expect(projectionClipAngle('conic conformal')).toBe(90);
    expect(projectionClipAngle('mercator')).toBeNull();
    // Airy clips at 147° on its own; Plotly does not set that.
    expect(projectionClipAngle('airy')).toBeNull();
    expect(projectionClipAngle('satellite', 2)).toBeCloseTo(60, 10);
    // At the surface, or with no distance, there is no horizon to clip to.
    expect(projectionClipAngle('satellite', 1)).toBeNull();
    expect(projectionClipAngle('satellite')).toBeNull();
  });
});
