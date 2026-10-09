/**
 * Generates the lists of two reference pages and one fundamentals page from the library's own
 * registries and tables, so they cannot go stale:
 *
 * - `reference/colorscales.md`: every named colorscale and qualitative palette, with swatches.
 *   From core's color registries (`colors`, `colorways`) as the full `@mk7s/holochart` bundle
 *   leaves them, grouped by `BUILTIN_COLORSCALE_GROUPS`; the attributes that take a name and the
 *   defaults of a figure come from the bundle's schema and `supplyDefaults`.
 * - `reference/marker-symbols.md`: every marker symbol with its numeric codes and its shape. From
 *   the render package's symbol table (`MARKER_SYMBOLS`, the geometry the GPU draws); the trace
 *   types that take a symbol come from the bundle's schema.
 * - `fundamentals/maps.md`: every `geo.projection.type`. Plotly's, split into the projections that
 *   are in the geo package's initial code and those of its lazy chunk, and Holochart's own type,
 *   the 3D globe, in a table of its own. From the two tables of
 *   `packages/traces-geo/src/geo/constants.ts` (`D3_GEO_PROJECTIONS`,
 *   `D3_GEO_PROJECTION_PROJECTIONS`) and its `GLOBE_PROJECTION`, read from the source file because
 *   the package does not export them; together they are checked against the enumeration of
 *   `projection.type` in the package's schema.
 *
 * Output: the text between the `generated:<region>` markers of the pages, which are checked in.
 * The rest of each page is hand-written. Nothing is written when a page is up to date. The script
 * throws when the registries disagree with each other (a name outside the groups, a group entry
 * that is not what its name resolves to), instead of writing a page that is wrong.
 *
 * Usage: `node --conditions=source scripts/gen-galleries.ts [--check]`. `--check` writes nothing
 * and exits with 1 when a page is out of date.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as prettier from 'prettier';
import * as core from '@mk7s/holochart-core';
import {
  BUILTIN_COLORSCALE_GROUPS,
  BUILTIN_PALETTES,
  colors,
  colorways,
  evenStops,
  toRGBA,
  type ColorscaleInput,
  type ColorscaleKind,
  type ColorscaleStops,
} from '@mk7s/holochart-core';
import { MARKER_SYMBOLS, SYMBOL_VARIANTS, type SymbolDef } from '@mk7s/holochart-render';
import {
  D3_GEO_PROJECTION_PROJECTIONS,
  D3_GEO_PROJECTIONS,
  FITBOUNDS_INCOMPATIBLE,
  GLOBE_PROJECTION,
  LONAXIS_SPAN,
} from '../../../packages/traces-geo/src/geo/constants.ts';
import { compactAttributes, isLeaf, ITEMS, type Tree } from './plotly-compat/schema-tree.ts';

const DOCS_ROOT = fileURLToPath(new URL('..', import.meta.url));
const COLORS_PAGE = 'reference/colorscales.md';
const SYMBOLS_PAGE = 'reference/marker-symbols.md';
const MAPS_PAGE = 'fundamentals/maps.md';

// ---- Markdown and HTML helpers ------------------------------------------------------------------

export function startMarker(region: string): string {
  return `<!-- generated:${region}:start -->`;
}

export function endMarker(region: string): string {
  return `<!-- generated:${region}:end -->`;
}

/** `page` with the text between the markers of `region` replaced by `generated`. */
export function replaceGenerated(page: string, region: string, generated: string): string {
  const start = startMarker(region);
  const end = endMarker(region);
  const from = page.indexOf(start);
  const to = page.indexOf(end);
  if (from < 0 || to < from) throw new Error(`missing the ${start} … ${end} markers`);
  return `${page.slice(0, from + start.length)}\n\n${generated.trim()}\n\n${page.slice(to)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function code(text: string): string {
  return `\`${text}\``;
}

function htmlCode(text: string): string {
  return `<code>${escapeHtml(text)}</code>`;
}

function row(cells: readonly (string | number)[]): string {
  return `| ${cells.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`;
}

