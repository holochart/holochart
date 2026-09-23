/**
 * Schema-derived property suites (plan E20.2): fuzzed figures generated from the layout, config
 * and fixture trace schemas must never crash defaults/validation/diffing, valid input must
 * validate cleanly, defaults must be a fixed point, and schema JSON must be stable.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { configSchema } from '../config/schema.ts';
import { coerceContainer } from '../defaults/container.ts';
import { supplyDefaults } from '../defaults/supply-defaults.ts';
import type { FigureInput } from '../defaults/types.ts';
import { diffFigures } from '../diff/diff.ts';
import { layoutSchema } from '../layout/schema.ts';
import { plotSchema, schemaToJSON } from '../schema/json.ts';
import type { AttrSpec, ObjectNode } from '../schema/types.ts';
import { forEachAttr } from '../schema/walk.ts';
import { isPlainObject, stripInternal } from '../util/objects.ts';
import type { Issue } from '../validate/issues.ts';
import { validate } from '../validate/validate.ts';
import {
  configArbitrary,
  figureArbitrary,
  invalidValueArbitrary,
  layoutArbitrary,
  schemaNodeArbitrary,
  traceArbitrary,
  type GeneratedFigure,
} from './schema-arbitrary.ts';

const registry = fixtureRegistry();
const quiet = { onIssue: () => {} };
const MODES = ['valid', 'invalid'] as const;

const asFigure = (f: GeneratedFigure): FigureInput => f as FigureInput;
const datasetsOf = (f: GeneratedFigure): FigureInput['datasets'] => asFigure(f).datasets;

/**
 * Freeze plain objects and arrays recursively, so any attempt to mutate the input throws (ES
 * modules run in strict mode). Typed arrays with elements cannot be frozen and are skipped.
 */
function deepFreeze<T>(v: T, seen = new Set<unknown>()): T {
  if ((Array.isArray(v) || isPlainObject(v)) && !seen.has(v)) {
    seen.add(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k], seen);
    Object.freeze(v);
  }
  return v;
}

/**
 * Copy plain objects (to `maxDepth` levels, keeping `__proto__`-style keys as own data) and keep
 * everything else — arrays included — by reference: data arrays are compared by reference, and
 * values deeper than the diff's `MAX_DEPTH` are too.
 */
