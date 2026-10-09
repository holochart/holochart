/**
 * `@mk7s/holochart/geo` (ADR-026): the full bundle's main entry does not register the geo
 * package; this entry does. Vitest isolates modules per file, so the shared registry here is
 * fresh, and the two entries are imported in the order an app imports them.
 */
import { tracePackage } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';

describe('@mk7s/holochart/geo', () => {
  it('the main entry alone leaves the geo package out', async () => {
    const Holochart = await import('./index.ts');
    expect(Holochart.registry.getTrace('scatter')).toBeDefined();
    expect(Holochart.registry.getTrace('scattergeo')).toBeUndefined();
    expect(Holochart.registry.list().traces.map((t) => t.type)).not.toContain('scattergeo');
    expect(Holochart).not.toHaveProperty('tracesGeo');
    expect(Holochart).not.toHaveProperty('scattergeo');
    // A figure with a map says which import it needs.
    const [issue] = Holochart.validate([{ type: 'scattergeo' }], {}, Holochart.registry.core);
    expect(issue?.code).toBe('unknown-trace-type');
    expect(issue?.message).toContain("import '@mk7s/holochart/geo'");
  });

  it('registers every module of the geo package into the shared registry', async () => {
    const Holochart = await import('./index.ts');
    const geo = await import('./geo.ts');
    expect(geo.tracesGeo.length).toBeGreaterThan(0);
    const registered = new Set<unknown>([
      ...Holochart.registry.list().traces.map((t) => Holochart.registry.getTrace(t.type)),
      ...Holochart.registry.components(),
    ]);
    for (const module of geo.tracesGeo) expect(registered.has(module)).toBe(true);
    const scattergeo = Holochart.registry.getTrace('scattergeo');
    expect(scattergeo).toBeDefined();
    expect(scattergeo).toBe((geo as Record<string, unknown>)['scattergeo']);
    expect(Holochart.validate([{ type: 'scattergeo' }], {}, Holochart.registry.core)).toEqual([]);
    // The built-ins are still there, and still the full bundle's own.
    expect(Holochart.registry.getTrace('scatter')).toBe(Holochart.extrudedScatter);
  });

  it("re-exports the geo package, and core knows its trace types' package", async () => {
    const geo = await import('./geo.ts');
    const pkg = await import('@mk7s/holochart-traces-geo');
    expect(Object.keys(geo).sort()).toEqual(Object.keys(pkg).sort());
    for (const [name, value] of Object.entries(pkg)) {
      expect((geo as Record<string, unknown>)[name], name).toBe(value);
    }
    const types: string[] = [];
    for (const module of geo.tracesGeo) {
      // The `geo` subplot component is registered alongside its traces.
      if (!('calc' in module) || typeof module.type !== 'string') continue;
      types.push(module.type);
      expect(tracePackage(module.type), module.type).toBe('@mk7s/holochart-traces-geo');
      // The module is exported under its type name, which is what the hint tells users to import.
      expect(geo).toHaveProperty(module.type);
    }
    expect(types).toContain('scattergeo');
  });
});
