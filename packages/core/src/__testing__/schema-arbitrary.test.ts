import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { coerceValue } from '../coerce/coerce.ts';
import { configSchema } from '../config/schema.ts';
import { createRegistry } from '../registry/registry.ts';
import { VAL_TYPES } from '../schema/types.ts';
import type { ObjectNode } from '../schema/types.ts';
import { validate } from '../validate/validate.ts';
import {
  attrSpecArbitrary,
  configArbitrary,
  figureArbitrary,
  invalidValueArbitrary,
  layoutArbitrary,
  schemaArbitrary,
  schemaNodeArbitrary,
  validValueArbitrary,
} from './schema-arbitrary.ts';

/** A registry whose layout gains one extra attribute, `root`, declared by `schema`. */
function registryWith(schema: ObjectNode) {
  return createRegistry().registerComponent({ name: 'test', layoutSchema: { root: schema } });
}

describe('schema-arbitrary helper', () => {
  it('attrSpecArbitrary covers every valType', () => {
    const seen = new Set(
      fc.sample(attrSpecArbitrary, { numRuns: 400, seed: 1 }).map((s) => s.valType),
    );
    expect([...seen].sort()).toEqual([...VAL_TYPES].sort());
  });

  it('valid values coerce for any attribute spec', () => {
    fc.assert(
      fc.property(
        attrSpecArbitrary.chain((spec) => fc.tuple(fc.constant(spec), validValueArbitrary(spec))),
        ([spec, v]) => {
          expect(v).not.toBeNull();
          expect(v).not.toBeUndefined();
          expect(coerceValue(spec, v).ok).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('invalid values are rejected by coercion (and only `any` has none)', () => {
    expect(invalidValueArbitrary({ kind: 'attr', valType: 'any' })).toBeUndefined();
    fc.assert(
      fc.property(
        attrSpecArbitrary
          .filter((spec) => spec.valType !== 'any')
          .chain((spec) =>
            fc.tuple(fc.constant(spec), invalidValueArbitrary(spec) ?? fc.constant(0)),
          ),
        ([spec, v]) => {
          expect(v === undefined || v === null).toBe(false);
          expect(coerceValue(spec, v).ok).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('valid trees of random schemas validate cleanly', () => {
    fc.assert(
      fc.property(
        schemaNodeArbitrary.chain((schema) =>
          fc.tuple(fc.constant(schema), schemaArbitrary(schema, { maxDepth: 3 })),
        ),
        ([schema, value]) => {
          expect(validate(undefined, { root: value }, registryWith(schema))).toEqual([]);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('invalid mode produces unknown keys, wrong shapes and bad values', () => {
    const registry = fixtureRegistry();
    const codes = new Set<string>();
    for (const layout of fc.sample(layoutArbitrary(registry, { mode: 'invalid' }), {
      numRuns: 150,
      seed: 2,
    })) {
      for (const issue of validate(undefined, layout, registry)) codes.add(issue.code);
    }
    for (const config of fc.sample(configArbitrary({ mode: 'invalid' }), {
      numRuns: 50,
      seed: 3,
    })) {
      for (const issue of validate(undefined, undefined, registry, { config }))
        codes.add(issue.code);
    }
    expect(codes).toEqual(
      new Set([
        'unknown-attribute',
        'invalid-value',
        'invalid-container',
        'unknown-template',
        'deprecated',
      ]),
    );
  });

  it('valid mode is sparse and generates subplot families and templates', () => {
    const registry = fixtureRegistry();
    const layouts = fc.sample(layoutArbitrary(registry), { numRuns: 200, seed: 4 }) as Record<
      string,
      unknown
    >[];
    expect(layouts.some((l) => 'width' in l)).toBe(true);
    expect(layouts.some((l) => !('width' in l))).toBe(true);
    expect(layouts.some((l) => 'xaxis2' in l || 'yaxis11' in l)).toBe(true);
    expect(layouts.some((l) => typeof l['template'] === 'object' && l['template'] !== null)).toBe(
      true,
    );
    const figures = fc.sample(figureArbitrary(registry), { numRuns: 100, seed: 5 });
    const types = new Set(
      figures.flatMap((f) => (f.data as { type: string }[]).map((t) => t.type)),
    );
    expect(types).toEqual(new Set(registry.traceTypes()));
  });

  it('never generates config.strict: true unless allowed', () => {
    const strict = (c: unknown) => (c as { strict?: unknown } | null)?.strict === true;
    expect(fc.sample(configArbitrary(), { numRuns: 200, seed: 6 }).some(strict)).toBe(false);
    expect(
      fc.sample(configArbitrary({ allowStrict: true }), { numRuns: 200, seed: 6 }).some(strict),
    ).toBe(true);
  });

  it('respects overrides (null omits a key, an arbitrary replaces it)', () => {
    const values = fc.sample(
      schemaArbitrary(configSchema, {
        override: (path) =>
          path === 'locale' ? fc.constant('fr-FR') : path === 'responsive' ? null : undefined,
      }),
      { numRuns: 100, seed: 7 },
    ) as Record<string, unknown>[];
    expect(values.some((v) => 'responsive' in v)).toBe(false);
    expect(values.every((v) => !('locale' in v) || v['locale'] === 'fr-FR')).toBe(true);
    expect(values.some((v) => v['locale'] === 'fr-FR')).toBe(true);
  });

  it('valid figures reference dataset columns and hold literal @-strings', () => {
    const registry = fixtureRegistry();
    const figs = fc.sample(figureArbitrary(registry), { numRuns: 300, seed: 8 });
    const traces = figs.flatMap((f) => f.data as Record<string, unknown>[]);
    const refs = traces.filter(
      (t) => t['dataset'] === 'ds' && typeof t['x'] === 'string' && t['x'].startsWith('@'),
    );
    expect(refs.length).toBeGreaterThan(0);
    const texts = traces.map((t) => t['text']);
    expect(texts.some((t) => typeof t === 'string' && t.startsWith('@'))).toBe(true);
    expect(texts.some((t) => typeof t === 'string' && t.startsWith('@@'))).toBe(true);
    for (const f of figs) {
      const issues = validate(f.data, f.layout, registry, {
        config: f.config,
        datasets: f.datasets as never,
      });
      expect(issues).toEqual([]);
    }
  });
});