/** A Markdown table. */
function table(head: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  return [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
}

/**
 * An HTML table, one row per line and no blank lines, so Markdown keeps it as one HTML block. Used
 * where cells hold swatches or glyphs: Prettier pads Markdown tables to their longest cell.
 */
function htmlTable(head: readonly string[], rows: readonly (readonly string[])[]): string {
  const tr = (cells: readonly string[], tag: string): string =>
    `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  return [
    '<table>',
    `<thead>${tr(head, 'th')}</thead>`,
    '<tbody>',
    ...rows.map((cells) => tr(cells, 'td')),
    '</tbody>',
    '</table>',
  ].join('\n');
}

function list(names: readonly string[]): string {
  return names.map(code).join(', ');
}

// ---- Colors -------------------------------------------------------------------------------------

/** `#rrggbb` (or `rgba()` for translucent colors) of a CSS color, for inline styles. */
export function cssColor(color: string): string {
  const rgba = toRGBA(color);
  if (!rgba) throw new Error(`not a CSS color: ${color}`);
  const [r, g, b] = [rgba[0], rgba[1], rgba[2]].map((v) => Math.round(v * 255));
  if (rgba[3] < 1) return `rgba(${r},${g},${b},${+rgba[3].toFixed(3)})`;
  return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`;
}

/** The CSS gradient of a colorscale: one color stop per stop of the scale. */
export function gradient(stops: ColorscaleStops): string {
  const parts = stops.map(([p, c]) => `${cssColor(c)} ${+(p * 100).toFixed(2)}%`);
  return `linear-gradient(to right,${parts.join(',')})`;
}

/** A colorscale as a bar (`.hc-colorscale` in the theme's `custom.css`). */
export function scaleSwatch(label: string, stops: ColorscaleStops, width?: number): string {
  const size = width === undefined ? '' : `width:${width}px;`;
  return `<span class="hc-colorscale" role="img" aria-label="${escapeHtml(label)}" style="${size}background:${gradient(stops)}"></span>`;
}

/** A palette as a row of color blocks (`.hc-palette`), each titled with the color as written. */
export function paletteSwatch(colorList: readonly string[]): string {
  const chips = colorList.map(
    (c) => `<i style="background:${cssColor(c)}" title="${escapeHtml(c)}"></i>`,
  );
  return `<span class="hc-palette">${chips.join('')}</span>`;
}

function toStops(input: ColorscaleInput): ColorscaleStops {
  return typeof input[0] === 'string'
    ? evenStops(input as readonly string[])
    : (input as ColorscaleStops);
}

function sameStops(a: ColorscaleStops, b: ColorscaleStops): boolean {
  return (
    a.length === b.length &&
    a.every(([p, c], i) => p === b[i]?.[0] && cssColor(c) === cssColor(b[i]?.[1] ?? ''))
  );
}

/**
 * The name under which core exports `value` (a set of colorscales or palettes), so a set can be
 * named as a value: `COLORBREWER_SEQUENTIAL.Blues`. The shortest name when there are several.
 */
export function exportName(value: object): string | undefined {
  return Object.entries(core)
    .filter(([, exported]) => exported === value)
    .map(([name]) => name)
    .sort((a, b) => a.length - b.length)[0];
}

const KINDS: readonly ColorscaleKind[] = ['sequential', 'diverging', 'cyclical'];
/** Width in px of the swatches of the table that shows two scales side by side. */
const SHADOWED_SWATCH_WIDTH = 90;

/** A colorscale name and what it resolves to. */
export interface ScaleEntry {
  name: string;
  /** Group label of the registry (`'plotly.js'`, `'cmocean'`, …). */
  source: string;
  kind: ColorscaleKind;
  stops: ColorscaleStops;
}

/** A built-in list whose name resolves to an earlier group's scale. */
export interface ShadowedEntry {
  /** Name of the list in its own group. */
  name: string;
  source: string;
  /** The value to use for this list, e.g. `COLORBREWER_SEQUENTIAL.Blues`, when it is exported. */
  value: string | undefined;
  stops: ColorscaleStops;
  /** What the name resolves to instead. */
  winner: ScaleEntry;
}

export interface PaletteEntry {
  name: string;
  colors: readonly string[];
}

/** Everything the colorscales page shows. */
export interface ColorsModel {
  scales: ScaleEntry[];
  shadowed: ShadowedEntry[];
  /** Names that resolve before anything is registered (in every bundle), as registered. */
  alwaysScales: string[];
  palettes: PaletteEntry[];
  alwaysPalettes: string[];
  /** Exported names of the colorscale sets that are registered on demand, and of the palettes. */
  sets: { scales: string[]; palettes: string };
  /** Attribute paths that take a colorscale, with the trace types (or `layout`) that have them. */
  scaleAttributes: Map<string, string[]>;
  /** Layout attributes that take a list of colors or a palette name. */
  paletteAttributes: string[];
  defaults: {
    template: string;
    colorway: readonly string[];
    scales: [string, ColorscaleStops][];
  };
}

/** The names that resolve right now: call before the full bundle is imported. */
export function registeredColorNames(): { scales: string[]; palettes: string[] } {
  return { scales: colors.names(), palettes: colorways.names() };
}

/**
 * The colorscales and palettes of the registries in their current state, in the order and groups
 * of `BUILTIN_COLORSCALE_GROUPS`. Throws when the groups and the registry disagree.
 */
export function colorScales(): { scales: ScaleEntry[]; shadowed: ShadowedEntry[] } {
  const scales: ScaleEntry[] = [];
  const shadowed: ShadowedEntry[] = [];
  const byKey = new Map<string, ScaleEntry>();
  for (const group of BUILTIN_COLORSCALE_GROUPS) {
    if (!KINDS.includes(group.kind)) throw new Error(`unknown colorscale kind ${group.kind}`);
    for (const [name, input] of Object.entries(group.scales)) {
      const key = name.toLowerCase();
      const winner = byKey.get(key);
      if (winner) {
        const record = exportName(group.scales);
        shadowed.push({
          name,
          source: group.source,
          value: record === undefined ? undefined : `${record}.${name}`,
          stops: toStops(input),
          winner,
        });
        continue;
      }
      const stops = colors.get(name);
      if (!stops) throw new Error(`colorscale ${name} is in a built-in group but does not resolve`);
      if (!sameStops(stops, toStops(input))) {
        throw new Error(`colorscale ${name} does not resolve to its ${group.source} definition`);
      }
      const entry = { name, source: group.source, kind: group.kind, stops };
      byKey.set(key, entry);
      scales.push(entry);
    }
  }
  const registered = colors.names();
  const unlisted = registered.filter((name) => byKey.get(name.toLowerCase())?.name !== name);
  if (unlisted.length > 0 || registered.length !== scales.length) {
    throw new Error(
      `the colorscale registry and BUILTIN_COLORSCALE_GROUPS disagree: ${unlisted.join(', ')}`,
    );
  }
  return { scales, shadowed };
}

/**
 * The exported sets behind the names that are not always registered. Throws when a group of the
 * registry is not exported, since the page tells readers to register sets by these names.
 */
export function colorSets(always: readonly string[]): ColorsModel['sets'] {
  const scales: string[] = [];
  const resolves = new Set(always.map((name) => name.toLowerCase()));
  for (const group of BUILTIN_COLORSCALE_GROUPS) {
    if (Object.keys(group.scales).every((name) => resolves.has(name.toLowerCase()))) continue;
    const name = exportName(group.scales);
    if (name === undefined) {
      throw new Error(`the ${group.source} ${group.kind} colorscales are not exported from core`);
    }
    scales.push(name);
  }
  const palettes = exportName(BUILTIN_PALETTES);
  if (palettes === undefined) throw new Error('the palettes are not exported from core');
  return { scales, palettes };
}

/** The registered palettes. Throws when they are not exactly `BUILTIN_PALETTES`. */
export function colorPalettes(): PaletteEntry[] {
  const names = colorways.names();
  const builtin = Object.keys(BUILTIN_PALETTES);
  if (names.length !== builtin.length || builtin.some((name) => !names.includes(name))) {
    throw new Error('the colorway registry and BUILTIN_PALETTES disagree');
  }
  return builtin.map((name) => {
    const list = colorways.get(name);
    if (!list) throw new Error(`palette ${name} does not resolve`);
    return { name, colors: list };
  });
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function renderColorsSummary(model: ColorsModel): string {
  const perKind = KINDS.map(
    (kind) => `${model.scales.filter((s) => s.kind === kind).length} ${kind}`,
  );
  return [
    `Holochart has **${model.scales.length}** named colorscales (${perKind.join(', ')}) and ` +
      `**${model.palettes.length}** qualitative palettes.`,
  ].join('\n');
}

export function renderColorsBundles(model: ColorsModel): string {
  return [
    `- ${count(model.alwaysScales.length, 'colorscale')}: ${list(model.alwaysScales)}`,
    `- ${count(model.alwaysPalettes.length, 'palette')}: ${list(model.alwaysPalettes)}`,
  ].join('\n');
}

export function renderColorsSets(model: ColorsModel): string {
  return (
    `The sets that add colorscale names are ${list(model.sets.scales)}, and the palettes are in ` +
    `${code(model.sets.palettes)}. All of them are exported by ${code('@mk7s/holochart')} too.`
  );
}

export function renderColorsAttributes(model: ColorsModel): string {
  const owner = (types: readonly string[]): string =>
    types
      .map((type) => (type === 'layout' ? 'The layout' : `[${code(type)}](/reference/${type})`))
      .join(', ');
  return [
    table(
      ['Attribute', 'In'],
      [...model.scaleAttributes].map(([attribute, types]) => [code(attribute), owner(types)]),
    ),
    '',
    `A palette name works in these layout attributes: ${list(model.paletteAttributes)}.`,
  ].join('\n');
}

export function renderColorsGallery(model: ColorsModel): string {
  const out: string[] = [];
  for (const kind of KINDS) {
    const scales = model.scales.filter((s) => s.kind === kind);
    out.push(
      `## ${kind[0]?.toUpperCase()}${kind.slice(1)} colorscales`,
      '',
      htmlTable(
        ['Name', 'Source', 'Scale'],
        scales.map((s) => [htmlCode(s.name), escapeHtml(s.source), scaleSwatch(s.name, s.stops)]),
      ),
      '',
    );
  }
  if (model.shadowed.length > 0) {
    out.push(
      '## Names with two definitions',
      '',
      `${count(model.shadowed.length, 'list')} of the built-in sets share a name (ignoring case) ` +
        'with a scale that comes earlier in the registry. The name keeps the earlier meaning; ' +
        'the other list is exported as a value.',
      '',
      htmlTable(
        ['Name', 'Resolves to', '', 'Other list', ''],
        model.shadowed.map((s) => [
          htmlCode(s.winner.name),
          escapeHtml(s.winner.source),
          scaleSwatch(
            `${s.winner.name} (${s.winner.source})`,
            s.winner.stops,
            SHADOWED_SWATCH_WIDTH,
          ),
          s.value === undefined ? escapeHtml(s.source) : htmlCode(s.value),
          scaleSwatch(`${s.name} (${s.source})`, s.stops, SHADOWED_SWATCH_WIDTH),
        ]),
      ),
      '',
    );
  }
  out.push(
    '## Qualitative palettes',
    '',
    htmlTable(
      ['Name', 'Colors', 'Palette'],
      model.palettes.map((p) => [
        htmlCode(p.name),
        String(p.colors.length),
        paletteSwatch(p.colors),
      ]),
    ),
    '',
    '## Defaults',
    '',
    `A figure that sets neither \`layout.template\` nor these attributes gets them from the ` +
      `${code(model.defaults.template)} template:`,
    '',
    htmlTable(
      ['Attribute', 'Default'],
      [
        [htmlCode('layout.colorway'), paletteSwatch(model.defaults.colorway)],
        ...model.defaults.scales.map(([key, stops]) => [
          htmlCode(`layout.colorscale.${key}`),
          scaleSwatch(`layout.colorscale.${key}`, stops),
        ]),
      ],
    ),
    '',
  );
  return out.join('\n');
}

