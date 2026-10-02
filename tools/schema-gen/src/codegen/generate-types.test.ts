import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { attr, configSchema, layoutSchema } from '@mk7s/holochart-core';
import { createTypeFile, generateTraceTypes, generateTypes } from './generate-types.ts';

/** Property line (without JSDoc) for `key` in the generated source. */
function propLine(src: string, key: string): string | undefined {
  return src
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${key}?:`) || l.startsWith(`${key}:`));
}

function typeOf(spec: Parameters<typeof attr.object>[0][string]): string | undefined {
  const line = propLine(generateTypes(attr.object({ a: spec }), 'T'), 'a');
  return line?.replace(/^a\?: /, '').replace(/;$/, '');
}

/** The type of `spec` on a trace: per-point attributes take style functions and dataset columns. */
function traceTypeOf(spec: Parameters<typeof attr.object>[0][string]): string | undefined {
  const src = generateTraceTypes([{ type: 'bar', schema: attr.object({ a: spec }) }]);
  return propLine(src, 'a')
    ?.replace(/^a\?: /, '')
    .replace(/;$/, '');
}

// Virtual files live next to core's generated files so the default `importFrom`
// ('../schema/types.ts') and relative schema imports resolve against core's sources.
const GENERATED_DIR = decodeURIComponent(
  new URL('../../../../packages/core/src/generated/', import.meta.url).pathname,
);

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts'],
  types: [],
  strict: true,
  noUncheckedIndexedAccess: true,
  verbatimModuleSyntax: true,
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
};

// Parsing the lib files dominates type-check time, so share them across checks.
const sourceFileCache = new Map<string, ts.SourceFile>();

/** Type-check in-memory files (name → source); returns formatted diagnostics for them. */
function typecheck(files: Record<string, string>): string[] {
  const virtual = new Map(Object.entries(files).map(([n, s]) => [GENERATED_DIR + n, s]));
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const { getSourceFile, fileExists, readFile } = host;
  host.fileExists = (f) => virtual.has(f) || fileExists.call(host, f);
  host.readFile = (f) => virtual.get(f) ?? readFile.call(host, f);
  host.getSourceFile = (f, lang, ...rest) => {
    const text = virtual.get(f);
    if (text !== undefined) return ts.createSourceFile(f, text, lang, true);
    const cached = sourceFileCache.get(f);
    if (cached) return cached;
    const sf = getSourceFile.call(host, f, lang, ...rest);
    if (sf) sourceFileCache.set(f, sf);
    return sf;
  };
  const program = ts.createProgram([...virtual.keys()], COMPILER_OPTIONS, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

function syntaxErrors(src: string): readonly ts.Diagnostic[] {
  const out = ts.transpileModule(src, {
    reportDiagnostics: true,
    compilerOptions: COMPILER_OPTIONS,
  });
  return out.diagnostics ?? [];
}

describe('generateTypes leaf mapping', () => {
  it('maps numbers, extras and arrayOk', () => {
    expect(typeOf(attr.number())).toBe('number');
    expect(typeOf(attr.integer({ extras: ['auto', 'normal'] }))).toBe("number | 'auto' | 'normal'");
    expect(typeOf(attr.angle({ arrayOk: true }))).toBe('number | readonly number[] | TypedArray');
  });

  it('maps strings, colors and booleans', () => {
    expect(typeOf(attr.string())).toBe('string');
    expect(typeOf(attr.string({ arrayOk: true }))).toBe('string | readonly string[]');
    expect(typeOf(attr.color())).toBe('string');
    expect(typeOf(attr.color({ arrayOk: true }))).toBe('string | readonly string[]');
    expect(typeOf(attr.boolean())).toBe('boolean');
  });

  it('maps enumerated values to literal unions', () => {
    expect(typeOf(attr.enumerated({ values: ['a', "it's", 3, false] }))).toBe(
      "'a' | 'it\\'s' | 3 | false",
    );
    expect(typeOf(attr.enumerated({ values: ['a', 1], arrayOk: true }))).toBe(
      "'a' | 1 | readonly ('a' | 1)[]",
    );
    expect(typeOf(attr.enumerated({ values: ['a'], arrayOk: true }))).toBe("'a' | readonly 'a'[]");
  });

  it('maps flaglists to every combination of a few flags, else a template, and extras', () => {
    expect(typeOf(attr.flaglist({ flags: ['lines', 'markers'], extras: ['none', false] }))).toBe(
      "'lines' | 'markers' | 'lines+markers' | 'markers+lines' | 'none' | false",
    );
    expect(typeOf(attr.flaglist({ flags: ['a', 'b', 'c'] }))?.split(' | ')).toHaveLength(15);
    expect(typeOf(attr.flaglist({ flags: ['a', 'b', 'c', 'd'] }))).toBe(
      "'a' | 'b' | 'c' | 'd' | `${'a' | 'b' | 'c' | 'd'}+${string}`",
    );
    const inferred = generateTypes(attr.object({ a: attr.flaglist({ flags: ['x', 'y'] }) }), 'T', {
      listedFlags: 0,
    });
    expect(propLine(inferred, 'a')).toBe("a?: 'x' | 'y' | `${'x' | 'y'}+${string}`;");
  });

  it('accepts any string for enumerations extended at runtime', () => {
    const symbol = attr.enumerated({ values: ['circle'], accepts: (v) => typeof v === 'string' });
    expect(typeOf(symbol)).toBe("'circle' | (string & {})");
  });

  it('maps colorlist, colorscale, data_array, any and function', () => {
    // A list of colors, or a colorway name (E17.5).
    expect(typeOf(attr.colorlist())).toBe('readonly string[] | string');
    expect(typeOf(attr.colorscale())).toBe(
      'ColorScale | readonly string[] | readonly (readonly (number | string)[])[]',
    );
    expect(typeOf(attr.dataArray())).toBe('DataArray');
    expect(typeOf(attr.any({ arrayOk: true }))).toBe('unknown');
    expect(typeOf(attr.fn())).toBe('AnyFunction');
  });

  it('maps subplot ids to the base id and numbered ids', () => {
    expect(typeOf(attr.subplotId({ dflt: 'x' }))).toBe("'x' | `x${number}`");
    expect(typeOf(attr.subplotId({ dflt: 'y', extras: ['free', 'paper'] }))).toBe(
      "'y' | `y${number}` | 'free' | 'paper'",
    );
  });

  it('maps info arrays to arrays of their items', () => {
    // Not tuples: a figure built in a variable has `number[]`, not `[number, number]`.
    expect(typeOf(attr.infoArray({ items: [attr.number(), attr.any()] }))).toBe(
      'readonly (number | unknown)[]',
    );
    expect(typeOf(attr.infoArray({ items: attr.number({ extras: ['auto'] }) }))).toBe(
      "readonly (number | 'auto')[]",
    );
    expect(typeOf(attr.infoArray({ items: attr.string() }))).toBe('readonly string[]');
    expect(
      typeOf(attr.infoArray({ items: [attr.number(), attr.string()], freeLength: true })),
    ).toBe('readonly (number | string)[]');
  });

  it('maps per-point and data attributes of traces to style functions and dataset columns', () => {
    expect(traceTypeOf(attr.number({ arrayOk: true }))).toBe('PerPointNumber');
    // Extras are per-point values too (a table cell's `font.weight: ['bold', 400]`).
    expect(traceTypeOf(attr.integer({ extras: ['bold'], arrayOk: true }))).toBe(
      "PerPoint<number | 'bold'> | TypedArray",
    );
    expect(traceTypeOf(attr.color({ arrayOk: true }))).toBe('PerPointColor');
    expect(traceTypeOf(attr.string({ arrayOk: true }))).toBe('PerPoint<string | number>');
    expect(traceTypeOf(attr.enumerated({ values: ['a', 'b'], arrayOk: true }))).toBe(
      "PerPoint<'a' | 'b'>",
    );
    expect(traceTypeOf(attr.dataArray())).toBe('DataColumn');
    expect(traceTypeOf(attr.number())).toBe('number');
  });

  it('imports only the helper types it uses, sorted', () => {
    const src = generateTypes(
      attr.object({ f: attr.fn(), d: attr.dataArray(), n: attr.number({ arrayOk: true }) }),
      'T',
    );
    expect(src).toContain(
      "import type { AnyFunction, DataArray, TypedArray } from '../schema/types.ts';",
    );
    expect(generateTypes(attr.object({ n: attr.number() }), 'T')).not.toContain('import');
  });
});

describe('generateTypes JSDoc', () => {
  it('documents description, range, default, deprecation and since', () => {
    const src = generateTypes(
      attr.object({
        opacity: attr.number({
          min: 0,
          max: 1,
          dflt: 1,
          description: 'Opacity.\nSecond line with */ inside.',
          deprecated: 'Use `alpha`.',
          since: '0.2.0',
        }),
        size: attr.number({ min: 1 }),
        cap: attr.number({ max: 9 }),
      }),
      'T',
    );
    expect(src).toContain(
      [
        '  /**',
        '   * Opacity.',
        '   * Second line with *\\/ inside.',
        '   *',
        '   * Range: 0 – 1',
        '   *',
        '   * @defaultValue `1`',
        '   *',
        '   * @deprecated Use `alpha`.',
        '   *',
        '   * @since 0.2.0',
        '   */',
        '  opacity?: number;',
      ].join('\n'),
    );
    expect(src).toContain('   * Minimum: 1\n   */\n  size?: number;');
    expect(src).toContain('   * Maximum: 9\n   */\n  cap?: number;');
  });

  it('documents containers on the interface and the property', () => {
    const src = generateTypes(
      attr.object({ margin: attr.object({ l: attr.number() }, { description: 'Margins.' }) }),
      'Layout',
      { header: 'Custom header.' },
    );
    expect(src.startsWith('// Custom header.\n')).toBe(true);
    expect(src).toContain('/**\n * Margins.\n */\nexport interface LayoutMargin {');
    expect(src).toContain('export type Layout = {');
    expect(src).toContain('  /**\n   * Margins.\n   */\n  margin?: LayoutMargin;');
  });

  it('omits JSDoc for undocumented attributes', () => {
    const src = generateTypes(attr.object({ n: attr.number() }), 'T');
    expect(src).toContain('export type T = {\n  n?: number;\n};');
  });
});

describe('generateTypes structure', () => {
  it('names nested containers <Parent><PascalKey> and quotes non-identifier keys', () => {
    const src = generateTypes(
      attr.object({
        title: attr.object({ font: attr.object({ size: attr.number() }) }),
        paper_bgcolor: attr.color(),
        'weird-key': attr.object({ a: attr.boolean() }),
      }),
      'Layout',
    );
    expect(src).toContain('export type Layout = {');
    expect(src).toContain('title?: LayoutTitle;');
    expect(src).toContain('export interface LayoutTitle {\n  font?: LayoutTitleFont;\n}');
    expect(src).toContain('export interface LayoutTitleFont {');
    expect(src).toContain('paper_bgcolor?: string;');
    expect(src).toContain("'weird-key'?: LayoutWeirdKey;");
    // Parents come before their nested interfaces.
    expect(src.indexOf('type Layout ')).toBeLessThan(src.indexOf('interface LayoutTitle '));
    expect(src.indexOf('interface LayoutTitle ')).toBeLessThan(
      src.indexOf('interface LayoutTitleFont '),
    );
  });

  it('types numbered subplot containers, then accepts further ones untyped', () => {
    const src = generateTypes(
      attr.object({
        width: attr.number(),
        xaxis: attr.subplotObject('x', { type: attr.enumerated({ values: ['linear', 'log'] }) }),
      }),
      'Layout',
    );
    expect(src).toContain('xaxis?: LayoutXaxis;');
    expect(src).toContain('xaxis2?: LayoutXaxis;');
    expect(src).toContain('xaxis9?: LayoutXaxis;');
    expect(src).not.toContain('xaxis10?');
    // `unknown`, so loose layouts (`Record<string, unknown>`) stay assignable.
    expect(src).toContain('[key: `xaxis${number}`]: unknown;');
    const diagnostics = typecheck({
      '__t_layout.ts': src,
      '__t_use.ts': [
        "import type { Layout } from './__t_layout.ts';",
        "export const ok: Layout = { width: 1, xaxis: { type: 'log' }, xaxis2: { type: 'linear' } };",
        "// @ts-expect-error — 'bad' is not an axis type.",
        "export const bad: Layout = { xaxis3: { type: 'bad' } };",
        '// @ts-expect-error — unknown key.',
        'export const unknownKey: Layout = { yaxis: {} };',
        "export const far: Layout = { xaxis12: { type: 'whatever' } };",
        'export const loose = (l: Record<string, unknown>): Layout => l;',
      ].join('\n'),
    });
    expect(diagnostics).toEqual([]);
  });

  it('maps items nodes to arrays of a named item interface', () => {
    const src = generateTypes(
      attr.object({
        annotations: attr.items(
          { text: attr.string() },
          { itemName: 'annotation', description: 'Text annotations.' },
        ),
      }),
      'Layout',
    );
    expect(src).toContain('annotations?: readonly LayoutAnnotation[];');
    expect(src).toContain('export interface LayoutAnnotation {');
    expect(src).toContain('templateitemname?: string;');
    expect(src).toContain('`annotationdefaults`');
    expect(syntaxErrors(src)).toEqual([]);
  });

  it('emits an exact empty object type for empty containers', () => {
    const src = generateTypes(attr.object({ e: attr.object({}) }), 'T');
    expect(src).toContain('export type TE = Record<string, never>;');
  });

  it('rejects two containers that map to the same interface name', () => {
    const schema = attr.object({ x_axis: attr.object({}), xAxis: attr.object({}) });
    expect(() => generateTypes(schema, 'T')).toThrow(/duplicate interface name 'TXAxis'/);
  });

  it('is deterministic', () => {
    expect(generateTypes(layoutSchema, 'Layout')).toBe(generateTypes(layoutSchema, 'Layout'));
  });
});

describe('generateTraceTypes', () => {
  const traceType = attr.string({ description: 'Trace type.' });
  const scatter = attr.object(
    {
      type: traceType,
      marker: attr.object({ size: attr.number({ arrayOk: true }) }),
    },
    { description: 'Scatter trace.' },
  );
  const bar = attr.object({ type: traceType, base: attr.number() });

  it('emits one type per trace with a literal discriminant and a Data union', () => {
    const src = generateTraceTypes(
      [
        { type: 'scatter', schema: scatter },
        { type: 'bar', schema: bar },
      ],
      { importFrom: '../schema/types.ts' },
    );
    expect(src).toContain('/**\n * Scatter trace.\n */\nexport type ScatterTrace = {');
    expect(src).toContain(
      "  /**\n   * Trace type (the default: a trace without `type` is a scatter trace).\n   */\n  type?: 'scatter';",
    );
    expect(src).toContain('marker?: ScatterTraceMarker;');
    expect(src).toContain('export interface ScatterTraceMarker {');
    expect(src).toContain("type: 'bar';");
    expect(src).toContain('export type Data = ScatterTrace | BarTrace;');
    const diagnostics = typecheck({
      '__t_traces.ts': src,
      '__t_use.ts': [
        "import type { Data } from './__t_traces.ts';",
        "export const data: Data[] = [{ marker: { size: [1, 2] } }, { type: 'bar', base: 1 }];",
        "export function base(d: Data): number | undefined { return d.type === 'bar' ? d.base : undefined; }",
        '// @ts-expect-error — `base` is not a scatter attribute.',
        'export const wrong: Data = { base: 1 };',
      ].join('\n'),
    });
    expect(diagnostics).toEqual([]);
  });

  it('adds the discriminant when the schema has no `type` attribute', () => {
    const src = generateTraceTypes([
      { type: 'heatmap', schema: attr.object({ z: attr.dataArray() }) },
    ]);
    expect(src).toContain(
      "export type HeatmapTrace = {\n  /**\n   * Trace type.\n   */\n  type: 'heatmap';\n  z?: DataColumn;\n};",
    );
  });

  it('types Data as never when no traces are registered', () => {
    expect(generateTraceTypes([])).toContain('export type Data = never;');
  });
});

describe('generated types for the real schemas', () => {
  // Flaglists typed like the DSL infers them (the default lists their combinations, stricter).
  const layout = generateTypes(layoutSchema, 'Layout', { listedFlags: 0 });
  const config = generateTypes(configSchema, 'Config', { listedFlags: 0 });

  it('type-check and accept every input the schema DSL infers', () => {
    const diagnostics = typecheck({
      '__t_layout.ts': layout,
      '__t_config.ts': config,
      '__t_use.ts': [
        "import type { Layout } from './__t_layout.ts';",
        "import type { Config } from './__t_config.ts';",
        "import type { InferInput } from '../schema/types.ts';",
        "import type { layoutSchema } from '../layout/schema.ts';",
        "import type { configSchema } from '../config/schema.ts';",
        "import type { xaxisSchema } from '../layout/schema.ts';",
        "import type { LayoutXaxis } from './__t_layout.ts';",
        // The generated types must be at least as permissive as the inferred input types.
        // `anchor` is excluded: `axisSchema` computes the other letter at runtime, so its inferred
        // type is the wider `'x' | 'y' | ...` while the generated type is exact.
        "type AxisIn = Omit<InferInput<typeof xaxisSchema>, 'anchor'>;",
        "type LayoutIn = Omit<InferInput<typeof layoutSchema>, 'xaxis' | 'yaxis'>;",
        'export const l = (x: LayoutIn): Layout => x;',
        'export const a = (x: AxisIn): LayoutXaxis => x;',
        'export const c = (x: InferInput<typeof configSchema>): Config => x;',
      ].join('\n'),
    });
    expect(diagnostics).toEqual([]);
  });
});

describe('createTypeFile', () => {
  const font = attr.object({ size: attr.number(), color: attr.color() }, { description: 'Font.' });
  const group = { name: attr.string(), opacity: attr.number() };

  it('reuses a container met again, and imports one another file declares', () => {
    const shared = createTypeFile();
    shared.object(attr.object({ font }), 'Shared');
    const known = new Map(
      [...shared.emitted].map(([node, type]) => [node, { ...type, from: './shared.ts' }]),
    );
    const file = createTypeFile({ known });
    file.object(attr.object({ title: attr.object({ font }), legend: attr.object({ font }) }), 'L', {
      alias: true,
    });
    const src = file.render();
    expect(src).toContain("import type { SharedFont } from './shared.ts';");
    expect(src).toContain(
      'export interface LTitle {\n  /**\n   * Font.\n   */\n  font?: SharedFont;\n}',
    );
    expect(src).not.toContain('interface LTitleFont');
  });

  it('builds on bases, leaving out what it declares differently', () => {
    const file = createTypeFile();
    const base = { type: { name: 'Common', from: './common.ts' }, children: group };
    const opacity = attr.number({ description: 'Another opacity.' });
    const schema = attr.object({ ...group, opacity, size: attr.number() });
    file.trace({ type: 'dots', schema, bases: [base] });
    const src = file.render();
    expect(src).toContain("import type { Common } from './common.ts';");
    expect(src).toContain("export type DotsTrace = Omit<Common, 'opacity'> & {");
    expect(src).toContain('  opacity?: number;\n  size?: number;\n};');
    expect(src).not.toContain('name?:');
  });

  it('extends a trace type, aliasing an import that shares a local name', () => {
    const file = createTypeFile();
    const schema = attr.object({ ...group, depth: attr.number() });
    file.trace({
      type: 'bar',
      schema,
      bases: [
        {
          type: { name: 'BarTrace', from: '@scope/holochart-bars' },
          children: group,
          discriminated: true,
        },
      ],
    });
    const src = file.render();
    expect(src).toContain("import type { BarTrace as BarsBarTrace } from '@scope/holochart-bars';");
    expect(src).toContain('export type BarTrace = BarsBarTrace & {\n  depth?: number;\n};');
  });

  it('declares records and aliases, e.g. an extensible map of trace types', () => {
    const file = createTypeFile();
    file.record('TraceTypes', [
      ['bar', 'BarTrace'],
      ['pie', { name: 'PieTrace', from: './pie.ts' }],
    ]);
    file.alias('Data', 'TraceTypes[keyof TraceTypes]');
    const src = file.render();
    expect(src).toContain('export interface TraceTypes {\n  bar: BarTrace;\n  pie: PieTrace;\n}');
    expect(src).toContain('export type Data = TraceTypes[keyof TraceTypes];');
    expect(() => file.alias('Data', 'never')).toThrow(/duplicate/);
  });
});
