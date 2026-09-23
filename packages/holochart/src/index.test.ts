import { describe, expect, it } from 'vitest';
import * as Holochart from './index.ts';

describe('@mk7s/holochart bundle', () => {
  it('registers the built-ins through the public registry', () => {
    expect(Holochart.registry.getTrace('scatter')).toBe(Holochart.scatter);
    expect(Holochart.registry.list().traces.map((t) => t.type)).toContain('scatter');
    expect(Holochart.builtins).toContain(Holochart.scatter);
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
      Holochart.purge,
      Holochart.supplyDefaults,
    ]) {
      expect(typeof fn).toBe('function');
    }
    expect(typeof Holochart.render.createRenderRoot).toBe('function');
  });
});
