import * as components from '@mk7s/holochart-components';
import * as core from '@mk7s/holochart-core';
import * as runtime from '@mk7s/holochart-runtime';
import * as traces3d from '@mk7s/holochart-traces-3d';
import * as tracesBasic from '@mk7s/holochart-traces-basic';
import * as tracesFinance from '@mk7s/holochart-traces-finance';
import * as tracesHier from '@mk7s/holochart-traces-hier';
import * as tracesSci from '@mk7s/holochart-traces-sci';
import * as tracesStats from '@mk7s/holochart-traces-stats';
import { describe, expect, it } from 'vitest';
import * as Holochart from './index.ts';

describe('@mk7s/holochart bundle', () => {
  it('registers the built-ins through the public registry', () => {
    expect(Holochart.registry.getTrace('box')).toBe(Holochart.box);
    expect(Holochart.registry.list().traces.map((t) => t.type)).toContain('scatter');
    expect(Holochart.builtins).toContain(Holochart.box);
    // Scatter with its fill's 2.5D depth (plan E8.9): the full bundle's own module.
    expect(Holochart.registry.getTrace('scatter')).toBe(Holochart.extrudedScatter);
    expect(Holochart.builtins).toContain(Holochart.extrudedScatter);
  });

  it('exposes the object and functional APIs, core, and a namespaced render layer', () => {
    for (const fn of [
      Holochart.createChart,
      Holochart.newPlot,
      Holochart.react,
      Holochart.restyle,
      Holochart.relayout,
      Holochart.update,
      Holochart.extendTraces,
      Holochart.prependTraces,
      Holochart.fromJSON,
      Holochart.chartToJSON,
      Holochart.toImage,
      Holochart.downloadImage,
      Holochart.purge,
      Holochart.supplyDefaults,
    ]) {
      expect(typeof fn).toBe('function');
    }
    expect(typeof Holochart.render.createRenderRoot).toBe('function');
  });

  it('lists its exports: package values unchanged, the shared plumbing left out', () => {
    const packages: Record<string, Record<string, unknown>> = {
      core,
      runtime,
      components,
      tracesBasic,
      tracesStats,
      tracesSci,
      tracesFinance,
      tracesHier,
      traces3d,
    };
    const bundle = Holochart as Record<string, unknown>;
    const owners = new Map<string, string>();
    for (const [pkg, ns] of Object.entries(packages)) {
      for (const [name, value] of Object.entries(ns)) {
        if (!(name in bundle)) continue;
        // The same value under the same name: nothing is shadowed or taken from another package.
        expect(bundle[name], `${pkg}.${name}`).toBe(value);
        owners.set(name, pkg);
      }
    }
    // Every value of the bundle is a package's, a namespace, or the bundle's own.
    const own = [
      'builtins',
      'express',
      'extrudedBar',
      'extrudedIcicle',
      'extrudedPie',
      'extrudedScatter',
      'extrudedTreemap',
      'fonts',
      'render',
      'symbols',
      'themes',
      'view3dAttributes',
      'view3dComponent',
      'view3dEnabled',
    ];
    expect(
      Object.keys(bundle)
        .filter((name) => !owners.has(name))
        .sort(),
    ).toEqual(own);
    // Plumbing the packages export for each other (`@internal`) is not a name of the bundle.
    for (const name of [
      'calcBar',
      'editDistance',
      'layoutBars',
      'RANGESELECTOR_Y_PAD',
      'setBarExtruder',
      'stashSplomAxis',
      'stripInternal',
      'supplyColorscaleDefaults',
      'warnOnce',
    ]) {
      expect(bundle, name).not.toHaveProperty(name);
    }
  });

  it('exports the error classes a caller can catch', () => {
    expect(new Holochart.ValidationError({} as never)).toBeInstanceOf(Holochart.HolochartError);
    expect(new Holochart.WebGLUnavailableError(null)).toBeInstanceOf(Holochart.HolochartError);
  });

  it("core knows every built-in trace type's package (the unknown-trace-type hint)", () => {
    const packages = {
      basic: Holochart.basicTraces,
      stats: Holochart.statsTraces,
      sci: Holochart.sciTraces,
      finance: Holochart.financeTraces,
      hier: Holochart.hierTraces,
      '3d': Holochart.traces3d,
    };
    const types: string[] = [];
    for (const [name, modules] of Object.entries(packages)) {
      for (const module of modules) {
        // Components (polar, scene) are registered alongside their traces.
        if (!('calc' in module) || typeof module.type !== 'string') continue;
        types.push(module.type);
        expect(core.tracePackage(module.type), module.type).toBe(`@mk7s/holochart-traces-${name}`);
      }
    }
    expect(types.length).toBeGreaterThan(30);
    // The module is exported under its type name, which is what the hint tells users to import.
    for (const type of types) expect(Holochart).toHaveProperty(type);
    // A type no package has (tile maps are GEO9).
    expect(core.tracePackage('scattermap')).toBeUndefined();
  });

  it('leaves the geo package out, and says how to add it (ADR-026)', () => {
    // Known to core's table, but not registered here: `@mk7s/holochart/geo` does (geo.test.ts).
    expect(core.tracePackage('scattergeo')).toBe('@mk7s/holochart-traces-geo');
    expect(core.tracePackage('choropleth')).toBe('@mk7s/holochart-traces-geo');
    expect(Holochart.registry.getTrace('scattergeo')).toBeUndefined();
    expect(Holochart).not.toHaveProperty('scattergeo');
    const [issue] = Holochart.validate([{ type: 'scattergeo' }], {}, Holochart.registry.core);
    expect(issue?.message).toBe(
      "unknown trace type 'scattergeo': `scattergeo` is in @mk7s/holochart-traces-geo; import it from there and call `register(scattergeo)`, or with the full bundle add `import '@mk7s/holochart/geo'` (the trace is hidden)",
    );
  });

  it('leaves the graph package out, and says how to add it (ADR-029)', () => {
    // Known to core's table, but not registered here: `@mk7s/holochart/graph` does (graph.test.ts).
    expect(core.tracePackage('graph')).toBe('@mk7s/holochart-traces-graph');
    expect(Holochart.registry.getTrace('graph')).toBeUndefined();
    expect(Holochart).not.toHaveProperty('graph');
    expect(Holochart).not.toHaveProperty('tracesGraph');
    const [issue] = Holochart.validate([{ type: 'graph' }], {}, Holochart.registry.core);
    expect(issue?.message).toBe(
      "unknown trace type 'graph': `graph` is in @mk7s/holochart-traces-graph; import it from there and call `register(graph)`, or with the full bundle add `import '@mk7s/holochart/graph'` (the trace is hidden)",
    );
  });
});
