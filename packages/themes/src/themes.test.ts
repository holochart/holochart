import { describe, expect, it } from 'vitest';
import {
  attr,
  canonicalColor,
  createRegistry,
  DEFAULT_COLORWAY,
  holochartTemplate,
  noneTemplate,
  plotlyClassicTemplate,
  stripInternal,
  supplyDefaults,
  type FigureInput,
  type Registry,
  type Template,
  type TraceModule,
} from '@mk7s/holochart-core';
import { builtinThemes, defineTheme, THEME_NAMES, THEMES, type ThemeName } from './index.ts';

/** A tiny scatter module: enough schema for template/colorway precedence. */
const schema = attr.object({
  x: attr.dataArray({ editType: 'calc' }),
  y: attr.dataArray({ editType: 'calc' }),
  marker: attr.object({
    color: attr.color({ arrayOk: true }),
    size: attr.number({ min: 0, dflt: 6 }),
    line: attr.object({ color: attr.color(), width: attr.number({ min: 0, dflt: 0 }) }),
  }),
  line: attr.object({ color: attr.color(), width: attr.number({ min: 0, dflt: 2 }) }),
});

const scatter: TraceModule<typeof schema.children> = {
  type: 'scatter',
  categories: ['cartesian', 'showLegend'],
  schema,
  meta: { description: 'Test scatter.' },
  supplyDefaults(_in, _out, ctx) {
    ctx.coerce('x');
    ctx.coerce('y');
    ctx.coerce('marker.color', ctx.defaultColor);
    ctx.coerce('marker.size');
    ctx.coerce('marker.line.color');
    ctx.coerce('marker.line.width');
    ctx.coerce('line.color', ctx.defaultColor);
    ctx.coerce('line.width');
  },
};

function registry(): Registry {
  const r = createRegistry().register(scatter);
  for (const t of builtinThemes) r.registerTemplate(t.name, t.template);
  return r;
}

function run(figure: FigureInput) {
  return supplyDefaults(figure, registry(), { onIssue: () => undefined });
}

const TWO_TRACES = [
  { type: 'scatter', x: [1, 2], y: [1, 2] },
  { type: 'scatter', x: [1, 2], y: [2, 1] },
];

/** The layout values a theme sets, summarized for the snapshot (E8.1 visual identity). */
function summary(t: Template): Record<string, unknown> {
  const l = (t.layout ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const pick = (o: Record<string, unknown> | undefined, keys: string[]) =>
    Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o?.[k]]));
  return {
    layoutKeys: Object.keys(l).sort(),
    dataTypes: Object.keys(t.data ?? {}).sort(),
    paper_bgcolor: l['paper_bgcolor'],
    plot_bgcolor: l['plot_bgcolor'],
    font: l['font'],
    colorway: l['colorway'],
    xaxis: pick(l['xaxis'], [
      'color',
      'gridcolor',
      'linecolor',
      'showgrid',
      'showline',
      'ticks',
      'zeroline',
      'zerolinecolor',
      'zerolinewidth',
    ]),
    yaxis: pick(l['yaxis'], ['gridcolor', 'showgrid']),
    colorscaleStops: Object.fromEntries(
      Object.entries((l['colorscale'] ?? {}) as Record<string, unknown>).map(([k, v]) => [
        k,
        Array.isArray(v) ? `${v.length} stops ${JSON.stringify(v[0])}…` : v,
      ]),
    ),
    barLine: (t.data?.['bar']?.[0]?.['marker'] as Record<string, unknown> | undefined)?.['line'],
  };
}

