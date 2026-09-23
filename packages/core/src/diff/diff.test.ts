import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import type { FigureInput } from '../defaults/types.ts';
import { planUpdate } from '../edit/plan.ts';
import { diffFigures, matchTraces, planDiff } from './diff.ts';

const registry = fixtureRegistry();

const diff = (prev: FigureInput, next: FigureInput) => diffFigures(prev, next, registry);
const paths = (prev: FigureInput, next: FigureInput) => diff(prev, next).changes.map((c) => c.path);
const plan = (prev: FigureInput, next: FigureInput) =>
  planUpdate(diff(prev, next).changes, { registry });

/** An array whose elements must never be read (length and index access throw). */
function untouchable(): number[] {
  return new Proxy([1, 2, 3], {
    get(target, key, receiver) {
      if (key === 'length' || (typeof key === 'string' && /^\d+$/.test(key))) {
        throw new Error('data array contents were read');
      }
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
}

describe('diffFigures: identity and value comparison', () => {
  it('reports nothing for the same figure', () => {
    const f: FigureInput = { data: [{ type: 'scatter', x: [1], y: [2] }], layout: { title: 'a' } };
    const d = diff(f, f);
    expect(d.empty).toBe(true);
    expect(d.changes).toEqual([]);
    expect(d.traces.matched).toEqual([{ from: 0, to: 0 }]);
  });

  it('compares small non-data arrays and objects by value (fresh React literals are not edits)', () => {
    const x = [1, 2];
    const make = (): FigureInput => ({
      data: [{ x, y: x, marker: { color: 'red', line: { width: 2 } } }],
      layout: {
        xaxis: { range: [0, 10] },
        xaxis2: { domain: [0.5, 1] },
        colorway: ['#111', '#222'],
        annotations: [{ text: 'a', font: { size: 3 } }],
      },
      config: { responsive: true },
    });
    expect(diff(make(), make()).empty).toBe(true);
  });

  it('treats NaN as equal to NaN', () => {
    const f = (): FigureInput => ({ layout: { xaxis: { range: [NaN, 1] } } });
    expect(diff(f(), f()).empty).toBe(true);
  });

  it('compares data arrays by reference: a new array with equal contents is a change', () => {
    const y = [1, 2];
    const d = diff({ data: [{ x: [1, 2], y }] }, { data: [{ x: [1, 2], y }] });
    expect(d.changes).toEqual([{ target: 'trace', type: 'scatter', path: 'x', traceIndex: 0 }]);
    expect(planUpdate(d.changes, { registry })).toEqual(new Set(['calc']));
  });

  it('does not see in-place mutation of a data array unless datarevision changes', () => {
    const x = [1, 2];
    const prev: FigureInput = { data: [{ x, y: [3, 4] }], layout: { datarevision: 1 } };
    const trace = prev.data?.[0] as { x: number[]; y: number[] };
    const next: FigureInput = { data: [{ ...trace }], layout: { datarevision: 1 } };
    x.push(3);
    expect(diff(prev, next).empty).toBe(true);

    const bumped: FigureInput = { data: [trace], layout: { datarevision: 2 } };
    expect(paths(prev, bumped).sort()).toEqual(['datarevision', 'x', 'y']);
  });

  it('with a changed datarevision, marks arrayOk array values changed but not scalars', () => {
    const colors = ['red', 'blue'];
    const trace = { x: [1], marker: { color: colors, size: 4 } };
    const d = diff(
      { data: [trace], layout: { datarevision: 'a' } },
      { data: [trace], layout: { datarevision: 'b' } },
    );
    expect(d.changes.map((c) => c.path).sort()).toEqual(['datarevision', 'marker.color', 'x']);
  });

  it('compares arrayOk array values by reference and scalars by value', () => {
    const c = ['red', 'blue'];
    expect(
      paths({ data: [{ marker: { color: c } }] }, { data: [{ marker: { color: c } }] }),
    ).toEqual([]);
    expect(
      paths({ data: [{ marker: { color: c } }] }, { data: [{ marker: { color: [...c] } }] }),
    ).toEqual(['marker.color']);
    expect(
      paths({ data: [{ marker: { color: c } }] }, { data: [{ marker: { color: 'red' } }] }),
    ).toEqual(['marker.color']);
  });

  it('never reads data array contents', () => {
    const a = untouchable();
    const b = untouchable();
    expect(() => diff({ data: [{ x: a }] }, { data: [{ x: b }] })).not.toThrow();
    expect(paths({ data: [{ x: a }] }, { data: [{ x: b }] })).toEqual(['x']);
    expect(
      paths(
        { data: [{ x: a, marker: { size: b } }], layout: { datarevision: 1 } },
        { data: [{ x: a, marker: { size: b } }], layout: { datarevision: 2 } },
      ).sort(),
    ).toEqual(['datarevision', 'marker.size', 'x']);
    // Unknown attributes are compared by reference too.
    expect(paths({ data: [{ custom: a }] }, { data: [{ custom: b }] })).toEqual(['custom']);
  });

  it('never mutates its inputs', () => {
    const prev: FigureInput = {
      data: [{ x: [1], uid: 'a' }],
      layout: { xaxis: { range: [0, 1] } },
    };
    const next: FigureInput = { data: [{ x: [2], uid: 'b' }], layout: {} };
    const before = structuredClone([prev, next]);
    diff(prev, next);
    expect([prev, next]).toEqual(before);
  });
});

describe('diffFigures: paths and planning', () => {
  it('plans a marker.color-only change as style', () => {
    const x = [1, 2];
    expect(
      plan(
        { data: [{ x, y: x, marker: { color: 'red' } }] },
        { data: [{ x, y: x, marker: { color: 'blue' } }] },
      ),
    ).toEqual(new Set(['style']));
  });

  it('reports leaf paths when a container appears or disappears', () => {
    expect(paths({ data: [{}] }, { data: [{ marker: { color: 'red' } }] })).toEqual([
      'marker.color',
    ]);
    expect(plan({ data: [{}] }, { data: [{ marker: { color: 'red' } }] })).toEqual(
      new Set(['style']),
    );
    expect(paths({ data: [{ marker: { line: { width: 1 } } }] }, { data: [{}] })).toEqual([
      'marker.line.width',
    ]);
  });

  it('reports the container when a container is replaced by a non-object', () => {
    expect(paths({ data: [{ marker: { color: 'red' } }] }, { data: [{ marker: 5 }] })).toEqual([
      'marker',
    ]);
  });

  it('diffs subplot axes such as xaxis2 against the xaxis schema', () => {
    const d = diff(
      { layout: { xaxis2: { range: [0, 1] } } },
      { layout: { xaxis2: { range: [0, 2] } } },
    );
    expect(d.changes).toEqual([{ target: 'layout', path: 'xaxis2.range' }]);
    expect(planUpdate(d.changes, { registry })).toEqual(new Set(['ticks', 'plot']));
  });

  it('compares info_array ranges by value, including element changes', () => {
    expect(
      paths({ layout: { xaxis: { range: [0, 1] } } }, { layout: { xaxis: { range: [0, 1] } } }),
    ).toEqual([]);
    expect(paths({ layout: { xaxis: { range: [0, 1] } } }, { layout: {} })).toEqual([
      'xaxis.range',
    ]);
    expect(paths({ layout: { colorway: ['#a'] } }, { layout: { colorway: ['#b'] } })).toEqual([
      'colorway',
    ]);
  });

  it('diffs items arrays per item, reporting appearing/disappearing items whole', () => {
    const base = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
    expect(
      paths(
        { layout: { annotations: base } },
        { layout: { annotations: [base[0], base[1], { text: 'C' }] } },
      ),
    ).toEqual(['annotations[2].text']);
    expect(
      paths(
        { layout: { annotations: base } },
        { layout: { annotations: [...base, { text: 'd' }] } },
      ),
    ).toEqual(['annotations[3]']);
    expect(paths({ layout: { annotations: base } }, { layout: {} })).toEqual([
      'annotations[0]',
      'annotations[1]',
      'annotations[2]',
    ]);
    expect(
      plan(
        { layout: { annotations: base } },
        { layout: { annotations: [...base, { text: 'd' }] } },
      ).has('plot'),
    ).toBe(true);
  });

  it('reports unknown attributes, which plan as calc', () => {
    const d = diff({ data: [{ foo: { bar: 1 } }] }, { data: [{ foo: { bar: 2 } }] });
    expect(d.changes.map((c) => c.path)).toEqual(['foo.bar']);
    expect(planUpdate(d.changes, { registry })).toEqual(new Set(['calc']));
    expect(paths({ layout: { mystery: 1 } }, { layout: { mystery: 2 } })).toEqual(['mystery']);
  });

  it('diffs traces of unregistered types without a schema', () => {
    const d = diff({ data: [{ type: 'nope', a: 1 }] }, { data: [{ type: 'nope', a: 2 }] });
    expect(d.changes).toEqual([{ target: 'trace', type: 'nope', path: 'a', traceIndex: 0 }]);
  });

  it('ignores internal keys starting with "_"', () => {
    expect(
      diff(
        { data: [{ _index: 0 }], layout: { _x: 1 } },
        { data: [{ _index: 5 }], layout: { _x: 2 } },
      ).empty,
    ).toBe(true);
  });

  it('does not report an unset type becoming its default', () => {
    expect(diff({ data: [{ x: null }] }, { data: [{ type: 'scatter', x: null }] }).empty).toBe(
      true,
    );
  });

  it('reports trace changes with the index in the next data', () => {
    const d = diff(
      { data: [{ uid: 'a' }, { uid: 'b', opacity: 1 }] },
      { data: [{ uid: 'b', opacity: 0.5 }, { uid: 'a' }] },
    );
    expect(d.changes).toEqual([
      { target: 'trace', type: 'scatter', path: 'opacity', traceIndex: 0 },
    ]);
  });

  it('flags config, frames and layout-only changes', () => {
    const frames: unknown[] = [];
    expect(
      diff({ config: { scrollZoom: true } }, { config: { scrollZoom: false } }).configChanged,
    ).toBe(true);
    expect(diff({ config: { scrollZoom: true } }, { config: { scrollZoom: true } }).empty).toBe(
      true,
    );
    expect(diff({ frames }, { frames: [] }).framesChanged).toBe(true);
    expect(diff({ frames }, { frames }).empty).toBe(true);
  });
});

describe('diffFigures: trace identity', () => {
  const x = [1, 2];

  it('moves reordered uid traces instead of rebuilding them', () => {
    const a = { uid: 'a', x };
    const b = { uid: 'b', type: 'bar', x };
    const c = { uid: 'c', x };
    const d = diff({ data: [a, b, c] }, { data: [c, a, b] });
    expect(d.traces.added).toEqual([]);
    expect(d.traces.removed).toEqual([]);
    expect(d.traces.matched).toEqual([
      { from: 2, to: 0 },
      { from: 0, to: 1 },
      { from: 1, to: 2 },
    ]);
    expect(d.traces.moved).toEqual(d.traces.matched);
    expect(d.changes).toEqual([]);
    expect(d.empty).toBe(false);
    const stages = planDiff(d, { registry });
    expect(stages.has('calc')).toBe(false);
    expect(stages).toEqual(new Set(['crossTraceCalc', 'plot', 'style', 'legend']));
  });

  it('matches reordered uid traces even when their objects are fresh copies', () => {
    const d = diff(
      {
        data: [
          { uid: 'a', x, marker: { color: 'red' } },
          { uid: 'b', x },
        ],
      },
      {
        data: [
          { uid: 'b', x },
          { uid: 'a', x, marker: { color: 'blue' } },
        ],
      },
    );
    expect(d.traces.moved).toEqual([
      { from: 1, to: 0 },
      { from: 0, to: 1 },
    ]);
    expect(d.changes).toEqual([
      { target: 'trace', type: 'scatter', path: 'marker.color', traceIndex: 1 },
    ]);
  });

  it('treats a type change as removed + added', () => {
    const d = diff({ data: [{ uid: 'a', x }] }, { data: [{ uid: 'a', type: 'bar', x }] });
    expect(d.traces).toEqual({ added: [0], removed: [0], matched: [], moved: [] });
    expect(d.changes).toEqual([
      { target: 'trace', type: 'scatter', path: 'type' },
      { target: 'trace', type: 'bar', path: 'type', traceIndex: 0 },
    ]);
    expect(planUpdate(d.changes, { registry })).toEqual(new Set(['calc']));

    const positional = diff({ data: [{ x }] }, { data: [{ type: 'bar', x }] });
    expect(positional.traces.added).toEqual([0]);
    expect(positional.traces.removed).toEqual([0]);
  });

  it('reports added and removed traces (positional matching without uids)', () => {
    const t0 = { x };
    const t1 = { x, type: 'bar' };
    const added = diff({ data: [t0] }, { data: [t0, t1] });
    expect(added.traces).toEqual({
      added: [1],
      removed: [],
      matched: [{ from: 0, to: 0 }],
      moved: [],
    });
    expect(added.changes).toEqual([{ target: 'trace', type: 'bar', path: 'type', traceIndex: 1 }]);
    expect(planDiff(added, { registry })).toEqual(new Set(['calc']));

    const removed = diff({ data: [t0, t1] }, { data: [t0] });
    expect(removed.traces).toEqual({
      added: [],
      removed: [1],
      matched: [{ from: 0, to: 0 }],
      moved: [],
    });
    expect(removed.changes).toEqual([{ target: 'trace', type: 'bar', path: 'type' }]);
  });

  it('keeps positional pairing of uid-less traces when a uid trace is removed', () => {
    const plain = { x };
    const d = diff({ data: [{ uid: 'u', x }, plain] }, { data: [plain] });
    expect(d.traces.matched).toEqual([{ from: 1, to: 0 }]);
    expect(d.traces.removed).toEqual([0]);
    expect(d.traces.moved).toEqual([{ from: 1, to: 0 }]);
  });

  it('matches repeated uids after the first positionally', () => {
    const m = matchTraces([{ uid: 'a' }], [{ uid: 'a' }, { uid: 'a' }]);
    expect(m).toEqual({ added: [1], removed: [], matched: [{ from: 0, to: 0 }], moved: [] });
    const dup = [{ uid: 'b' }, { uid: 'b' }, { uid: 'b', type: 'bar' }];
    expect(diff({ data: dup }, { data: dup }).empty).toBe(true);
    expect(matchTraces([{ uid: 'b' }, { uid: 'b' }, {}], [{}, { uid: 'b' }]).matched).toEqual([
      { from: 1, to: 0 },
      { from: 0, to: 1 },
    ]);
  });

  it('never matches a uid trace positionally', () => {
    const m = matchTraces([{ x }], [{ uid: 'new', x }]);
    expect(m).toEqual({ added: [0], removed: [0], matched: [], moved: [] });
  });

  it('tolerates non-array data and non-object traces', () => {
    expect(diff({ data: 5 as unknown as unknown[] }, { data: [null, 3] }).traces.added).toEqual([
      0, 1,
    ]);
    expect(diff({ data: [null] }, { data: [7] }).empty).toBe(true);
  });
});

describe('diffFigures: datasets', () => {
  it('reports traces reading a replaced column, and only those', () => {
    const date = [1, 2];
    const revenue = [3, 4];
    const cost = [5, 6];
    const prev: FigureInput = {
      datasets: { sales: { date, revenue, cost } },
      data: [
        { dataset: 'sales', x: '@date', y: '@revenue' },
        { dataset: 'sales', x: '@date', y: '@cost' },
      ],
    };
    const next: FigureInput = { ...prev, datasets: { sales: { date, revenue: [3, 4], cost } } };
    const d = diff(prev, next);
    expect(d.datasetsChanged).toEqual(['sales']);
    expect(d.changes).toEqual([{ target: 'trace', type: 'scatter', path: 'y', traceIndex: 0 }]);
  });

  it('does not report literal @-text or unknown attributes as reading a column', () => {
    const date = [1, 2];
    const trace = { dataset: 'sales', x: '@date', text: '@date', extra: '@date' };
    const prev: FigureInput = { datasets: { sales: { date } }, data: [trace] };
    const next: FigureInput = { datasets: { sales: { date: [1, 2] } }, data: [trace] };
    expect(diff(prev, next).changes).toEqual([
      { target: 'trace', type: 'scatter', path: 'x', traceIndex: 0 },
    ]);
  });

  it('marks every dataset changed when datarevision changes', () => {
    const ds = { sales: { a: [1] } };
    const prev: FigureInput = {
      datasets: ds,
      data: [{ dataset: 'sales', x: '@a' }],
      layout: { datarevision: 1 },
    };
    const next: FigureInput = { ...prev, layout: { datarevision: 2 } };
    const d = diff(prev, next);
    expect(d.datasetsChanged).toEqual(['sales']);
    expect(d.changes.map((c) => c.path).sort()).toEqual(['datarevision', 'x']);
  });

  it('is empty when datasets are shared', () => {
    const ds = { sales: { a: [1] } };
    expect(diff({ datasets: ds }, { datasets: { sales: ds.sales } }).empty).toBe(true);
    expect(diff({ datasets: ds }, { datasets: { sales: { a: [1] } } }).datasetsChanged).toEqual([
      'sales',
    ]);
  });
});

describe('diffFigures: properties', () => {
  const leaf = fc.oneof(
    fc.integer(),
    fc.double(),
    fc.string({ maxLength: 4 }),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
  );
  const value = fc.oneof(
    { depthSize: 'small' },
    leaf,
    fc.array(leaf, { maxLength: 3 }),
    fc.anything({ maxDepth: 3 }),
  );
  const trace = fc.record(
    {
      type: fc.constantFrom('scatter', 'bar', 'gauge', 'nope', '', 3),
      uid: fc.constantFrom('a', 'b', 'c', '', undefined),
      x: fc.oneof(fc.array(fc.integer(), { maxLength: 3 }), fc.constant('@a'), leaf),
      marker: fc.oneof(
        fc.record(
          { color: value, size: value, line: fc.oneof(value, fc.record({ width: value })) },
          { requiredKeys: [] },
        ),
        value,
      ),
      dataset: fc.constantFrom('ds', undefined),
      extra: value,
    },
    { requiredKeys: [] },
  );
  const layout = fc.record(
    {
      xaxis: fc.oneof(fc.record({ range: value, type: value }, { requiredKeys: [] }), value),
      xaxis2: fc.record({ range: value }, { requiredKeys: [] }),
      annotations: fc.oneof(
        fc.array(fc.oneof(fc.record({ text: value }), value), { maxLength: 3 }),
        value,
      ),
      datarevision: fc.constantFrom(1, 2, undefined),
      colorway: value,
      other: value,
    },
    { requiredKeys: [] },
  );
  const figure: fc.Arbitrary<FigureInput> = fc.record(
    {
      data: fc.oneof(fc.array(fc.oneof(trace, value), { maxLength: 4 }), value),
      layout: fc.oneof(layout, value),
      config: value,
      datasets: fc.constantFrom(undefined, { ds: { a: [1] } }),
    },
    { requiredKeys: [] },
  ) as fc.Arbitrary<FigureInput>;

  it('diff(f, f) is empty', () => {
    fc.assert(
      fc.property(figure, (f) => {
        expect(diff(f, f).empty).toBe(true);
      }),
    );
  });

  it('never throws, never mutates, and its changes always plan', () => {
    fc.assert(
      fc.property(figure, figure, (a, b) => {
        const before = structuredClone([a, b]);
        const d = diff(a, b);
        expect([a, b]).toEqual(before);
        expect(() => planDiff(d, { registry })).not.toThrow();
        for (const c of d.changes) {
          if (c.target === 'trace' && c.traceIndex !== undefined) {
            expect(
              d.traces.added.includes(c.traceIndex) ||
                d.traces.matched.some((m) => m.to === c.traceIndex),
            ).toBe(true);
          }
        }
      }),
    );
  });

  it('every trace index is accounted for exactly once', () => {
    fc.assert(
      fc.property(figure, figure, (a, b) => {
        const { traces } = diff(a, b);
        const na = Array.isArray(a.data) ? a.data.length : 0;
        const nb = Array.isArray(b.data) ? b.data.length : 0;
        const from = [...traces.removed, ...traces.matched.map((m) => m.from)].sort(
          (p, q) => p - q,
        );
        const to = [...traces.added, ...traces.matched.map((m) => m.to)].sort((p, q) => p - q);
        expect(from).toEqual([...Array(na).keys()]);
        expect(to).toEqual([...Array(nb).keys()]);
      }),
    );
  });

  it('a structural copy that shares data arrays diffs empty', () => {
    // Copies the schema containers along known paths (fresh literals, as a React render makes) and
    // keeps everything else, including data and unknown values, by reference.
    type Fn = (v: unknown) => unknown;
    const isObj = (v: unknown): v is Record<string, unknown> =>
      v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
    const edit =
      (fns: Record<string, Fn> = {}): Fn =>
      (v) => {
        if (!isObj(v)) return v;
        const out = { ...v };
        for (const [k, fn] of Object.entries(fns)) if (Object.hasOwn(out, k)) out[k] = fn(out[k]);
        return out;
      };
    const each =
      (fn: Fn): Fn =>
      (v) =>
        Array.isArray(v) ? v.map(fn) : v;
    const axis = edit({ range: each((e) => e) });
    const copy = edit({
      data: each(edit({ marker: edit({ line: edit() }) })),
      layout: edit({ xaxis: axis, xaxis2: axis, annotations: each(edit()) }),
      config: (c) => structuredClone(c),
    });
    fc.assert(
      fc.property(figure, (f) => {
        expect(diff(f, copy(f) as FigureInput).empty).toBe(true);
      }),
    );
  });
});
