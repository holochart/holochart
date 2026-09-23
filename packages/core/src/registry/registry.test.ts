import { describe, expect, it, vi } from 'vitest';
import { bar, fixtureRegistry, gauge, scatter } from '../__fixtures__/modules.ts';
import { configSchema } from '../config/schema.ts';
import { plotSchema, schemaToJSON } from '../schema/json.ts';
import { attr } from '../schema/attr.ts';
import { createRegistry } from './registry.ts';

describe('registry', () => {
  it('registers modules and merges common + cartesian attributes into trace schemas', () => {
    const r = createRegistry().register(scatter, gauge);
    expect(r.traceTypes()).toEqual(['scatter', 'gauge']);
    expect(r.getModule('scatter')).toBe(scatter);
    const s = r.getTraceSchema('scatter');
    expect(Object.keys(s?.children ?? {})).toEqual(
      expect.arrayContaining([
        'type',
        'visible',
        'name',
        'opacity',
        'xaxis',
        'yaxis',
        'mode',
        'marker',
      ]),
    );
    expect(r.getTraceSchema('gauge')?.children).not.toHaveProperty('xaxis');
    expect(r.getTraceSchema('scatter')).toBe(s);
    expect(r.getTraceSchema('nope')).toBeUndefined();
  });

  it('merges module and component layout attributes into the layout schema', () => {
    const r = createRegistry();
    expect(r.getLayoutSchema().children).not.toHaveProperty('barmode');
    r.register(bar);
    expect(r.getLayoutSchema().children).toHaveProperty('barmode');
    r.registerComponent({
      name: 'legend',
      layoutSchema: { legend: attr.object({ x: attr.number() }) },
    });
    expect(r.getLayoutSchema().children).toHaveProperty('legend');
    expect(r.components().map((c) => c.name)).toEqual(['legend']);
  });

  it('re-registering a type replaces it and invalidates caches', () => {
    const r = createRegistry().register(scatter);
    const before = r.getTraceSchema('scatter');
    r.register({ ...scatter, schema: attr.object({ z: attr.number() }) });
    expect(r.getTraceSchema('scatter')).not.toBe(before);
    expect(r.getTraceSchema('scatter')?.children).toHaveProperty('z');
  });

  it('warns once per path and code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = createRegistry();
    const issue = {
      path: 'layout.x',
      message: 'bad',
      value: 1,
      code: 'invalid-value',
      severity: 'error',
    } as const;
    r.warnOnce(issue);
    r.warnOnce(issue);
    r.warnOnce({ ...issue, code: 'deprecated' });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toBe('[holochart] layout.x: bad');
    warn.mockRestore();
  });
});

describe('plot-schema.json', () => {
  it('serializes the whole library schema', () => {
    const json = plotSchema(fixtureRegistry());
    expect(Object.keys(json.traces)).toEqual(['scatter', 'bar', 'gauge']);
    expect(json.traces['scatter']?.categories).toContain('cartesian');
    expect(json.traces['bar']?.meta).toEqual({ description: 'Test bar.', plotlyEquivalent: 'bar' });
    const attrs = json.traces['scatter']?.attributes as Record<string, Record<string, unknown>>;
    expect(attrs['mode']).toMatchObject({
      valType: 'flaglist',
      flags: ['lines', 'markers', 'text'],
      extras: ['none'],
      editType: 'calc',
    });
    expect(attrs['marker']).toMatchObject({
      role: 'object',
      editType: 'calc',
      size: { valType: 'number', dflt: 6, arrayOk: true },
    });
    const layout = json.layout.attributes as Record<string, Record<string, unknown>>;
    expect(layout['xaxis']).toMatchObject({ role: 'object', subplot: 'x' });
    expect(layout['xaxis']?.['range']).toMatchObject({
      editType: 'ticks+plot',
      items: [{ valType: 'any' }, { valType: 'any' }],
    });
    expect(layout['annotations']).toMatchObject({
      role: 'items',
      itemName: 'annotation',
      items: { role: 'object' },
    });
    expect(json.defs.valTypes).toContain('flaglist');
    expect(json.defs.editTypes).toContain('calcIfAutorange');
    // Round-trips through JSON without loss.
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });

  it('drops non-serializable values', () => {
    const node = attr.object({ f: attr.fn({ description: 'cb' }), a: attr.any({ dflt: () => 1 }) });
    expect(schemaToJSON(node)).toEqual({
      role: 'object',
      f: { valType: 'function', description: 'cb' },
      a: { valType: 'any' },
    });
    expect(schemaToJSON(configSchema)).toHaveProperty('strict.dflt', false);
  });
});