// ---- Marker symbols -----------------------------------------------------------------------------

/** A `symbol` attribute of a trace type that takes names from the symbol table. */
export interface SymbolAttribute {
  type: string;
  path: string;
  /** Symbol names the attribute accepts, in schema order. */
  names: string[];
  /** Whether it also accepts numeric codes. */
  codes: boolean;
  /** Whether it takes one symbol per point. */
  perPoint: boolean;
  /** Whether it also accepts custom symbols: registered names and `text:` glyphs. */
  custom: boolean;
}

export interface SymbolsModel {
  symbols: readonly SymbolDef[];
  variants: readonly string[];
  attributes: SymbolAttribute[];
}

function num(v: number): string {
  return String(+v.toFixed(3));
}

/**
 * The shape of a symbol as an inline SVG, from the geometry the renderer uploads to the GPU: the
 * filled area (a unit circle or an even-odd polygon) and the stroked segments, in units of the
 * marker radius with y up. Every symbol is drawn at the same scale.
 */
export function symbolSvg(def: SymbolDef): string {
  const shapes: string[] = [];
  if (def.area === 'circle') shapes.push('<circle r="1"/>');
  else if (def.area) {
    const d = def.area.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${num(x)} ${num(-y)}`).join('');
    shapes.push(`<path d="${d}Z" fill-rule="evenodd"/>`);
  }
  if (def.segments.length > 0) {
    const d = def.segments
      .map(([x0, y0, x1, y1]) => `M${num(x0)} ${num(-y0)}L${num(x1)} ${num(-y1)}`)
      .join('');
    shapes.push(`<path d="${d}" fill="none"/>`);
  }
  return (
    `<svg class="hc-symbol" role="img" aria-label="${escapeHtml(def.name)}" width="28" height="28" ` +
    `viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" ` +
    `stroke-width="0.2" stroke-linejoin="round">${shapes.join('')}</svg>`
  );
}

