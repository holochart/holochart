/**
 * A partial bundle (plan E21.1): the runtime plus one trace package, without `@mk7s/holochart` or
 * the themes package. Vitest isolates modules per file, so the shared registry here is fresh.
 */
import { supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry, register, registry } from '@mk7s/holochart-runtime';
import { scatter } from '@mk7s/holochart-traces-basic';
import { describe, expect, it } from 'vitest';

describe('partial bundle: runtime + scatter (ADR-021)', () => {
  register(scatter);
  const figure = (template?: unknown) => ({
    data: [{ type: 'scatter', y: [1, 3, 2] }],
    layout: template === undefined ? {} : { template },
  });

  it('applies the default look without the themes package', () => {
    expect(registry.list().templates).toEqual(['holochart', 'plotly-classic', 'none']);
    expect(registry.list().defaultTemplate).toBe('holochart');
    const { fullLayout, fullData } = supplyDefaults(figure(), registry.core);
    expect(fullLayout.paper_bgcolor).toBe('rgb(10, 10, 15)');
    expect(fullLayout.font.size).toBe(9);
    expect(fullData[0]!['line']).toEqual(
      expect.objectContaining({ width: 1.25, color: 'rgb(234, 42, 55)' }),
    );
  });

  it("names Plotly's look without warnings", () => {
    for (const template of ['plotly-classic', 'none']) {
      const issues: unknown[] = [];
      const { fullLayout, fullData } = supplyDefaults(figure(template), registry.core, {
        onIssue: (i) => issues.push(i),
      });
      expect(issues).toEqual([]);
      expect(fullLayout.paper_bgcolor).toBe('rgb(255, 255, 255)');
      expect(fullLayout.font.size).toBe(12);
      expect(fullData[0]!['line']).toEqual(
        expect.objectContaining({ width: 2, color: 'rgb(31, 119, 180)' }),
      );
    }
  });

  it('fresh registries have no templates and no default', () => {
    const fresh = createChartRegistry().register(scatter);
    expect(fresh.list()).toMatchObject({ templates: [], defaultTemplate: undefined });
    const { fullLayout } = supplyDefaults(figure(), fresh.core);
    expect(fullLayout.template).toBeNull();
    expect(fullLayout.paper_bgcolor).toBe('rgb(255, 255, 255)');
  });
});
