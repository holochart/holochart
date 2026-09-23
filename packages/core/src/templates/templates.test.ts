import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { supplyDefaults } from '../defaults/supply-defaults.ts';
import type { FigureInput } from '../defaults/types.ts';
import { validate } from '../validate/validate.ts';
import { composeTemplates, resolveTemplate, type Template } from './templates.ts';

const quiet = { onIssue: () => {} };

const dark: Template = {
  layout: {
    paper_bgcolor: '#111',
    plot_bgcolor: '#222',
    font: { color: '#eee', size: 13 },
    colorway: ['#f00', '#0f0', '#00f'],
    xaxis: { type: 'linear' },
  },
  data: {
    scatter: [{ marker: { symbol: 'square' } }, { marker: { symbol: 'diamond' } }],
    bar: [{ marker: { line: { width: 1 } } }],
  },
};
const presentation: Template = {
  layout: { font: { size: 18 }, margin: { t: 60 } },
  data: { scatter: [{ line: { width: 4 } }] },
};

function registry() {
  return fixtureRegistry()
    .registerTemplate('dark', dark)
    .registerTemplate('presentation', presentation);
}
const run = (figure: FigureInput, r = registry()) => supplyDefaults(figure, r, quiet);
const marker = (t: unknown) => (t as { marker: Record<string, unknown> }).marker;

describe('template resolution & composition', () => {
  it('resolves names, compositions, objects, null and the registry default', () => {
    const r = registry();
    expect(resolveTemplate('dark', r).template).toBe(dark);
    expect(resolveTemplate({ layout: {} }, r).template).toEqual({ layout: {} });
    expect(resolveTemplate(null, r).template).toBeNull();
    expect(resolveTemplate(undefined, r).template).toBeNull();
    r.setDefaultTemplate('dark');
    expect(resolveTemplate(undefined, r).template).toBe(dark);
    expect(resolveTemplate(null, r).template).toBeNull();
    expect(resolveTemplate('dark+nope', r)).toEqual({
      template: composeTemplates(dark),
      missing: ['nope'],
    });
  });

  it("composes 'dark+presentation': later layout wins, trace lists merge element-wise", () => {
    const t = resolveTemplate('dark+presentation', registry()).template;
    expect(t?.layout?.['font']).toEqual({ color: '#eee', size: 18 });
    expect(t?.layout?.['paper_bgcolor']).toBe('#111');
    expect(t?.data?.['scatter']).toEqual([
      { marker: { symbol: 'square' }, line: { width: 4 } },
      { marker: { symbol: 'diamond' }, line: { width: 4 } },
    ]);
    expect(t?.data?.['bar']).toEqual(dark.data?.['bar']);
  });

  it('never mutates registered templates', () => {
    const before = JSON.stringify({ dark, presentation });
    const withItems: Template = { layout: { annotations: [{ name: 'wm', text: 'W' }] } };
    const r = registry().registerTemplate('items', withItems);
    run({ data: [{ y: [1] }], layout: { template: 'dark+presentation' } }, r);
    run({ layout: { template: 'items', annotations: [{ templateitemname: 'wm' }] } }, r);
    run({ layout: { template: 'items' } }, r);
    expect(JSON.stringify({ dark, presentation })).toBe(before);
    expect(withItems).toEqual({ layout: { annotations: [{ name: 'wm', text: 'W' }] } });
  });

  it('validation reports unknown template names with a suggestion', () => {
    const issues = validate([], { template: 'drak' }, registry());
    expect(issues).toMatchObject([
      { path: 'layout.template', code: 'unknown-template', suggestion: 'dark' },
    ]);
    const inside = validate(
      [],
      { template: { layout: { fnot: {} }, data: { scatter: [{ modee: 'x' }] } } },
      registry(),
    );
    expect(inside.map((i) => i.path)).toEqual([
      'layout.template.layout.fnot',
      'layout.template.data.scatter[0].modee',
    ]);
  });
});

