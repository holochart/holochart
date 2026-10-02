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
        expect(Holochart.tracePackage(module.type), module.type).toBe(
          `@mk7s/holochart-traces-${name}`,
        );
      }
    }
    expect(types.length).toBeGreaterThan(30);
    // The module is exported under its type name, which is what the hint tells users to import.
    for (const type of types) expect(Holochart).toHaveProperty(type);
    expect(Holochart.tracePackage('scattergeo')).toBeUndefined();
  });
});
