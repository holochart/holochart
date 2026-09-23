import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import {
  attr,
  createRegistry,
  plotSchema,
  type PlotSchema,
  type TraceModule,
} from '@mk7s/holochart-core';
import { collectModules, isComponentModule, isTraceModule } from './discover.ts';
import { DEFAULT_DOCS_PATHS, renderDocsFiles } from './generate-docs.ts';
import {
  allEntries,
  describeType,
  flattenAttributes,
  renderReference,
  sanitizeMarkdown,
} from './render.ts';
import { chartFromFrontmatter, traceTypesInSource } from './scan.ts';

const widget: TraceModule = {
  type: 'widget',
  categories: ['cartesian', 'showLegend'],
  meta: { description: 'A test trace with `<angle>` brackets.', plotlyEquivalent: 'scatter' },
  schema: attr.object({
    x: attr.dataArray({ editType: 'calc', description: 'x coordinates.' }),
    mode: attr.flaglist({ flags: ['lines', 'markers'], extras: ['none'], dflt: 'markers' }),
    marker: attr.object(
      {
        size: attr.number({ min: 0, dflt: 6, arrayOk: true, animatable: true }),
        symbol: attr.enumerated({ values: ['circle', 'square'], dflt: 'circle' }),
        line: attr.object({ width: attr.number({ min: 0, max: 10, dflt: 0 }) }),
      },
      { editType: 'style', description: 'Marker style. Use {{ braces }} freely.' },
    ),
    range: attr.infoArray({ items: [attr.number(), attr.number()] }),
    old: attr.number({
      deprecated: 'use `marker.size`',
      plotlyPath: 'marker.oldsize',
      since: '0.1.0',
    }),
  }),
  layoutSchema: {
    widgetgap: attr.number({ min: 0, max: 1, dflt: 0.2, editType: 'calc' }),
    notes: attr.items({ text: attr.string({ dflt: '' }) }, { itemName: 'note', editType: 'plot' }),
  },
  supplyDefaults() {},
};

function fixtureSchema(): PlotSchema {
  return plotSchema(createRegistry().register(widget));
}

describe('flattenAttributes', () => {
  const traceAttrs = fixtureSchema().traces['widget']!.attributes;
  const entries = allEntries(flattenAttributes(traceAttrs));
  const byPath = new Map(entries.map((e) => [e.path, e]));

  it('builds full dotted paths for nested attributes', () => {
    expect(byPath.get('marker.line.width')?.kind).toBe('attr');
    expect(byPath.get('marker.line')?.kind).toBe('object');
    expect(byPath.get('marker.line.width')?.depth).toBe(2);
  });

  it('inherits edit types from the nearest ancestor', () => {
    expect(byPath.get('marker.size')).toMatchObject({ editType: 'style', editTypeInherited: true });
    expect(byPath.get('x')).toMatchObject({ editType: 'calc', editTypeInherited: false });
  });

  it('includes common trace attributes added by the registry', () => {
    expect(byPath.has('visible')).toBe(true);
    expect(byPath.has('xaxis')).toBe(true);
  });

  it('uses [] paths for items containers', () => {
    const layout = allEntries(flattenAttributes(fixtureSchema().layout.attributes));
    const paths = layout.map((e) => e.path);
    expect(paths).toContain('notes');
    expect(paths).toContain('notes[].text');
    expect(paths).toContain('notes[].templateitemname');
  });
});

describe('describeType', () => {
  it('summarizes ranges, extras and info arrays', () => {
    expect(describeType({ valType: 'number', min: 0, max: 1 })).toBe('`number` from 0 to 1');
    expect(describeType({ valType: 'number', min: 0, extras: ['auto'] })).toBe(
      '`number` ≥ 0, or `"auto"`',
    );
    expect(
      describeType({ valType: 'info_array', items: [{ valType: 'number' }, { valType: 'any' }] }),
    ).toBe('`info_array` `[number, any]`');
  });
});

describe('sanitizeMarkdown', () => {
  it('escapes angle brackets outside code spans only', () => {
    expect(sanitizeMarkdown('a <b> `c<d>` e')).toBe('a &lt;b> `c<d>` e');
  });
});

