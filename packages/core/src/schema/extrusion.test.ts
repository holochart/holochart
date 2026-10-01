import { describe, expect, it } from 'vitest';
import { bar, gauge, scatter } from '../__fixtures__/modules.ts';
import { supplyDefaults } from '../defaults/supply-defaults.ts';
import { createRegistry } from '../registry/registry.ts';
import { validate } from '../validate/validate.ts';
import {
  extrusionAttributes,
  LIT_MATERIAL_TYPES,
  litMaterialAttributes,
  withExtrusion,
} from './extrusion.ts';

/**
 * Extrusion attributes (plan E8.9, E9.10): declared once, added to a module with `withExtrusion`
 * (or a spread), defaulted only as far as the trace is extruded.
 */

const quiet = { onIssue: () => {} };

function registry() {
  return createRegistry().register(withExtrusion(bar), scatter, gauge);
}

describe('withExtrusion', () => {
  it('adds depth, bevel and material to the schema, keeping the module otherwise', () => {
    const extruded = withExtrusion(bar);
    expect(extruded.type).toBe('bar');
    expect(extruded.calc).toBe(bar.calc);
    expect(Object.keys(extruded.schema.children)).toEqual([
      ...Object.keys(bar.schema.children),
      'depth',
      'bevel',
      'material',
    ]);
    expect(extruded.schema.description).toBe(bar.schema.description);
    // The module itself is untouched.
    expect(Object.keys(bar.schema.children)).not.toContain('depth');
  });

  it('defaults depth to 0 (flat) and skips bevel and material then', () => {
    const { fullData } = supplyDefaults({ data: [{ type: 'bar', y: [1, 2] }] }, registry(), quiet);
    const t = fullData[0]!;
    expect(t['depth']).toBe(0);
    expect(t['bevel']).toBeUndefined();
    expect(t['material']).toBeUndefined();
    for (const depth of ['0', '0%']) {
      const r = supplyDefaults({ data: [{ type: 'bar', y: [1], depth }] }, registry(), quiet);
      expect(r.fullData[0]!['bevel']).toBeUndefined();
    }
  });

  it('defaults bevel and material of extruded traces, and keeps depth as given', () => {
    const { fullData } = supplyDefaults(
      {
        data: [
          { type: 'bar', y: [1, 2], depth: '60%' },
          { type: 'bar', y: [1, 2], depth: 12, bevel: { size: 3 }, material: { type: 'toon' } },
          { type: 'bar', y: [1, 2], depth: [4, 8] },
        ],
      },
      registry(),
      quiet,
    );
    expect(fullData[0]!['depth']).toBe('60%');
    expect(fullData[0]!['bevel']).toEqual({ size: 0, segments: 3 });
    expect(fullData[0]!['material']).toMatchObject({ type: 'plotly', steps: 3, castshadow: false });
    expect(fullData[1]!['bevel']).toEqual({ size: 3, segments: 3 });
    expect(fullData[1]!['material']).toMatchObject({ type: 'toon' });
    expect(fullData[2]!['depth']).toEqual([4, 8]);
  });

  it('validates the new attributes like any other', () => {
    const issues = validate(
      [{ type: 'bar', y: [1], depth: 5, bevel: { segments: 40 }, material: { type: 'wood' } }],
      {},
      registry(),
    );
    const paths = issues.map((i) => i.path);
    expect(paths).toContain('data[0].bevel.segments');
    expect(paths).toContain('data[0].material.type');
    // Unknown on a module without them.
    expect(
      validate([{ type: 'bar', y: [1], depth: 5 }], {}, createRegistry().register(bar)),
    ).not.toEqual([]);
  });
});

describe('litMaterialAttributes', () => {
  it('declares the E8.7 material types and three.js parameters', () => {
    const m = litMaterialAttributes('Material.');
    expect(m.description).toBe('Material.');
    expect(m.children.type.values).toEqual(LIT_MATERIAL_TYPES);
    expect(Object.keys(m.children)).toEqual(
      expect.arrayContaining(['roughness', 'metalness', 'emissive', 'steps', 'matcap']),
    );
    expect(extrusionAttributes.material.children.type.dflt).toBe('plotly');
  });
});