describe('built-in themes (E8.1)', () => {
  it('registers every theme of the plan', () => {
    expect(THEME_NAMES).toEqual([
      'holochart',
      'plotly-classic',
      'holochart-dark',
      'plotly',
      'plotly_white',
      'plotly_dark',
      'simple_white',
      'ggplot2',
      'seaborn',
      'presentation',
      'xgridoff',
      'ygridoff',
      'gridon',
      'none',
      'high-contrast',
      'neon',
    ]);
    expect(builtinThemes.map((t) => t.kind)).toEqual(THEME_NAMES.map(() => 'template'));
    expect(defineTheme('neon').template).toBe(THEMES.neon);
    expect(registry().templateNames()).toEqual(THEME_NAMES);
  });

  it.each(THEME_NAMES)('%s: layout values snapshot', (name) => {
    expect(summary(THEMES[name])).toMatchSnapshot();
  });

  it('every color a theme sets is a valid CSS color', () => {
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'string' && /color$|bgcolor$|^colorway\[/.test(path)) {
        expect(canonicalColor(v), `${path}: ${v}`).not.toBeNull();
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
      }
    };
    for (const name of THEME_NAMES) walk(THEMES[name], '');
  });

  it("plotly.py's values: plotly, plotly_dark, simple_white, ggplot2, seaborn", () => {
    const { fullLayout, fullData } = run({ data: TWO_TRACES, layout: { template: 'plotly' } });
    expect(fullLayout.plot_bgcolor).toBe('rgb(229, 236, 246)');
    expect(fullLayout.font.color).toBe('rgb(42, 63, 95)');
    expect(fullLayout.xaxis!.gridcolor).toBe('rgb(255, 255, 255)');
    expect(fullLayout.xaxis!.zerolinewidth).toBe(2);
    expect(fullLayout.xaxis!.ticks).toBe('');
    expect(fullData.map((t) => t['line'] && (t['line'] as { color: string }).color)).toEqual([
      'rgb(99, 110, 250)',
      'rgb(239, 85, 59)',
    ]);
    const dark = run({ data: TWO_TRACES, layout: { template: 'plotly_dark' } }).fullLayout;
    expect(dark.paper_bgcolor).toBe('rgb(17, 17, 17)');
    expect(dark.xaxis!.gridcolor).toBe('rgb(40, 52, 66)');
    expect(dark.xaxis!.linecolor).toBe('rgb(80, 103, 132)');
    const simple = run({ data: TWO_TRACES, layout: { template: 'simple_white' } }).fullLayout;
    expect(simple.xaxis!.showgrid).toBe(false);
    expect(simple.xaxis!.showline).toBe(true);
    expect(simple.xaxis!.ticks).toBe('outside');
    expect(simple.colorway[0]).toBe('rgb(31, 119, 180)');
    const gg = run({ data: TWO_TRACES, layout: { template: 'ggplot2' } }).fullLayout;
    expect(gg.plot_bgcolor).toBe('rgb(237, 237, 237)');
    expect(gg.colorway).toEqual(
      ['#F8766D', '#A3A500', '#00BF7D', '#00B0F6', '#E76BF3'].map(canonicalColor),
    );
    const sea = run({ data: TWO_TRACES, layout: { template: 'seaborn' } }).fullLayout;
    expect(sea.plot_bgcolor).toBe('rgb(234, 234, 242)');
    expect(sea.colorway[0]).toBe('rgb(76, 114, 176)');
  });

  it("plotly-classic and none are Plotly's look: applying them changes nothing", () => {
    const figure = (template?: unknown): FigureInput => ({
      data: TWO_TRACES,
      layout: { title: { text: 'T' }, ...(template === undefined ? {} : { template }) },
    });
    const strip = (l: unknown) => {
      const { template: _t, ...rest } = stripInternal(l) as Record<string, unknown>;
      return rest;
    };
    // A core registry has no default template: an unset template is Plotly's look.
    const plain = run(figure());
    expect(plain.fullLayout.template).toBeNull();
    expect(plain.fullLayout.colorway).toEqual(DEFAULT_COLORWAY.map(canonicalColor));
    expect(plain.fullLayout.paper_bgcolor).toBe('rgb(255, 255, 255)');
    // With `holochart` as the registry default (as in the runtime's shared registry), naming
    // either template still gives exactly Plotly's look.
    const withDefault = registry().setDefaultTemplate('holochart');
    for (const name of ['plotly-classic', 'none', null]) {
      for (const r of [registry(), withDefault]) {
        const themed = supplyDefaults(figure(name), r, { onIssue: () => undefined });
        expect(strip(themed.fullLayout)).toEqual(strip(plain.fullLayout));
        expect(stripInternal(themed.fullData)).toEqual(stripInternal(plain.fullData));
      }
    }
    const dflt = supplyDefaults(figure(), withDefault, { onIssue: () => undefined });
    expect(dflt.fullLayout.paper_bgcolor).toBe('rgb(10, 10, 15)');
  });

  it("holochart-dark is a deprecated alias of holochart; the templates are core's objects", () => {
    expect(THEMES['holochart-dark']).toBe(THEMES.holochart);
    expect(THEMES.holochart).toBe(holochartTemplate);
    expect(THEMES['plotly-classic']).toBe(plotlyClassicTemplate);
    expect(THEMES.none).toBe(noneTemplate);
  });
});

