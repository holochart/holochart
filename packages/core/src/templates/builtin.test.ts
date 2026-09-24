import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { canonicalColor } from '../coerce/color.ts';
import { supplyDefaults } from '../defaults/supply-defaults.ts';
import type { FigureInput } from '../defaults/types.ts';
import { createRegistry } from '../registry/registry.ts';
import { stripInternal } from '../util/objects.ts';
import {
  DEFAULT_TEMPLATE_NAME,
  HOLOCHART_COLORWAY,
  holochartTemplate,
  noneTemplate,
  plotlyClassicTemplate,
} from './builtin.ts';

const quiet = { onIssue: () => {} };
const figure = (template?: unknown): FigureInput => ({
  data: [
    { y: [1, 2], mode: 'lines+markers' },
    { y: [2, 1], mode: 'markers' },
  ],
  layout: { title: { text: 'T' }, ...(template === undefined ? {} : { template }) },
});
/** Public defaulted output without the resolved template object. */
function out(template: unknown, registry = fixtureRegistry()) {
  const { fullData, fullLayout } = supplyDefaults(figure(template), registry, quiet);
  const { template: _t, ...layout } = stripInternal(fullLayout) as Record<string, unknown>;
  return { layout, data: stripInternal(fullData) };
}

describe('built-in templates (ADR-021)', () => {
  it('core applies no template by default: fresh registries keep Plotly defaults', () => {
    expect(createRegistry().defaultTemplate).toBeUndefined();
    const { fullLayout } = supplyDefaults(figure(), fixtureRegistry(), quiet);
    expect(fullLayout.template).toBeNull();
    expect(fullLayout.font.size).toBe(12);
    expect(fullLayout.paper_bgcolor).toBe('rgb(255, 255, 255)');
  });

  it("plotly-classic and none spell out the schema defaults (Plotly's look)", () => {
    const r = fixtureRegistry()
      .registerTemplate('plotly-classic', plotlyClassicTemplate)
      .registerTemplate('none', noneTemplate);
    const plain = out(null);
    expect(out('plotly-classic', r)).toEqual(plain);
    expect(out('none', r)).toEqual(plain);
    expect(out(plotlyClassicTemplate)).toEqual(plain);
  });

  it('holochart applies only as a registered default or by name', () => {
    const r = fixtureRegistry().registerTemplate(DEFAULT_TEMPLATE_NAME, holochartTemplate);
    expect(out(undefined, r)).toEqual(out(null));
    r.setDefaultTemplate(DEFAULT_TEMPLATE_NAME);
    const dark = supplyDefaults(figure(), r, quiet);
    expect(dark.fullLayout.template).toBe(holochartTemplate);
    expect(dark.fullLayout.paper_bgcolor).toBe('rgb(10, 10, 15)');
    expect(dark.fullLayout.colorway).toEqual(HOLOCHART_COLORWAY.map(canonicalColor));
    expect(out(undefined, r)).toEqual(out('holochart', r));
    // Explicit templates replace the default; they are not composed with it.
    expect(out('none', r.registerTemplate('none', noneTemplate))).toEqual(out(null));
    r.setDefaultTemplate(undefined);
    expect(out(undefined, r)).toEqual(out(null));
  });

  it('every color is a valid CSS color', () => {
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'string' && /color$|^colorway\[|colorscale\.\w+\[\d+\]\[1\]$/.test(path)) {
        expect(canonicalColor(v), `${path}: ${v}`).not.toBeNull();
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
      }
    };
    walk(holochartTemplate, '');
    walk(plotlyClassicTemplate, '');
  });
});