/** Every name of the symbol table: each base name with each variant suffix. */
export function symbolNames(model: Pick<SymbolsModel, 'symbols' | 'variants'>): string[] {
  return model.symbols.flatMap((def) => model.variants.map((suffix) => def.name + suffix));
}

export function renderSymbolsSummary(model: SymbolsModel): string {
  const n = model.symbols.length;
  const suffixes = model.variants.filter((suffix) => suffix !== '');
  const last = model.symbols[n - 1];
  return [
    `Holochart has **${n}** marker symbols. Each has ${model.variants.length} variants, the plain ` +
      `symbol and ${list(suffixes)}, which makes **${n * model.variants.length}** names.`,
    '',
    `Every name also has a numeric code. The plain symbols are numbered 0 to ${n - 1} in the ` +
      `order of the table below, and each variant adds 100: ` +
      model.variants
        .map((suffix, v) => `${code(`${last?.name}${suffix}`)} is ${(last?.code ?? 0) + 100 * v}`)
        .join(', ') +
      '.',
  ].join('\n');
}

export function renderSymbolsTraces(model: SymbolsModel): string {
  const all = symbolNames(model);
  const groups = new Map<string, { attribute: SymbolAttribute; types: string[] }>();
  for (const attribute of model.attributes) {
    const { type: _type, ...rest } = attribute;
    const key = JSON.stringify(rest);
    const group = groups.get(key) ?? { attribute, types: [] };
    group.types.push(attribute.type);
    groups.set(key, group);
  }
  return table(
    ['Trace types', 'Attribute', 'Symbols', 'Numeric codes', 'One per point', 'Custom symbols'],
    [...groups.values()].map(({ attribute, types }) => {
      const complete =
        attribute.names.length === all.length && all.every((n) => attribute.names.includes(n));
      return [
        types.map((type) => `[${code(type)}](/reference/${type})`).join(', '),
        code(attribute.path),
        complete
          ? `All ${all.length} names`
          : `${attribute.names.length}: ${list(attribute.names)}`,
        attribute.codes ? 'Yes' : 'No',
        attribute.perPoint ? 'Yes' : 'No',
        attribute.custom ? 'Yes' : 'No',
      ];
    }),
  );
}

