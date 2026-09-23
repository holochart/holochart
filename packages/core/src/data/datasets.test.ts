import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { attrSpecArbitrary } from '../__testing__/schema-arbitrary.ts';
import { coerceValue } from '../coerce/coerce.ts';
import { attr } from '../schema/attr.ts';
import type { AttrSpec, ObjectNode } from '../schema/types.ts';
import { getNodeAtPath } from '../schema/walk.ts';
import { isColumnRef, resolveDataRefs } from './datasets.ts';

const registry = fixtureRegistry();
const scatter = registry.getTraceSchema('scatter') as ObjectNode;

const date = ['2024-01-01', '2024-01-02'];
const revenue = new Float64Array([10, 20]);
const region = ['north', 'south'];
const datasets = { sales: { date, revenue, region, total: 30 } };

describe('isColumnRef', () => {
  const spec = (path: string) => getNodeAtPath(scatter, path) as AttrSpec;

  it('is true for any @-string on a data_array attribute', () => {
    for (const v of ['@x', '@', '@@x', '@ spaced']) expect(isColumnRef(v, spec('x'))).toBe(true);
  });

  it('is true on arrayOk attributes only where the string is not a valid value', () => {
    expect(isColumnRef('@region', spec('marker.color'))).toBe(true);
    expect(isColumnRef('@pop', spec('marker.size'))).toBe(true);
    expect(isColumnRef('@shape', spec('marker.symbol'))).toBe(true);
    // Strings are text there, as in Plotly.
    expect(isColumnRef('@handle', spec('text'))).toBe(false);
    expect(isColumnRef('@@handle', spec('text'))).toBe(false);
  });

  it('is false for non-array attributes, plain strings and non-strings', () => {
    expect(isColumnRef('@date', spec('name'))).toBe(false);
    expect(isColumnRef('@date', spec('line.color'))).toBe(false);
    expect(isColumnRef('x', spec('x'))).toBe(false);
    expect(isColumnRef(1, spec('x'))).toBe(false);
    expect(isColumnRef(['@x'], spec('x'))).toBe(false);
  });

  it('never calls a valid value of the attribute a reference', () => {
    fc.assert(
      fc.property(attrSpecArbitrary, fc.string({ maxLength: 6 }), (s, rest) => {
        const v = `@${rest}`;
        if (isColumnRef(v, s)) expect(coerceValue(s, v).ok).toBe(false);
      }),
    );
  });
});