function copyObjects(v: unknown, depth = 0): unknown {
  if (!isPlainObject(v) || depth > 32) return v;
  const out: Record<string, unknown> = Object.getPrototypeOf(v) === null ? Object.create(null) : {};
  for (const [k, val] of Object.entries(v)) {
    Object.defineProperty(out, k, {
      value: copyObjects(val, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

describe.each(MODES)('supplyDefaults on %s figures', (mode) => {
  const figures = figureArbitrary(registry, { mode });

  it('never throws, never mutates its input, and is deterministic', () => {
    fc.assert(
      fc.property(figures, (fig) => {
        deepFreeze(fig);
        const a = supplyDefaults(asFigure(fig), registry, quiet);
        const b = supplyDefaults(asFigure(fig), registry, quiet);
        expect(stripInternal(b.fullData)).toEqual(stripInternal(a.fullData));
        expect(stripInternal(b.fullLayout)).toEqual(stripInternal(a.fullLayout));
        expect(b.fullConfig).toEqual(a.fullConfig);
        expect(b.issues).toEqual(a.issues);
      }),
      { numRuns: 150 },
    );
  });

  it('is idempotent: the stripped full output is a fixed point', () => {
    fc.assert(
      fc.property(figures, (fig) => {
        const first = supplyDefaults(asFigure(fig), registry, quiet);
        const again = supplyDefaults(
          {
            datasets: datasetsOf(fig),
            data: stripInternal(first.fullData) as unknown[],
            layout: stripInternal(first.fullLayout),
            config: first.fullConfig,
          },
          registry,
          quiet,
        );
        expect(stripInternal(again.fullData)).toEqual(stripInternal(first.fullData));
        expect(stripInternal(again.fullLayout)).toEqual(stripInternal(first.fullLayout));
        expect(again.fullConfig).toEqual(first.fullConfig);
        expect(coerceContainer(configSchema, first.fullConfig)).toEqual(first.fullConfig);
      }),
      { numRuns: 150 },
    );
  });

  it('produces full output that is itself valid input', () => {
    fc.assert(
      fc.property(figures, (fig) => {
        const { fullData, fullLayout, fullConfig } = supplyDefaults(asFigure(fig), registry, quiet);
        const issues = validate(stripInternal(fullData), stripInternal(fullLayout), registry, {
          config: fullConfig,
          datasets: datasetsOf(fig),
        });
        // Unknown trace types are kept (hidden) in fullData, and a template object is passed
        // through as given; everything else in the full output must be valid.
        const unexpected = issues.filter(
          (i) => i.code !== 'unknown-trace-type' && !i.path.startsWith('layout.template'),
        );
        expect(mode === 'valid' ? issues : unexpected).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});

describe('supplyDefaults in strict mode', () => {
  it('throws only ValidationError, and only when there is a non-deprecation issue', () => {
    fc.assert(
      fc.property(figureArbitrary(registry, { mode: 'invalid', allowStrict: true }), (fig) => {
        const issues = validate(fig.data, fig.layout, registry, {
          config: fig.config,
          datasets: datasetsOf(fig),
        });
        const strict = isPlainObject(fig.config) && fig.config['strict'] === true;
        const shouldThrow = strict && issues.some((i) => i.code !== 'deprecated');
        let thrown: unknown;
        try {
          supplyDefaults(asFigure(fig), registry, quiet);
        } catch (e) {
          thrown = e;
        }
        expect(thrown === undefined ? undefined : (thrown as Error).name).toBe(
          shouldThrow ? 'ValidationError' : undefined,
        );
      }),
      { numRuns: 100 },
    );
  });
});

describe('validate', () => {
  it('reports nothing for valid layouts', () => {
    fc.assert(
      fc.property(layoutArbitrary(registry), (layout) => {
        expect(validate(undefined, layout, registry)).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  it('reports nothing for valid configs', () => {
    fc.assert(
      fc.property(configArbitrary({ allowStrict: true }), (config) => {
        expect(validate(undefined, undefined, registry, { config })).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  it.each(registry.traceTypes())('reports nothing for valid %s traces', (type) => {
    fc.assert(
      fc.property(fc.array(traceArbitrary(registry, type), { maxLength: 3 }), (data) => {
        expect(validate(data, undefined, registry)).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });

  it('never throws on invalid figures and reports well-formed issues', () => {
    const codes = new Set([
      'unknown-attribute',
      'invalid-value',
      'out-of-range',
      'invalid-container',
      'unknown-trace-type',
      'unknown-template',
      'deprecated',
    ]);
    fc.assert(
      fc.property(figureArbitrary(registry, { mode: 'invalid', allowStrict: true }), (fig) => {
        deepFreeze(fig);
        const issues: Issue[] = validate(fig.data, fig.layout, registry, {
          config: fig.config,
          datasets: datasetsOf(fig),
        });
        for (const issue of issues) {
          expect(typeof issue.path).toBe('string');
          expect(typeof issue.message).toBe('string');
          expect(codes.has(issue.code)).toBe(true);
          expect(['error', 'warning']).toContain(issue.severity);
        }
      }),
      { numRuns: 200 },
    );
  });

  /** Leaf attributes reachable through plain keys (no item arrays), for targeted injection. */
  function leaves(schema: ObjectNode, skip: ReadonlySet<string>): [readonly string[], AttrSpec][] {
    const out: [readonly string[], AttrSpec][] = [];
    forEachAttr(schema, (path, spec) => {
      if (spec.valType === 'any' || !path.every((s): s is string => typeof s === 'string')) return;
      if (skip.has(path[0] as string)) return;
      out.push([[...path], spec]);
    });
    return out;
  }

  function nest(path: readonly string[], value: unknown): Record<string, unknown> {
    let v = value;
    for (const key of [...path].reverse()) v = { [key]: v };
    return v as Record<string, unknown>;
  }

  const injected = (candidates: [readonly string[], AttrSpec][]) =>
    fc
      .constantFrom(...candidates)
      .chain(([path, spec]) =>
        fc.tuple(fc.constant(path), invalidValueArbitrary(spec) ?? fc.constant(undefined)),
      );

  it('reports an invalid value at exactly the layout path it was injected at', () => {
    const layoutLeaves = leaves(registry.getLayoutSchema(), new Set(['template']));
    fc.assert(
      fc.property(injected(layoutLeaves), ([path, bad]) => {
        const issues = validate(undefined, nest(path, bad), registry);
        const p = `layout.${path.join('.')}`;
        expect(issues.map((i) => [i.path, i.code])).toEqual([[p, 'invalid-value']]);
      }),
      { numRuns: 200 },
    );
  });

  it.each(registry.traceTypes())(
    'reports an invalid value at exactly the %s trace path it was injected at',
    (type) => {
      const schema = registry.getTraceSchema(type) as ObjectNode;
      fc.assert(
        fc.property(injected(leaves(schema, new Set(['type']))), ([path, bad]) => {
          const issues = validate([{ type, ...nest(path, bad) }], undefined, registry);
          const p = `data[0].${path.join('.')}`;
          // Deprecated attributes also get a `deprecated` notice at the same path.
          expect(issues.every((i) => i.path === p)).toBe(true);
          expect(issues.filter((i) => i.code === 'invalid-value')).toHaveLength(1);
        }),
        { numRuns: 100 },
      );
    },
  );
});

describe('diffFigures', () => {
  it.each(MODES)('finds nothing between a %s figure and itself or an object-wise copy', (mode) => {
    fc.assert(
      fc.property(figureArbitrary(registry, { mode }), (fig) => {
        deepFreeze(fig);
        expect(diffFigures(asFigure(fig), asFigure(fig), registry).empty).toBe(true);
        const copy = copyObjects(fig) as GeneratedFigure;
        const d = diffFigures(asFigure(fig), asFigure(copy), registry);
        expect(d.changes).toEqual([]);
        expect(d.empty).toBe(true);
      }),
      { numRuns: 150 },
    );
  });
});

describe('schema JSON', () => {
  const roundTrip = (v: unknown): unknown => JSON.parse(JSON.stringify(v)) as unknown;

  it('schemaToJSON is deterministic and JSON-stable for layout, config and trace schemas', () => {
    const schemas: ObjectNode[] = [
      layoutSchema,
      registry.getLayoutSchema(),
      configSchema,
      ...registry.traceTypes().map((t) => registry.getTraceSchema(t) as ObjectNode),
    ];
    for (const schema of schemas) {
      const json = schemaToJSON(schema);
      expect(schemaToJSON(schema)).toStrictEqual(json);
      expect(roundTrip(json)).toStrictEqual(json);
    }
  });

  it('plotSchema is JSON-stable and identical across fresh registries', () => {
    const doc = plotSchema(fixtureRegistry());
    expect(roundTrip(doc)).toStrictEqual(doc);
    expect(plotSchema(fixtureRegistry())).toStrictEqual(doc);
  });

  it('schemaToJSON of random DSL schemas is deterministic and JSON-stable', () => {
    fc.assert(
      fc.property(schemaNodeArbitrary, (schema) => {
        const json = schemaToJSON(schema);
        expect(schemaToJSON(schema)).toStrictEqual(json);
        expect(roundTrip(json)).toStrictEqual(json);
      }),
      { numRuns: 200 },
    );
  });
});

describe('regressions found by the E20.2 properties', () => {
  const holes = (n: number): unknown[] => new Array<unknown>(n);

  it('supplyDefaults: a hole in a sparse `data` array is a default trace, not a crash', () => {
    // Counterexample: { data: [,], layout: NaN, config: {} } threw
    // "Cannot read properties of undefined (reading '_module')" in supplyCartesianAxes.
    const { fullData, fullLayout } = supplyDefaults({ data: holes(1) }, registry, quiet);
    expect(fullData).toHaveLength(1);
    expect(fullData[0]).toMatchObject({ type: 'scatter', _index: 0 });
    expect(fullLayout._subplots.cartesian).toEqual(['xy']);
  });

  it('diffFigures: a sparse `data` array does not differ from itself', () => {
    // Counterexample: { data: [,] } diffed with itself reported trace 0 as removed.
    const fig = { data: holes(2) };
    const d = diffFigures(fig, fig, registry);
    expect(d.traces.removed).toEqual([]);
    expect(d.empty).toBe(true);
  });

  it('coerceItems: a non-string templateitemname is read as coerced (fixed point)', () => {
    // Counterexample: { layout: { annotations: [{ templateitemname: 0 }] } } was coerced as a
    // plain item holding templateitemname '0', which fed back in became a dangling (hidden) link.
    const fig = { layout: { annotations: [{ templateitemname: 0 }] } };
    expect(validate(undefined, fig.layout, registry)).toEqual([]);
    const first = supplyDefaults(fig, registry, quiet).fullLayout;
    const again = supplyDefaults({ layout: stripInternal(first) }, registry, quiet).fullLayout;
    expect(first['annotations']).toEqual([{ visible: false, templateitemname: '0', _index: 0 }]);
    expect(stripInternal(again)).toEqual(stripInternal(first));
    // …and a numeric reference links to a template item named by the same string.
    const linked = supplyDefaults(
      {
        layout: {
          annotations: [{ templateitemname: 1 }],
          template: { layout: { annotations: [{ name: '1', text: 'T' }] } },
        },
      },
      registry,
      quiet,
    ).fullLayout['annotations'];
    expect(linked).toEqual([expect.objectContaining({ text: 'T', templateitemname: '1' })]);
  });

  it("'@' strings on string attributes are literal text and a fixed point", () => {
    // Counterexample: '@@handle' was unescaped to '@handle', which fed back in was read as a
    // column reference ("column reference '@handle' needs a `dataset`"). Now '@…' strings are
    // references only where they are not valid values, so no escape exists or is needed.
    for (const text of ['@handle', '@@handle']) {
      const first = supplyDefaults({ data: [{ y: [1], mode: 'text', text }] }, registry, quiet);
      expect(first.issues).toEqual([]);
      expect(first.fullData[0]?.['text']).toBe(text);
      const data = stripInternal(first.fullData) as unknown[];
      const again = supplyDefaults({ data }, registry, quiet);
      expect(again.issues).toEqual([]);
      expect(stripInternal(again.fullData)).toEqual(data);
    }
  });

  it("'@' strings from template traces keep the full output valid", () => {
    // Counterexample: a template's text '@literal' was copied into the full trace and then
    // rejected there as a column reference without a `dataset`.
    const fig = {
      data: [{ y: [1], mode: 'text' }],
      layout: { template: { data: { scatter: [{ text: '@literal' }] } } },
    };
    expect(validate(fig.data, fig.layout, registry)).toEqual([]);
    const { fullData } = supplyDefaults(fig, registry, quiet);
    expect(fullData[0]?.['text']).toBe('@literal');
    expect(validate(stripInternal(fullData), undefined, registry)).toEqual([]);
  });

  it('resolved column references and literal text survive a round trip together', () => {
    const date = ['2024-01-01', '2024-01-02'];
    const region = ['north', 'south'];
    const datasets = { sales: { date, region, rev: [1, 2] } };
    const fig: FigureInput = {
      datasets,
      data: [
        {
          dataset: 'sales',
          x: '@date',
          y: '@rev',
          mode: 'markers+text',
          text: '@region', // a string attribute: literal text, not the column
          marker: { color: '@region' },
        },
      ],
      layout: { template: { data: { scatter: [{ text: '@ignored', marker: { size: 9 } }] } } },
    };
    expect(validate(fig.data, fig.layout, registry, { datasets })).toEqual([]);
    const first = supplyDefaults(fig, registry, quiet);
    expect(first.issues).toEqual([]);
    const trace = first.fullData[0] as Record<string, unknown>;
    expect(trace['x']).toBe(date);
    expect(trace['text']).toBe('@region');
    expect((trace['marker'] as Record<string, unknown>)['color']).toBe(region);
    const data = stripInternal(first.fullData) as unknown[];
    const layout = stripInternal(first.fullLayout);
    expect(validate(data, layout, registry, { datasets })).toEqual([]);
    const again = supplyDefaults({ datasets, data, layout }, registry, quiet);
    expect(stripInternal(again.fullData)).toEqual(data);
    expect(
      diffFigures({ datasets, data }, { datasets, data: copyObjects(data) as unknown[] }, registry)
        .empty,
    ).toBe(true);
  });
});
