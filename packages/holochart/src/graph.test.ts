/**
 * `@mk7s/holochart/graph` (ADR-029): the full bundle's main entry does not register the graph
 * package; this entry does. Vitest isolates modules per file, so the shared registry here is
 * fresh, and the two entries are imported in the order an app imports them.
 */
import { tracePackage } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';

describe('@mk7s/holochart/graph', () => {
  it('the main entry alone leaves the graph package out', async () => {
    const Holochart = await import('./index.ts');
    expect(Holochart.registry.getTrace('scatter')).toBeDefined();
    expect(Holochart.registry.getTrace('graph')).toBeUndefined();
    expect(Holochart.registry.getTrace('graph3d')).toBeUndefined();
    expect(Holochart.registry.list().traces.map((t) => t.type)).not.toContain('graph');
    expect(Holochart).not.toHaveProperty('tracesGraph');
    expect(Holochart).not.toHaveProperty('graph');
    // A figure with a graph says which import it needs.
    const [issue] = Holochart.validate([{ type: 'graph' }], {}, Holochart.registry.core);
    expect(issue?.code).toBe('unknown-trace-type');
    expect(issue?.message).toContain("import '@mk7s/holochart/graph'");
  });

  it('registers every module of the graph package into the shared registry', async () => {
    const Holochart = await import('./index.ts');
    const graph = await import('./graph.ts');
    expect(graph.tracesGraph.length).toBeGreaterThan(0);
    const registered = new Set<unknown>([
      ...Holochart.registry.list().traces.map((t) => Holochart.registry.getTrace(t.type)),
      ...Holochart.registry.components(),
    ]);
    for (const module of [...graph.tracesGraph, ...graph.tracesGraph3d]) {
      expect(registered.has(module)).toBe(true);
    }
    expect(Holochart.registry.getTrace('graph')).toBe(graph.graph);
    // `graph3d` is drawn in the full bundle's own 3D scene.
    expect(Holochart.registry.getTrace('graph3d')).toBe(graph.graph3d);
    expect(graph.tracesGraph).not.toContain(graph.graph3d);
    expect(graph.tracesGraph3d).toContain(Holochart.sceneComponent);
    expect(Holochart.validate([{ type: 'graph3d' }], {}, Holochart.registry.core)).toEqual([]);
    expect(Holochart.validate([{ type: 'graph' }], {}, Holochart.registry.core)).toEqual([]);
    // The built-ins are still there, and still the full bundle's own.
    expect(Holochart.registry.getTrace('scatter')).toBe(Holochart.extrudedScatter);
  });

  it("re-exports the graph package, and core knows its trace types' package", async () => {
    const graph = await import('./graph.ts');
    const pkg = await import('@mk7s/holochart-traces-graph');
    expect(Object.keys(graph).sort()).toEqual(Object.keys(pkg).sort());
    for (const [name, value] of Object.entries(pkg)) {
      expect((graph as Record<string, unknown>)[name], name).toBe(value);
    }
    const types: string[] = [];
    for (const module of [...graph.tracesGraph, ...graph.tracesGraph3d]) {
      // `Registrable` covers components too; only trace modules have a type in core's table.
      if (!('calc' in module) || typeof module.type !== 'string') continue;
      types.push(module.type);
      expect(tracePackage(module.type), module.type).toBe('@mk7s/holochart-traces-graph');
      // The module is exported under its type name, which is what the hint tells users to import.
      expect(graph).toHaveProperty(module.type);
    }
    expect(types).toContain('graph');
    expect(types).toContain('graph3d');
  });
});