describe('theme precedence (§8: user > template > library defaults)', () => {
  it('user layout values win over the template', () => {
    const { fullLayout } = run({
      data: TWO_TRACES,
      layout: {
        template: 'plotly_dark',
        paper_bgcolor: 'red',
        font: { size: 20 },
        xaxis: { gridcolor: 'blue' },
      },
    });
    expect(fullLayout.paper_bgcolor).toBe('rgb(255, 0, 0)');
    expect(fullLayout.plot_bgcolor).toBe('rgb(17, 17, 17)');
    expect(fullLayout.font.size).toBe(20);
    expect(fullLayout.font.color).toBe('rgb(242, 245, 250)');
    expect(fullLayout.xaxis!.gridcolor).toBe('rgb(0, 0, 255)');
    expect(fullLayout.yaxis!.gridcolor).toBe('rgb(40, 52, 66)');
  });

  it('a user colorway wins over the template colorway; trace colors follow it', () => {
    const { fullData } = run({
      data: TWO_TRACES,
      layout: { template: 'ggplot2', colorway: ['#010203', '#040506'] },
    });
    expect((fullData[1]!['line'] as { color: string }).color).toBe('rgb(4, 5, 6)');
  });

  it('trace attributes win over template traces', () => {
    const { fullData } = run({
      data: [
        { type: 'scatter', y: [1, 2], line: { width: 1 } },
        { type: 'scatter', y: [1, 2] },
      ],
      layout: { template: 'presentation' },
    });
    expect((fullData[0]!['line'] as { width: number }).width).toBe(1);
    expect((fullData[1]!['line'] as { width: number }).width).toBe(3);
    expect((fullData[1]!['marker'] as { size: number }).size).toBe(9);
  });

  it('composes with `+`: later themes win, earlier values survive', () => {
    const { fullLayout } = run({
      data: TWO_TRACES,
      layout: { template: 'simple_white+gridon+presentation' },
    });
    expect(fullLayout.xaxis!.showgrid).toBe(true);
    expect(fullLayout.xaxis!.showline).toBe(true);
    expect(fullLayout.font.size).toBe(18);
    expect(fullLayout.font.color).toBe('rgb(36, 36, 36)');
    const off = run({ data: TWO_TRACES, layout: { template: 'plotly+xgridoff' } }).fullLayout;
    expect(off.xaxis!.showgrid).toBe(false);
    expect(off.yaxis!.showgrid).toBe(true);
    expect(off.xaxis!.gridcolor).toBe('rgb(255, 255, 255)');
  });

  it('our themes set their documented identity', () => {
    const layoutOf = (name: ThemeName) =>
      run({ data: TWO_TRACES, layout: { template: name } }).fullLayout;
    const hc0 = layoutOf('holochart');
    expect(hc0.paper_bgcolor).toBe('rgb(10, 10, 15)');
    expect(hc0.font.size).toBe(9);
    expect(hc0.xaxis!.tickfont.size).toBe(8);
    expect(hc0.xaxis!.tickfont.color).toBe('rgb(128, 131, 143)');
    expect(hc0.xaxis!.ticks).toBe('outside');
    expect(hc0.colorway[0]).toBe('rgb(234, 42, 55)');
    const hc = layoutOf('high-contrast');
    expect(hc.font.size).toBe(14);
    expect(hc.xaxis!.linewidth).toBe(1.5);
    expect(hc.xaxis!.showline).toBe(true);
    const neon = layoutOf('neon');
    expect(neon.plot_bgcolor).toBe('rgb(11, 11, 26)');
    expect(neon.title.font.shadow).toBe('0 0 6px #00f0ff');
  });
});
