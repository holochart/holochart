import { describe, expect, it, vi } from 'vitest';
import {
  createRegistry,
  supplyDefaults,
  type Issue,
  type Registry,
  type TraceModule,
} from '@mk7s/holochart-core';
import { spots } from '../__testing__/spots.ts';
import { applyStyleRules, styleRulePaths } from './styles.ts';

const GOLD = 'rgb(255, 215, 0)';
const xs = [0, 1, 2, 3, 4];
const ys = [5, 12, 8, 20, 11];

/** `spots` under another type name, with its defaults adjusted by `after`. */
function variant(type: string, after: (out: Record<string, unknown>) => void): TraceModule {
  return {
    ...spots,
    type,
    supplyDefaults(input, out, ctx) {
      spots.supplyDefaults(input, out, ctx);
      after(out);
    },
  };
}

function run(
  core: Registry,
  trace: Record<string, unknown>,
  onIssue?: (issue: Issue) => void,
): Record<string, unknown> {
  const full = supplyDefaults({ data: [trace] }, core);
  applyStyleRules(full, core, onIssue ? { onIssue } : {});
  return full.fullData[0] as Record<string, unknown>;
}

const marker = (t: Record<string, unknown>): Record<string, unknown> =>
  t['marker'] as Record<string, unknown>;

describe('style rules: the per-point arrays they produce (E8.5)', () => {
  it('leaves a trace without points alone', () => {
    const core = createRegistry().register(spots);
    const t = run(core, {
      type: 'spots',
      x: [],
      y: [],
      styleRules: [{ set: { 'marker.size': 20, 'marker.color': 'gold' } }],
    });
    expect(marker(t)['size']).toBe(6);
    expect(typeof marker(t)['color']).toBe('string');
  });

  it("counts the points from the trace's data when the module records no length", () => {
    // A trace type whose defaults do not set `_length`: the shorter of x and y is what gets drawn.
    const core = createRegistry().register(variant('unsized', (out) => delete out['_length']));
    const t = run(core, {
      type: 'unsized',
      x: xs,
      y: [5, 12, 8],
      styleRules: [{ when: { y: { gt: 6 } }, set: { 'marker.size': 20 } }],
    });
    expect(marker(t)['size']).toEqual(Float64Array.of(6, 20, 20));
    // Without any data array there are no points to style.
    const none = run(core, { type: 'unsized', styleRules: [{ set: { 'marker.size': 20 } }] });
    expect(marker(none)['size']).toBe(6);
  });

  it('has no value (NaN) where no rule matches and the trace has none of its own', () => {
    // A trace type that leaves `marker.size` to its view (no default).
    const core = createRegistry().register(
      variant('bare', (out) => delete (out['marker'] as Record<string, unknown>)['size']),
    );
    const t = run(core, {
      type: 'bare',
      x: xs,
      y: ys,
      styleRules: [{ when: { y: { gt: 10 } }, set: { 'marker.size': 14 } }],
    });
    expect(marker(t)['size']).toEqual(Float64Array.of(NaN, 14, NaN, 14, 14));
  });

  it('applies every target of a rule to the points it matches', () => {
    const core = createRegistry().register(spots);
    const t = run(core, {
      type: 'spots',
      x: xs,
      y: ys,
      marker: { color: 'blue', size: 2 },
      styleRules: [
        {
          when: { y: { gt: 10 } },
          set: { 'marker.color': 'gold', 'marker.size': 9, 'marker.symbol': 'square', text: 'big' },
        },
      ],
    });
    const BLUE = 'rgb(0, 0, 255)';
    expect(marker(t)['color']).toEqual([BLUE, GOLD, BLUE, GOLD, GOLD]);
    expect(marker(t)['size']).toEqual(Float64Array.of(2, 9, 2, 9, 9));
    expect(marker(t)['symbol']).toEqual(['circle', 'square', 'circle', 'square', 'square']);
    expect(t['text']).toEqual([undefined, 'big', undefined, 'big', 'big']);
  });

  it('skips the rules of hidden traces, without validating them', () => {
    const core = createRegistry().register(spots);
    const onIssue = vi.fn();
    const t = run(
      core,
      { type: 'spots', x: xs, y: ys, visible: false, styleRules: [{ when: { yy: 1 }, set: {} }] },
      onIssue,
    );
    expect(onIssue).not.toHaveBeenCalled();
    expect(t['visible']).toBe(false);
  });
});