export function renderSymbolsTable(model: SymbolsModel): string {
  const suffixes = model.variants.filter((suffix) => suffix !== '');
  return htmlTable(
    ['Shape', 'Name', 'Code', ...suffixes.map(htmlCode), 'Notes'],
    model.symbols.map((def) => [
      symbolSvg(def),
      htmlCode(def.name),
      String(def.code),
      ...suffixes.map((suffix) => String(def.code + 100 * model.variants.indexOf(suffix))),
      [def.noFill ? 'Line only' : '', def.noDot ? 'No dot' : ''].filter(Boolean).join(', '),
    ]),
  );
}

// ---- Map projections ----------------------------------------------------------------------------

/** One `geo.projection.type`. */
export interface ProjectionEntry {
  /** The value of `projection.type`: Plotly's as Plotly spells them, and Holochart's own. */
  name: string;
  /** The d3 factory that draws it (`geoMercator`); of the globe, the factory of its view. */
  factory: string;
  /** What a drag does on a world map of this type (`GeoView.mode` of the geo package). */
  drag: 'pans' | 'turns in longitude, moves up and down' | 'turns in longitude and latitude';
  /** Whether `fitbounds` can fit it. */
  fitbounds: boolean;
}

export interface ProjectionsModel {
  /** The projections of `d3-geo`, in the geo package's initial code. */
  builtin: ProjectionEntry[];
  /** The projections of `d3-geo-projection`, in the package's lazy chunk. */
  lazy: ProjectionEntry[];
  /**
   * Holochart's own types, which are not Plotly's and in neither table: the 3D globe
   * (`GLOBE_PROJECTION`).
   */
  extra: ProjectionEntry[];
}

