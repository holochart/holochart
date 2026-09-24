import { describe, expect, it, vi } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { supplyDefaults } from '../defaults/supply-defaults.ts';
import { editFlagsForPath, expandStages, planRelayout, planRestyle, planUpdate } from './plan.ts';
import type { Change } from './plan.ts';

const registry = fixtureRegistry();
const trace = (path: string, type = 'scatter'): Change => ({ target: 'trace', type, path });
const layout = (path: string): Change => ({ target: 'layout', path });
const plan = (...changes: Change[]) => [...planUpdate(changes, { registry })].sort();

describe('planUpdate (plan E1.7 acceptance)', () => {
  it('changing marker.color → style only', () => {
    expect(plan(trace('marker.color'))).toEqual(['style']);
  });

  it('changing x → calc', () => {
    expect(plan(trace('x'))).toEqual(['calc']);
  });

  it('changing xaxis.range → ticks + plot', () => {
    expect(plan(layout('xaxis.range'))).toEqual(['plot', 'ticks']);
    expect(plan(layout('xaxis2.range[0]'))).toEqual(['plot', 'ticks']);
  });

  it('merges flags across paths and drops none', () => {
    expect(plan(trace('marker.color'), layout('margin.l'), layout('uirevision'))).toEqual([
      'layout',
      'style',
    ]);
    expect(plan(layout('uirevision'), trace('uirevision'))).toEqual([]);
  });

  it('inherits edit types from containers', () => {
    // marker.line has editType 'style'; its children declare none.
    expect(plan(trace('marker.line.width'))).toEqual(['style']);
    expect(plan(layout('margin.pad'))).toEqual(['layout']);
    expect(plan(layout('annotations[1].text'))).toEqual(['plot']);
  });

  it('unions the subtree when a whole container changes', () => {
    expect(plan(trace('marker.line'))).toEqual(['style']);
    expect(plan(layout('xaxis'))).toEqual(['calc', 'layout', 'modebar', 'plot', 'ticks']);
    expect(plan(layout('transition'))).toEqual([]);
  });

  it('uses module and common attributes', () => {
    expect(plan(trace('opacity'))).toEqual(['style']);
    expect(plan(trace('name'))).toEqual(['legend', 'plot']);
    expect(plan(layout('barmode'))).toEqual(['crossTraceCalc']);
    expect(plan(trace('orientation', 'bar'))).toEqual(['calc']);
  });

  it('falls back to calc for unknown paths, types and malformed paths', () => {
    expect(plan(trace('marker.bogus'))).toEqual(['calc']);
    expect(plan(trace('x', 'nope'))).toEqual(['calc']);
    expect(plan(layout('a..b'))).toEqual(['calc']);
  });

  it('resolves calcIfAutorange against the trace axes', () => {
    const fig = (autorange: boolean) =>
      supplyDefaults(
        {
          data: [{ y: [1], mode: 'markers' }],
          layout: autorange ? {} : { xaxis: { range: [0, 1] }, yaxis: { range: [0, 1] } },
        },
        registry,
        { onIssue: () => {} },
      );
    const change: Change = { target: 'trace', type: 'scatter', path: 'marker.size', traceIndex: 0 };
    const auto = fig(true);
    const fixed = fig(false);
    expect([...planUpdate([change], { registry, ...auto })]).toEqual(['calc']);
    expect([...planUpdate([change], { registry, ...fixed })]).toEqual(['plot']);
    // Without context the planner stays safe.
    expect([...planUpdate([change], { registry })]).toEqual(['calc']);
  });

  it('logs the plan in debug mode', () => {
    const log = vi.fn();
    planUpdate([trace('marker.color'), layout('xaxis.range')], { registry, debug: true, log });
    expect(log).toHaveBeenCalledOnce();
    const msg = log.mock.calls[0]?.[0] as string;
    expect(msg).toContain('update plan: ticks, plot, style');
    expect(msg).toContain('scatter.marker.color: style → style');
    expect(msg).toContain('layout.xaxis.range: ticks+plot → ticks, plot');
  });
});

describe('restyle / relayout helpers', () => {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ y: [1] }, { type: 'bar', y: [1] }] },
    registry,
    { onIssue: () => {} },
  );

  it('planRestyle applies paths to the selected traces', () => {
    expect([...planRestyle({ 'marker.color': 'red' }, fullData, { registry })]).toEqual(['style']);
    expect([...planRestyle({ orientation: 'h' }, fullData, { registry }, [1])]).toEqual(['calc']);
    expect([...planRestyle({ x: [1] }, fullData, { registry, fullLayout }, [])]).toEqual([]);
  });

  it('planRelayout plans layout paths', () => {
    expect(
      [...planRelayout({ 'xaxis.range[0]': 0, 'xaxis.range[1]': 3 }, { registry })].sort(),
    ).toEqual(['plot', 'ticks']);
  });
});

describe('expandStages & editFlagsForPath', () => {
  it('expands to downstream stages in pipeline order', () => {
    expect(expandStages(['style'])).toEqual(['style']);
    expect(expandStages(['ticks', 'plot'])).toEqual(['ticks', 'plot', 'style']);
    expect(expandStages(['calc'])).toEqual([
      'calc',
      'crossTraceCalc',
      'layout',
      'ticks',
      'plot',
      'style',
      'legend',
      'colorbars',
    ]);
    expect(expandStages(['camera', 'modebar'])).toEqual(['modebar', 'camera']);
  });

  it('reports the raw flags for a path', () => {
    const schema = registry.getTraceSchema('scatter');
    expect(schema && editFlagsForPath(schema, 'marker.size')).toEqual(['calcIfAutorange']);
    expect(editFlagsForPath(registry.getLayoutSchema(), 'meta')).toEqual(['plot']);
  });
});