describe('style rules: reporting (E8.5)', () => {
  it('warns through the registry when no issue handler is given', () => {
    const core = createRegistry().register(spots);
    const warn = vi.spyOn(core, 'warnOnce').mockImplementation(() => undefined);
    run(core, {
      type: 'spots',
      x: xs,
      y: ys,
      styleRules: [{ when: { y: { gtt: 1 } }, set: { 'marker.color': 'red' } }],
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      path: 'data[0].styleRules[0].when.y.gtt',
      suggestion: 'gt',
    });
  });

  it('reports rules that are not a list once per trace, whatever they are', () => {
    const core = createRegistry().register(spots);
    const onIssue = vi.fn();
    const trace = { type: 'spots', x: xs, y: ys, styleRules: 'gold' };
    const t = run(core, trace, onIssue);
    run(core, trace, onIssue);
    expect(onIssue).toHaveBeenCalledTimes(1);
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      path: 'data[0].styleRules',
      message: "expected an array of { when, set } rules, got 'gold'",
      code: 'invalid-container',
    });
    expect(marker(t)['size']).toBe(6);
    // Another trace with the same mistake is reported too.
    run(core, { ...trace }, onIssue);
    expect(onIssue).toHaveBeenCalledTimes(2);
  });

  it('reports list items that are not rules at the item, rules without `set` at their set', () => {
    const core = createRegistry().register(spots);
    const issues: Issue[] = [];
    const t = run(
      core,
      {
        type: 'spots',
        x: xs,
        y: ys,
        styleRules: [3, null, { when: { y: 20 } }, { set: { 'marker.size': 9 } }],
      },
      (i) => issues.push(i),
    );
    expect(issues.map((i) => i.path)).toEqual([
      'data[0].styleRules[0]',
      'data[0].styleRules[1]',
      'data[0].styleRules[2].set',
    ]);
    expect(issues.every((i) => i.message.startsWith('expected a rule { when, set }'))).toBe(true);
    // The valid rule after them still applies.
    expect(marker(t)['size']).toEqual(Float64Array.of(9, 9, 9, 9, 9));
  });

  it('warns about an unknown rule key but still applies the rule', () => {
    const core = createRegistry().register(spots);
    const issues: Issue[] = [];
    const t = run(
      core,
      {
        type: 'spots',
        x: xs,
        y: ys,
        styleRules: [{ xyzzyplugh: true, when: { y: 20 }, set: { 'marker.size': 9 } }],
      },
      (i) => issues.push(i),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      path: 'data[0].styleRules[0].xyzzyplugh',
      message: "unknown rule key 'xyzzyplugh'",
      severity: 'warning',
    });
    expect(issues[0]).not.toHaveProperty('suggestion');
    expect(marker(t)['size']).toEqual(Float64Array.of(6, 6, 6, 9, 6));
  });

  it('does not throw for a warning in strict mode', () => {
    const core = createRegistry().register(spots);
    const full = supplyDefaults(
      {
        data: [
          {
            type: 'spots',
            x: xs,
            y: ys,
            styleRules: [{ whne: {}, set: { 'marker.size': 9 } }],
          },
        ],
        config: { strict: true },
      },
      core,
    );
    const onIssue = vi.fn();
    applyStyleRules(full, core, { onIssue });
    expect(onIssue).toHaveBeenCalledTimes(1);
    expect(marker(full.fullData[0] as Record<string, unknown>)['size']).toEqual(
      Float64Array.of(9, 9, 9, 9, 9),
    );
  });

  it('validates the same rules again for a trace of another type', () => {
    // `marker.symbol` is per-point for spots; the other type has no such attribute.
    const plain: TraceModule = {
      ...spots,
      type: 'plain',
      schema: {
        ...spots.schema,
        children: { x: spots.schema.children['x']!, y: spots.schema.children['y']! },
      },
      supplyDefaults(_in, out, ctx) {
        const x = ctx.coerce<ArrayLike<unknown> | undefined>('x');
        ctx.coerce('y');
        out['_length'] = x?.length ?? 0;
      },
    };
    const core = createRegistry().register(spots, plain);
    const rules = [{ set: { 'marker.symbol': 'square' } }];
    const onIssue = vi.fn();
    const full = supplyDefaults(
      {
        data: [
          { type: 'spots', x: xs, y: ys, styleRules: rules },
          { type: 'plain', x: xs, y: ys, styleRules: rules },
        ],
      },
      core,
    );
    applyStyleRules(full, core, { onIssue });
    expect(marker(full.fullData[0] as Record<string, unknown>)['symbol']).toEqual(
      Array(5).fill('square'),
    );
    expect(onIssue).toHaveBeenCalledTimes(1);
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      path: 'data[1].styleRules[0].set.marker.symbol',
      message: "unknown attribute 'marker.symbol' (ignored)",
    });
  });
});

describe('styleRulePaths: what a rules edit touches (E8.5)', () => {
  it('skips rules that are not objects or have no set', () => {
    const before = { styleRules: [null, 3, { when: { y: 1 } }, { set: 'marker.size' }] };
    const after = { styleRules: [{ set: { text: 'a', 'marker.color': 'red' } }] };
    expect(styleRulePaths(['styleRules[0].when'], before, after)).toEqual(['text', 'marker.color']);
  });

  it('returns edits that do not touch the rules unchanged', () => {
    expect(styleRulePaths(['x', 'marker.size'], { styleRules: [] }, undefined)).toEqual([
      'x',
      'marker.size',
    ]);
  });
});