describe('templates in supplyDefaults', () => {
  it('trace templates cycle per trace type, as in Plotly', () => {
    const { fullData } = run({
      data: [
        { type: 'scatter', y: [1], mode: 'markers' },
        { type: 'bar', y: [1] },
        { type: 'scatter', y: [1], mode: 'markers' },
        { type: 'scatter', y: [1], mode: 'markers' },
      ],
      layout: { template: 'dark' },
    });
    expect(fullData.filter((t) => t.type === 'scatter').map((t) => marker(t)['symbol'])).toEqual([
      'square',
      'diamond',
      'square',
    ]);
    expect(marker(fullData[1])['line']).toEqual({ width: 1 });
  });

  it('template layout applies to all axes of a family', () => {
    const { fullLayout } = run({
      data: [{ y: ['a'], xaxis: 'x2' }],
      layout: { template: 'dark' },
    });
    expect(fullLayout['xaxis2']).toMatchObject({ type: 'linear' });
  });

  it('templateitemname links items to named template items', () => {
    const t: Template = {
      layout: {
        annotationdefaults: { opacity: 0.5, font: { size: 20 } },
        annotations: [
          { name: 'watermark', text: 'DRAFT', x: 0.5 },
          { name: 'source', text: 'Source: X' },
          { text: 'unnamed items are ignored' },
        ],
      },
    };
    const { fullLayout } = run({
      layout: {
        template: t,
        annotations: [
          { text: 'plain' },
          { templateitemname: 'watermark', text: 'FINAL' },
          { templateitemname: 'missing', text: 'hidden' },
        ],
      },
    });
    const items = fullLayout['annotations'] as Record<string, unknown>[];
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ text: 'plain', opacity: 0.5, font: { size: 20 }, _index: 0 });
    expect(items[1]).toMatchObject({
      text: 'FINAL',
      x: 0.5,
      opacity: 0.5,
      templateitemname: 'watermark',
      _index: 1,
    });
    expect(items[1]).not.toHaveProperty('name');
    expect(items[2]).toEqual({ visible: false, templateitemname: 'missing', _index: 2 });
    expect(items[3]).toMatchObject({
      text: 'Source: X',
      templateitemname: 'source',
      visible: true,
      _index: -1,
    });
  });
});

describe('customization cascade precedence (plan §8 layers 1–5)', () => {
  const template: Template = {
    layout: { font: { size: 20, color: 'blue' }, colorway: ['#111', '#222'], width: 900 },
    data: { scatter: [{ marker: { size: 11, symbol: 'square' } }] },
  };

  it('layer 1: schema defaults apply when nothing else is set', () => {
    const { fullLayout, fullData } = run({ data: [{ y: [1], mode: 'markers' }] });
    expect(fullLayout.font.size).toBe(12);
    expect(marker(fullData[0])['size']).toBe(6);
  });

  it('layer 2: the template overrides schema defaults', () => {
    const { fullLayout, fullData } = run({
      data: [{ y: [1], mode: 'markers' }],
      layout: { template },
    });
    expect(fullLayout.font.size).toBe(20);
    expect(fullLayout.width).toBe(900);
    expect(marker(fullData[0])['size']).toBe(11);
  });

  it('layer 3: user layout-level defaults override the template layout', () => {
    const { fullLayout, fullData } = run({
      data: [
        { y: [1], mode: 'markers' },
        { y: [1], mode: 'text', text: 't' },
      ],
      layout: { template, colorway: ['#abcdef'], font: { size: 9 } },
    });
    expect(fullLayout.colorway).toEqual(['rgb(171, 205, 239)']);
    expect(marker(fullData[0])['color']).toBe('rgb(171, 205, 239)');
    // Fonts cascade: text inherits the user's layout font, not the template's.
    expect((fullData[1]?.['textfont'] as { size: number }).size).toBe(9);
    expect(fullLayout.title.font.size).toBe(13);
    // Template layout values the user did not override still apply.
    expect(fullLayout.font.color).toBe('rgb(0, 0, 255)');
  });

  it('template colorway drives trace colors when the user sets none', () => {
    const { fullData } = run({
      data: [
        { y: [1], mode: 'lines' },
        { y: [1], mode: 'lines' },
        { y: [1], mode: 'lines' },
      ],
      layout: { template },
    });
    expect(fullData.map((t) => (t['line'] as { color: string }).color)).toEqual([
      'rgb(17, 17, 17)',
      'rgb(34, 34, 34)',
      'rgb(17, 17, 17)',
    ]);
  });

  it('layer 4: trace attributes override template trace defaults', () => {
    const { fullData } = run({
      data: [{ y: [1], mode: 'markers', marker: { size: 3 } }],
      layout: { template },
    });
    expect(marker(fullData[0])['size']).toBe(3);
    expect(marker(fullData[0])['symbol']).toBe('square');
  });

  it('layer 5: per-point arrays override everything and are kept by reference', () => {
    const sizes = [1, 2, 3];
    const { fullData } = run({
      data: [{ y: [1, 2, 3], mode: 'markers', marker: { size: sizes } }],
      layout: { template },
    });
    expect(marker(fullData[0])['size']).toBe(sizes);
  });

  it('invalid values at any layer fall through to the next one', () => {
    const { fullData, fullLayout } = run({
      data: [{ y: [1], mode: 'markers', marker: { size: -5 } }],
      layout: { template: { ...template, layout: { font: { size: -1 } } }, width: 'wide' },
    });
    expect(marker(fullData[0])['size']).toBe(11);
    expect(fullLayout.font.size).toBe(12);
    expect(fullLayout.width).toBe(700);
  });
});