/** The Plotly type whose view (rotation, scale, drag, fit) the 3D globe has. */
const GLOBE_VIEW = 'orthographic' satisfies keyof typeof D3_GEO_PROJECTIONS;

/**
 * The two projection tables of the geo package as rows, and the globe as a row of its own. A world
 * map of a type with a longitude span of its own (`LONAXIS_SPAN`, Plotly's clipped projections and
 * the globe) turns both ways under a drag; Albers USA is always the scoped map of the United
 * States, which pans.
 */
export function projectionsModel(): ProjectionsModel {
  const entries = (tableOf: Readonly<Record<string, string>>): ProjectionEntry[] =>
    Object.entries(tableOf)
      .map(([name, factory]) => ({
        name,
        factory,
        drag:
          name === 'albers usa'
            ? ('pans' as const)
            : Object.hasOwn(LONAXIS_SPAN, name)
              ? ('turns in longitude and latitude' as const)
              : ('turns in longitude, moves up and down' as const),
        fitbounds: !FITBOUNDS_INCOMPATIBLE.has(name),
      }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
  return {
    builtin: entries(D3_GEO_PROJECTIONS),
    lazy: entries(D3_GEO_PROJECTION_PROJECTIONS),
    extra: entries({ [GLOBE_PROJECTION]: D3_GEO_PROJECTIONS[GLOBE_VIEW] }),
  };
}

/** Distinct projections among `entries`: two names can share a factory (`winkel3`). */
function distinct(entries: readonly ProjectionEntry[]): number {
  return new Set(entries.map((e) => e.factory)).size;
}

function projectionsTable(entries: readonly ProjectionEntry[]): string {
  return table(
    ['`projection.type`', 'd3 projection', 'A drag on a world map', '`fitbounds`'],
    entries.map((e) => [code(e.name), code(e.factory), e.drag, e.fitbounds ? 'Yes' : 'No']),
  );
}

export function renderProjectionsSummary(model: ProjectionsModel): string {
  const all = [...model.builtin, ...model.lazy];
  const extras = model.extra.map((e) => code(e.name)).join(', ');
  return (
    `\`projection.type\` takes Plotly's **${all.length}** names (${distinct(all)} projections: ` +
    `${all.length - distinct(all)} are second names of another). ` +
    `**${model.builtin.length}** are in the package's own code and **${model.lazy.length}** in ` +
    `its lazy chunk. It also takes ${extras}, a [Holochart extra](#holochart-extra) that is not ` +
    'a Plotly projection.'
  );
}

export function renderProjectionsBuiltin(model: ProjectionsModel): string {
  return projectionsTable(model.builtin);
}

export function renderProjectionsLazy(model: ProjectionsModel): string {
  return projectionsTable(model.lazy);
}

/**
 * Holochart's own types. The second column is the Plotly type whose view the type has, not a d3
 * projection: the globe is not drawn by one.
 */
export function renderProjectionsExtra(model: ProjectionsModel): string {
  return table(
    ['`projection.type`', 'Its view is that of', 'A drag on a world map', '`fitbounds`'],
    model.extra.map((e) => [code(e.name), code(GLOBE_VIEW), e.drag, e.fitbounds ? 'Yes' : 'No']),
  );
}

/**
 * Throws unless the two tables of Plotly's names and Holochart's own types are together exactly
 * the values the schema of `geo.projection.type` accepts, each once (the full bundle does not
 * register the geo package, so its schema comes from the geo entry).
 */
export function checkProjections(model: ProjectionsModel, schemaValues: readonly unknown[]): void {
  const listed = [...model.builtin, ...model.lazy, ...model.extra].map((e) => e.name).sort();
  const accepted = schemaValues.map(String).sort();
  if (listed.length !== accepted.length || listed.some((name, i) => name !== accepted[i])) {
    throw new Error('the projection tables and the schema of geo.projection.type disagree');
  }
}

// ---- The full bundle: schema and defaults -------------------------------------------------------

type Bundle = typeof import('@mk7s/holochart');

/** Leaf attributes of a compact schema tree by path (`marker.line.color`, `shapes[].line.dash`). */
function leaves(tree: Tree, prefix = '', out = new Map<string, Tree>()): Map<string, Tree> {
  if (isLeaf(tree)) {
    out.set(prefix, tree);
    return out;
  }
  for (const [key, child] of Object.entries(tree)) {
    leaves(child, key === ITEMS ? `${prefix}[]` : prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

/**
 * Whether the attribute at `attributePath` of a trace schema accepts a custom symbol besides its
 * listed values (the `accepts` predicate of the schema, which the JSON schema leaves out).
 */
function acceptsCustomSymbols(schema: unknown, attributePath: string): boolean {
  let node = schema as { children?: Record<string, unknown> } | undefined;
  for (const key of attributePath.split('.')) {
    node = node?.children?.[key] as typeof node;
  }
  const accepts = (node as { accepts?: (value: unknown) => boolean } | undefined)?.accepts;
  return accepts?.('text:x') === true;
}

function schemaFacts(bundle: Bundle): {
  scaleAttributes: Map<string, string[]>;
  paletteAttributes: string[];
  symbolAttributes: SymbolAttribute[];
} {
  const schema = bundle.plotSchema(bundle.registry.core);
  const known = new Set(MARKER_SYMBOLS.map((def) => def.name));
  const scaleAttributes = new Map<string, string[]>();
  const symbolAttributes: SymbolAttribute[] = [];
  for (const [type, trace] of Object.entries(schema.traces)) {
    for (const [attribute, leaf] of leaves(compactAttributes(trace.attributes))) {
      if (!isLeaf(leaf)) continue;
      if (leaf.t === 'colorscale') {
        scaleAttributes.set(attribute, [...(scaleAttributes.get(attribute) ?? []), type]);
      }
      if (/(^|\.)symbol$/.test(attribute) && leaf.t === 'enumerated') {
        const values = leaf.v ?? [];
        const names = values.filter(
          (v): v is string => typeof v === 'string' && !Number.isFinite(Number(v)),
        );
        // Only attributes that name symbols of the table (not, say, an indicator's delta symbol).
        if (!names.some((name) => known.has(name))) continue;
        symbolAttributes.push({
          type,
          path: attribute,
          names,
          codes: values.some((v) => typeof v === 'number'),
          perPoint: leaf.a === true,
          custom: acceptsCustomSymbols(bundle.registry.core.getTraceSchema(type), attribute),
        });
      }
    }
  }
  const paletteAttributes: string[] = [];
  for (const [attribute, leaf] of leaves(compactAttributes(schema.layout.attributes))) {
    if (!isLeaf(leaf)) continue;
    if (leaf.t === 'colorscale') scaleAttributes.set(`layout.${attribute}`, ['layout']);
    if (leaf.t === 'colorlist') paletteAttributes.push(`layout.${attribute}`);
  }
  return { scaleAttributes, paletteAttributes, symbolAttributes };
}

/** What a figure without a template gets for its colorway and automatic colorscales. */
function colorDefaults(bundle: Bundle): ColorsModel['defaults'] {
  const template = bundle.registry.list().defaultTemplate;
  if (template === undefined) throw new Error('the full bundle has no default template');
  // A trace with numeric colors, so the layout's automatic colorscales are part of the defaults.
  const figure = { data: [{ type: 'scatter', y: [1, 2], marker: { color: [1, 2] } }], layout: {} };
  const { fullLayout } = bundle.supplyDefaults(figure, bundle.registry.core, { validate: false });
  const layout = fullLayout as unknown as {
    colorway?: readonly string[];
    colorscale?: Record<string, ColorscaleInput>;
  };
  if (!layout.colorway || !layout.colorscale) {
    throw new Error('the default layout has no colorway or no automatic colorscales');
  }
  return {
    template,
    colorway: layout.colorway,
    scales: Object.entries(layout.colorscale).map(([key, scale]) => [key, toStops(scale)]),
  };
}

// ---- Pages --------------------------------------------------------------------------------------

/** The generated regions of each page, by page path and region name. */
export function renderPages(
  colorsModel: ColorsModel,
  symbolsModel: SymbolsModel,
  projections: ProjectionsModel,
) {
  return {
    [COLORS_PAGE]: {
      'colors-summary': renderColorsSummary(colorsModel),
      'colors-attributes': renderColorsAttributes(colorsModel),
      'colors-bundles': renderColorsBundles(colorsModel),
      'colors-sets': renderColorsSets(colorsModel),
      'colors-gallery': renderColorsGallery(colorsModel),
    },
    [SYMBOLS_PAGE]: {
      'symbols-summary': renderSymbolsSummary(symbolsModel),
      'symbols-traces': renderSymbolsTraces(symbolsModel),
      'symbols-table': renderSymbolsTable(symbolsModel),
    },
    [MAPS_PAGE]: {
      'geo-projections-summary': renderProjectionsSummary(projections),
      'geo-projections-builtin': renderProjectionsBuiltin(projections),
      'geo-projections-lazy': renderProjectionsLazy(projections),
      'geo-projections-extra': renderProjectionsExtra(projections),
    },
  } satisfies Record<string, Record<string, string>>;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });

  // Before the full bundle is loaded, the registries hold what every bundle has.
  const always = registeredColorNames();
  // Loading the full bundle registers its trace types, templates, colorscales and palettes.
  const bundle = await import('@mk7s/holochart');
  const facts = schemaFacts(bundle);
  const colorsModel: ColorsModel = {
    ...colorScales(),
    alwaysScales: always.scales,
    palettes: colorPalettes(),
    alwaysPalettes: always.palettes,
    sets: colorSets(always.scales),
    scaleAttributes: facts.scaleAttributes,
    paletteAttributes: facts.paletteAttributes,
    defaults: colorDefaults(bundle),
  };
  // The page says the full bundle exports the sets too.
  for (const name of [...colorsModel.sets.scales, colorsModel.sets.palettes]) {
    if (!(name in bundle)) throw new Error(`@mk7s/holochart does not export ${name}`);
  }
  const symbolsModel: SymbolsModel = {
    symbols: MARKER_SYMBOLS,
    variants: SYMBOL_VARIANTS,
    attributes: facts.symbolAttributes,
  };

  const projections = projectionsModel();
  // The geo entry of the bundle re-exports the geo package, with the schema of `layout.geo`.
  const geo = await import('@mk7s/holochart/geo');
  checkProjections(projections, geo.geoAttributes.children.projection.children.type.values ?? []);

  // Render every page before writing any, so a failure leaves the pages as they were.
  const pages: { file: string; current: string; next: string }[] = [];
  for (const [page, regions] of Object.entries(
    renderPages(colorsModel, symbolsModel, projections),
  )) {
    const file = path.join(DOCS_ROOT, page);
    const current = await readFile(file, 'utf8');
    let next = current;
    for (const [region, generated] of Object.entries(regions)) {
      try {
        next = replaceGenerated(next, region, generated);
      } catch (error) {
        throw new Error(`${page}: ${(error as Error).message}`, { cause: error });
      }
    }
    const config = (await prettier.resolveConfig(file)) ?? {};
    pages.push({ file, current, next: await prettier.format(next, { ...config, filepath: file }) });
  }

  const stale: string[] = [];
  for (const { file, current, next } of pages) {
    const rel = path.relative(process.cwd(), file);
    if (next === current) {
      console.log(`galleries: ${rel} is up to date`);
    } else if (values.check) {
      stale.push(rel);
    } else {
      await writeFile(file, next);
      console.log(`galleries: wrote ${rel}`);
    }
  }
  console.log(
    `galleries: ${colorsModel.scales.length} colorscales, ${colorsModel.palettes.length} palettes, ` +
      `${symbolsModel.symbols.length} symbols, ` +
      `${projections.builtin.length + projections.lazy.length} projections of Plotly's, ` +
      `${projections.extra.length} of Holochart's own`,
  );
  if (stale.length > 0) {
    console.error(
      `${stale.join(', ')} ${stale.length === 1 ? 'is' : 'are'} out of date: run ` +
        '`pnpm --filter @mk7s/holochart-docs gen:galleries`',
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