describe('renderReference', () => {
  const { pages, manifest } = renderReference(fixtureSchema(), {
    chartPages: { widget: '/charts/basic/widget' },
    examplesByTrace: { widget: ['widget/basic'] },
  });
  const page = pages['widget.md']!;

  it('emits layout, config and one page per trace, layout first', () => {
    expect(Object.keys(pages).sort()).toEqual(['config.md', 'layout.md', 'widget.md']);
    expect(manifest.map((p) => p.name)).toEqual(['layout', 'config', 'widget']);
    expect(manifest[2]).toMatchObject({ kind: 'trace', link: '/reference/widget' });
  });

  it('anchors every attribute by its full path', () => {
    expect(page).toContain('<h4 id="marker.line.width" tabindex="-1">');
    expect(page).toContain('href="#marker.line.width"');
    expect(page).toContain('<h2 id="x" tabindex="-1">');
  });

  it('documents type, default, values, arrayOk, editType, animatable and Plotly path', () => {
    const size = page.slice(page.indexOf('id="marker.size"'), page.indexOf('id="marker.symbol"'));
    expect(size).toContain('- **Type:** `number` ≥ 0');
    expect(size).toContain('- **Default:** `6`');
    expect(size).toContain('- **Array OK:** yes');
    expect(size).toContain('- **Edit type:** `style` (inherited)');
    expect(size).toContain('- **Animatable:** yes');
    expect(page).toContain('- **Values:** `"circle"` | `"square"`');
    expect(page).toContain('- **Flags:** `"lines"`, `"markers"` (combine with `+`)');
    expect(page).toContain('- **Plotly path:** `marker.oldsize`');
    expect(page).toContain('> **Deprecated:** use `marker.size`');
  });

  it('shows trace metadata, chart page and example backlinks', () => {
    expect(page).toContain('- **Plotly equivalent:** `scatter`');
    expect(page).toContain('[widget chart page](/charts/basic/widget)');
    expect(page).toContain('`widget/basic`');
    expect(page).toContain('A test trace with `<angle>` brackets.');
  });

  it('wraps the body in v-pre so braces are never interpolated', () => {
    expect(page).toContain('<div v-pre>');
    expect(page.indexOf('<div v-pre>')).toBeLessThan(page.indexOf('{{ braces }}'));
  });

  it('writes placeholder pages for chart-page trace types that are not registered', () => {
    const out = renderReference(fixtureSchema(), { chartPages: { bar: '/charts/basic/bar' } });
    expect(out.manifest.find((p) => p.name === 'bar')).toMatchObject({ pending: true });
    expect(out.pages['bar.md']).toContain('is not registered yet');
    expect(out.manifest.find((p) => p.name === 'widget')?.pending).toBeUndefined();
  });

  it('includes trace layout attributes on the layout page', () => {
    expect(pages['layout.md']).toContain('id="widgetgap"');
  });

  it('rejects trace types that collide with hand-written pages', () => {
    const bad = plotSchema(createRegistry().register({ ...widget, type: 'events' }));
    expect(() => renderReference(bad)).toThrow(/reserved/);
  });
});

describe('renderDocsFiles', () => {
  it('writes pages, manifest and plot-schema.json already formatted with Prettier', async () => {
    const { files, manifest } = await renderDocsFiles(fixtureSchema());
    const out = DEFAULT_DOCS_PATHS.outDir;
    expect(Object.keys(files).sort()).toEqual([
      DEFAULT_DOCS_PATHS.schemaFile,
      `${out}/config.md`,
      `${out}/layout.md`,
      `${out}/manifest.json`,
      `${out}/widget.md`,
    ]);
    expect(JSON.parse(files[`${out}/manifest.json`]!)).toEqual(manifest);
    for (const [rel, content] of Object.entries(files)) {
      const options = { ...(await prettier.resolveConfig(rel)), filepath: rel };
      expect(await prettier.check(content, options), rel).toBe(true);
    }
    // Headings survive formatting untouched.
    expect(files[`${out}/widget.md`]).toContain('<h4 id="marker.line.width" tabindex="-1">');
  });
});

describe('discovery helpers', () => {
  it('recognizes trace and component modules by shape, including arrays', () => {
    const component = { name: 'legend', layoutSchema: {} };
    const found = collectModules({ widget, all: [widget, component], other: { type: 'x' } });
    expect(found.traces).toEqual([widget]);
    expect(found.components).toEqual([component]);
    expect(isTraceModule({ type: 'x' })).toBe(false);
    expect(isComponentModule(widget)).toBe(false);
  });
});

describe('scans', () => {
  it('finds trace types in example sources', () => {
    const src = `data: [{ type: 'scatter', x }, { type: "bar" }], layout: { xaxis: { type: 'log' } }`;
    expect([...traceTypesInSource(src)].sort()).toEqual(['bar', 'log', 'scatter']);
  });

  it('reads chart frontmatter', () => {
    expect(chartFromFrontmatter('---\ntitle: Line\nchart: scatter\n---\n# Line')).toBe('scatter');
    expect(chartFromFrontmatter('# No frontmatter\nchart: bar')).toBeUndefined();
  });
});