describe('resolveDataRefs', () => {
  it('replaces column references by reference, including nested attributes', () => {
    const trace = {
      type: 'scatter',
      dataset: 'sales',
      x: '@date',
      y: '@revenue',
      marker: { color: '@region', symbol: 'square' },
      line: { width: 3 },
    };
    const { trace: out, issues } = resolveDataRefs(trace, scatter, datasets, 'data[0]');
    expect(issues).toEqual([]);
    expect(out['x']).toBe(date);
    expect(out['y']).toBe(revenue);
    const marker = out['marker'] as Record<string, unknown>;
    expect(marker['color']).toBe(region);
    expect(marker['symbol']).toBe('square');
    // Structural sharing: untouched containers are reused, changed ones are copies.
    expect(out['line']).toBe(trace.line);
    expect(marker).not.toBe(trace.marker);
    // Input untouched.
    expect(trace.x).toBe('@date');
    expect(trace.marker.color).toBe('@region');
  });

  it('returns the same trace object when nothing needs resolving', () => {
    const plain = { type: 'scatter', x: [1, 2], y: revenue, marker: { color: 'red' } };
    const r1 = resolveDataRefs(plain, scatter, datasets, 'data[0]');
    expect(r1.trace).toBe(plain);
    expect(r1.issues).toEqual([]);
    const withDataset = { type: 'scatter', dataset: 'sales', x: [1] };
    expect(resolveDataRefs(withDataset, scatter, datasets, 'data[0]').trace).toBe(withDataset);
  });

  it("leaves '@' strings alone on attributes that do not take arrays or are unknown", () => {
    const trace = { dataset: 'sales', name: '@date', line: { color: '@date' }, custom: '@date' };
    const r = resolveDataRefs(trace, scatter, datasets, 'data[0]');
    expect(r.trace).toBe(trace);
    expect(r.issues).toEqual([]);
  });

  it("keeps '@' strings that are valid values as literals, with or without a dataset", () => {
    for (const trace of [
      { text: '@@home', name: '@home' },
      { dataset: 'sales', text: '@date', marker: { color: 'red' } },
    ]) {
      const r = resolveDataRefs(trace, scatter, datasets, 'data[0]');
      expect(r.trace).toBe(trace);
      expect(r.issues).toEqual([]);
    }
  });

  it('is a no-op on an already-resolved trace (fixed point)', () => {
    const once = resolveDataRefs(
      { dataset: 'sales', x: '@date', text: '@date', marker: { color: '@region' } },
      scatter,
      datasets,
      'data[0]',
    ).trace;
    expect(once).toEqual({ dataset: 'sales', x: date, text: '@date', marker: { color: region } });
    const twice = resolveDataRefs(once, scatter, datasets, 'data[0]');
    expect(twice.trace).toBe(once);
    expect(twice.issues).toEqual([]);
  });

  it('reports references without a dataset and drops them', () => {
    const r = resolveDataRefs({ x: '@date', y: [1] }, scatter, datasets, 'data[2]');
    expect(r.trace).toEqual({ y: [1] });
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({
      path: 'data[2].x',
      code: 'invalid-value',
      severity: 'error',
      value: '@date',
    });
  });

  it('reports unknown columns with a suggestion', () => {
    const r = resolveDataRefs(
      { dataset: 'sales', x: '@dates', marker: { color: '@nope' } },
      scatter,
      datasets,
      'data[0]',
    );
    expect(r.trace).toEqual({ dataset: 'sales', marker: {} });
    expect(r.issues.map((i) => i.path)).toEqual(['data[0].x', 'data[0].marker.color']);
    expect(r.issues[0]).toMatchObject({ code: 'invalid-value', suggestion: '@date' });
    expect(r.issues[0]?.message).toContain("did you mean '@date'");
    expect(r.issues[1]?.suggestion).toBeUndefined();
  });

  it('does not resolve inherited properties as columns', () => {
    const r = resolveDataRefs(
      { dataset: 'sales', x: '@constructor' },
      scatter,
      datasets,
      'data[0]',
    );
    expect(r.trace).toEqual({ dataset: 'sales' });
    expect(r.issues).toHaveLength(1);
  });

  it('reports non-array columns', () => {
    const r = resolveDataRefs({ dataset: 'sales', x: '@total' }, scatter, datasets, 'data[0]');
    expect(r.trace).toEqual({ dataset: 'sales' });
    expect(r.issues[0]).toMatchObject({ path: 'data[0].x', code: 'invalid-value' });
  });

  it('reports an unknown dataset once, with a suggestion, and drops its references', () => {
    const r = resolveDataRefs(
      { dataset: 'sale', x: '@date', y: '@revenue' },
      scatter,
      datasets,
      'data[1]',
    );
    expect(r.trace).toEqual({ dataset: 'sale' });
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({
      path: 'data[1].dataset',
      code: 'invalid-value',
      suggestion: 'sales',
    });
    const none = resolveDataRefs({ dataset: 'sales', x: '@date' }, scatter, undefined, 'data[0]');
    expect(none.issues).toHaveLength(1);
    expect(none.issues[0]?.expected).toContain('none are defined');
  });

  it('reports a dataset that is not a table of columns', () => {
    const r = resolveDataRefs(
      { dataset: 'bad', x: '@a' },
      scatter,
      { bad: [1, 2] } as never,
      'data[0]',
    );
    expect(r.trace).toEqual({ dataset: 'bad' });
    expect(r.issues).toEqual([
      expect.objectContaining({ path: 'datasets.bad', code: 'invalid-container' }),
    ]);
  });

  it('leaves an invalid `dataset` value to schema validation', () => {
    for (const dataset of [42, '', '  ']) {
      const r = resolveDataRefs({ dataset, x: '@date' }, scatter, datasets, 'data[0]');
      expect(r.trace).toEqual({ dataset });
      expect(r.issues).toEqual([]);
    }
  });

  it('resolves inside item arrays and subplot container families', () => {
    const schema = attr.object({
      dimensions: attr.items(
        { values: attr.dataArray(), label: attr.string() },
        { itemName: 'dimension' },
      ),
      xaxis: attr.subplotObject('x', { tickvals: attr.dataArray() }),
      dataset: attr.string(),
    });
    const trace = {
      dataset: 'sales',
      dimensions: [{ values: '@revenue', label: '@date' }, { values: [1] }, 'junk'],
      xaxis2: { tickvals: '@date' },
    };
    const r = resolveDataRefs(trace, schema, datasets, 'data[0]');
    expect(r.issues).toEqual([]);
    const dims = r.trace['dimensions'] as unknown[];
    expect(dims[0]).toEqual({ values: revenue, label: '@date' });
    expect(dims[1]).toBe(trace.dimensions[1]);
    expect(dims[2]).toBe('junk');
    expect((r.trace['xaxis2'] as Record<string, unknown>)['tickvals']).toBe(date);

    const bad = resolveDataRefs(
      { dimensions: [{}, { values: '@x' }] },
      schema,
      datasets,
      'data[3]',
    );
    expect(bad.issues[0]?.path).toBe('data[3].dimensions[1].values');
  });

  it('never throws and never mutates on arbitrary input', () => {
    const refish = fc.oneof(
      fc.constantFrom('@date', '@revenue', '@region', '@total', '@nope', '@@lit', '@', 'sales'),
      fc.anything(),
    );
    const traceArb = fc.dictionary(
      fc.constantFrom('x', 'y', 'text', 'dataset', 'name', 'marker', 'line', 'type', 'other'),
      fc.oneof(
        refish,
        fc.dictionary(fc.constantFrom('color', 'size', 'symbol', 'line', 'opacity'), refish),
      ),
    );
    const datasetsArb = fc.oneof(
      fc.constant(datasets),
      fc.constant(undefined),
      fc.dictionary(fc.string(), fc.dictionary(fc.string(), fc.anything())),
    );
    fc.assert(
      fc.property(traceArb, datasetsArb, (trace, ds) => {
        const before = structuredClone(trace);
        const r = resolveDataRefs(trace, scatter, ds as never, 'data[0]');
        expect(trace).toEqual(before);
        // Resolution is a fixed point: resolving the result again changes nothing.
        expect(resolveDataRefs(r.trace, scatter, ds as never, 'data[0]').trace).toBe(r.trace);
        if (r.trace === trace) return;
        // Every changed top-level value is a resolved column or a copied container.
        for (const [k, v] of Object.entries(r.trace)) {
          if (v !== trace[k]) {
            expect(typeof trace[k] === 'string' || typeof trace[k] === 'object').toBe(true);
          }
        }
      }),
    );
  });

  it('resolves every reference to a known column with no issues', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('@date', '@revenue', '@region'),
        fc.constantFrom('@date', '@revenue', '@region'),
        (x, color) => {
          const r = resolveDataRefs(
            { dataset: 'sales', x, marker: { color } },
            scatter,
            datasets,
            'data[0]',
          );
          expect(r.issues).toEqual([]);
          const cols = datasets.sales as Record<string, unknown>;
          expect(r.trace['x']).toBe(cols[x.slice(1)]);
          expect((r.trace['marker'] as Record<string, unknown>)['color']).toBe(
            cols[color.slice(1)],
          );
        },
      ),
    );
  });
});
