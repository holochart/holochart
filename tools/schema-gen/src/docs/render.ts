/**
 * Renders attribute reference pages (plan E19.3) from `plot-schema.json` data: one Markdown page
 * per trace type, plus layout and config. Pure string building; formatting and file I/O live in
 * `generate-docs.ts` and `cli.ts`.
 *
 * Pages are VitePress Markdown. Attribute headings are emitted as raw HTML so their ids are the
 * attribute paths themselves (`#marker.line.width`), which VitePress's slugger would otherwise
 * rewrite. The body is wrapped in `<div v-pre>` so `{{ … }}` in descriptions is never compiled as a
 * Vue interpolation.
 */
import type { JSONSchemaNode, PlotSchema } from '@mk7s/holochart-core';

/** Keys of a JSON schema node that are metadata, not child attributes. */
const META_KEYS = new Set([
  'valType',
  'role',
  'editType',
  'description',
  'examples',
  'since',
  'deprecated',
  'plotlyPath',
  'animatable',
  'subplot',
  'itemName',
]);

/** One attribute or container in a flattened schema tree. */
export interface AttributeEntry {
  /** Full path, e.g. `marker.line.width` or `annotations[].text`. Also the anchor id. */
  path: string;
  /** Last path segment. */
  key: string;
  /** 0 for top-level attributes. */
  depth: number;
  kind: 'attr' | 'object' | 'items';
  node: JSONSchemaNode;
  /** Effective edit type (declared or inherited from the nearest ancestor). */
  editType: string;
  editTypeInherited: boolean;
  children: AttributeEntry[];
}

function isPlainObject(v: unknown): v is JSONSchemaNode {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function kindOf(node: JSONSchemaNode): AttributeEntry['kind'] | undefined {
  if (typeof node['valType'] === 'string') return 'attr';
  if (node['role'] === 'object') return 'object';
  if (node['role'] === 'items') return 'items';
  return undefined;
}

/** Child attribute nodes of a container node, in declaration order. */
function childNodes(node: JSONSchemaNode): [string, JSONSchemaNode][] {
  const kind = kindOf(node);
  if (kind === 'items') {
    // An items node has exactly one child: the item object. Its children are the item's fields.
    const item = node['items'];
    return isPlainObject(item) ? childNodes(item) : [];
  }
  if (kind !== 'object') return [];
  const out: [string, JSONSchemaNode][] = [];
  for (const [k, v] of Object.entries(node)) {
    if (META_KEYS.has(k) || !isPlainObject(v) || kindOf(v) === undefined) continue;
    out.push([k, v]);
  }
  return out;
}

/**
 * Flatten a schema tree into nested entries with full paths and effective edit types. The root
 * itself is not included.
 *
 * @param root - A container node (`attributes` of a trace, layout or config).
 * @param rootEditType - Edit type the root inherits when it declares none (the planner's `calc`).
 */
export function flattenAttributes(root: JSONSchemaNode, rootEditType = 'calc'): AttributeEntry[] {
  const inherited = typeof root['editType'] === 'string' ? root['editType'] : rootEditType;
  const walk = (
    node: JSONSchemaNode,
    prefix: string,
    depth: number,
    parentEdit: string,
  ): AttributeEntry[] =>
    childNodes(node).map(([key, child]) => {
      const kind = kindOf(child) as AttributeEntry['kind'];
      const path = prefix ? `${prefix}.${key}` : key;
      const declared = typeof child['editType'] === 'string' ? child['editType'] : undefined;
      const editType = declared ?? parentEdit;
      const childPrefix = kind === 'items' ? `${path}[]` : path;
      return {
        path,
        key,
        depth,
        kind,
        node: child,
        editType,
        editTypeInherited: declared === undefined,
        children: kind === 'attr' ? [] : walk(child, childPrefix, depth + 1, editType),
      };
    });
  return walk(root, '', 0, inherited);
}

/** Depth-first list of every entry in a flattened tree. */
export function allEntries(entries: readonly AttributeEntry[]): AttributeEntry[] {
  return entries.flatMap((e) => [e, ...allEntries(e.children)]);
}

// ---------------------------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------------------------

/** Escape text for HTML attribute values and element content. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Make schema Markdown safe to embed: `<` outside code spans becomes `&lt;` so stray angle brackets
 * (`Array<number>`, `<br>`) can't open HTML tags that break the Vue template compiler.
 */
export function sanitizeMarkdown(md: string): string {
  return md
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/</g, '&lt;')))
    .join('');
}

/** Inline-code literal for a value, e.g. `"circle"`, `6`, `[0, 1]`. */
function literal(v: unknown): string {
  const s = JSON.stringify(v);
  const text = s === undefined ? String(v) : s.replace(/,(?=\S)/g, ', ');
  // Inline code can't contain a backtick run of the same length as its fence; values never do in
  // practice, but use a double fence when they do.
  return text.includes('`') ? `\`\` ${text} \`\`` : `\`${text}\``;
}

function literalList(values: readonly unknown[], sep = ', '): string {
  return values.map(literal).join(sep);
}

/** Human-readable type summary for a leaf attribute. */
export function describeType(node: JSONSchemaNode): string {
  const valType = String(node['valType']);
  const min = typeof node['min'] === 'number' ? node['min'] : undefined;
  const max = typeof node['max'] === 'number' ? node['max'] : undefined;
  const extras = Array.isArray(node['extras']) ? node['extras'] : [];
  const parts: string[] = [];
  switch (valType) {
    case 'number':
    case 'integer':
    case 'angle': {
      let s = `\`${valType}\``;
      if (min !== undefined && max !== undefined) s += ` from ${min} to ${max}`;
      else if (min !== undefined) s += ` ≥ ${min}`;
      else if (max !== undefined) s += ` ≤ ${max}`;
      if (valType === 'angle') s += ' (degrees)';
      if (node['clamp'] === true) s += ', clamped to range';
      parts.push(s);
      break;
    }
    case 'string':
      parts.push(node['noBlank'] === true ? '`string` (non-empty)' : '`string`');
      break;
    case 'enumerated':
      parts.push('`enumerated`');
      break;
    case 'flaglist':
      parts.push('`flaglist`');
      break;
    case 'subplotid':
      parts.push(
        typeof node['dflt'] === 'string'
          ? `\`subplotid\` (\`${node['dflt']}\`, \`${node['dflt']}2\`, \`${node['dflt']}3\`, …)`
          : '`subplotid`',
      );
      break;
    case 'data_array':
      parts.push('`data_array` (array or typed array)');
      break;
    case 'info_array': {
      const items = node['items'];
      const itemTypes = Array.isArray(items)
        ? items.map((it) => (isPlainObject(it) ? String(it['valType']) : '?'))
        : isPlainObject(items)
          ? [`${String(items['valType'])}, …`]
          : [];
      parts.push(`\`info_array\` \`[${itemTypes.join(', ')}]\``);
      if (node['freeLength'] === true) parts.push('any length');
      break;
    }
    case 'function':
      parts.push('`function` (not serializable)');
      break;
    default:
      parts.push(`\`${valType}\``);
  }
  if (extras.length > 0 && valType !== 'flaglist' && valType !== 'subplotid') {
    parts.push(`or ${literalList(extras, ' | ')}`);
  }
  return parts.join(', ');
}

/** Property rows (label, Markdown value) shown under a leaf attribute. */
export function attributeFacts(entry: AttributeEntry): [string, string][] {
  const n = entry.node;
  const rows: [string, string][] = [['Type', describeType(n)]];
  if (Array.isArray(n['values'])) rows.push(['Values', literalList(n['values'], ' | ')]);
  if (Array.isArray(n['flags'])) {
    rows.push(['Flags', `${literalList(n['flags'])} (combine with \`+\`)`]);
  }
  if (Array.isArray(n['extras']) && (n['valType'] === 'flaglist' || n['valType'] === 'subplotid')) {
    rows.push(['Also accepts', literalList(n['extras'], ' | ')]);
  }
  rows.push(['Default', 'dflt' in n ? literal(n['dflt']) : 'none']);
  rows.push(['Array OK', n['arrayOk'] === true ? 'yes (one value per point)' : 'no']);
  rows.push(['Edit type', `\`${entry.editType}\`${entry.editTypeInherited ? ' (inherited)' : ''}`]);
  rows.push(['Animatable', n['animatable'] === true ? 'yes' : 'no']);
  if (typeof n['plotlyPath'] === 'string') rows.push(['Plotly path', `\`${n['plotlyPath']}\``]);
  if (typeof n['since'] === 'string') rows.push(['Since', `\`${n['since']}\``]);
  if (Array.isArray(n['examples']) && n['examples'].length > 0) {
    rows.push(['Examples', literalList(n['examples'])]);
  }
  return rows;
}

/** Facts shown under a container (object or items) heading. */
function containerFacts(entry: AttributeEntry): [string, string][] {
  const n = entry.node;
  const rows: [string, string][] = [];
  if (entry.kind === 'items') {
    const itemName = typeof n['itemName'] === 'string' ? n['itemName'] : 'item';
    rows.push([
      'Type',
      `array of \`${itemName}\` objects; template defaults for every item go in \`${itemName}defaults\``,
    ]);
  } else {
    rows.push(['Type', 'object']);
  }
  if (typeof n['subplot'] === 'string') {
    rows.push([
      'Subplots',
      `also \`${entry.key}2\`, \`${entry.key}3\`, … for subplot ids \`${n['subplot']}2\`, \`${n['subplot']}3\`, …`,
    ]);
  }
  rows.push(['Edit type', `\`${entry.editType}\`${entry.editTypeInherited ? ' (inherited)' : ''}`]);
  if (n['animatable'] === true) rows.push(['Animatable', 'yes']);
  if (typeof n['plotlyPath'] === 'string') rows.push(['Plotly path', `\`${n['plotlyPath']}\``]);
  if (typeof n['since'] === 'string') rows.push(['Since', `\`${n['since']}\``]);
  return rows;
}

/** Raw-HTML heading whose id is the attribute path, in VitePress's header-anchor format. */
function heading(entry: AttributeEntry): string {
  const level = Math.min(2 + entry.depth, 4);
  const id = escapeHtml(entry.path);
  const badges: string[] = [];
  if (entry.kind === 'attr')
    badges.push(
      `<span class="hc-attr-type ignore-header">${escapeHtml(String(entry.node['valType']))}</span>`,
    );
  if (typeof entry.node['deprecated'] === 'string') {
    badges.push('<span class="hc-attr-deprecated ignore-header">deprecated</span>');
  }
  const suffix = badges.length > 0 ? ` ${badges.join(' ')}` : '';
  return (
    `<h${level} id="${id}" tabindex="-1"><code>${id}</code>${suffix} ` +
    `<a class="header-anchor" href="#${id}" aria-label="Permalink to &quot;${id}&quot;">&#8203;</a></h${level}>`
  );
}

function renderEntry(entry: AttributeEntry): string {
  const out: string[] = [heading(entry), ''];
  const n = entry.node;
  if (typeof n['deprecated'] === 'string') {
    out.push(`> **Deprecated:** ${sanitizeMarkdown(n['deprecated'])}`, '');
  }
  const description = typeof n['description'] === 'string' ? n['description'].trim() : '';
  out.push(description ? sanitizeMarkdown(description) : '_No description yet._', '');
  const facts = entry.kind === 'attr' ? attributeFacts(entry) : containerFacts(entry);
  for (const [label, value] of facts) out.push(`- **${label}:** ${value}`);
  out.push('');
  for (const child of entry.children) out.push(renderEntry(child));
  return out.join('\n');
}

/** Collapsible nested index of every attribute, linking to the anchors below. */
export function renderTree(entries: readonly AttributeEntry[]): string {
  const list = (items: readonly AttributeEntry[]): string =>
    '<ul>' +
    items
      .map((e) => {
        const link = `<a href="#${escapeHtml(e.path)}"><code>${escapeHtml(e.key)}</code></a>`;
        return e.children.length > 0
          ? `<li><details><summary>${link}</summary>${list(e.children)}</details></li>`
          : `<li>${link}</li>`;
      })
      .join('') +
    '</ul>';
  return `<details class="hc-attr-tree"><summary>Attribute tree</summary>${list(entries)}</details>`;
}

// ---------------------------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------------------------

/** What kind of reference page this is. */
export type ReferencePageKind = 'trace' | 'layout' | 'config';

/** A page in the attribute reference (also written to `manifest.json` for the docs sidebar). */
export interface ReferencePageInfo {
  /** File/page name: the trace type, `layout` or `config`. */
  name: string;
  kind: ReferencePageKind;
  title: string;
  /** Site link without base or extension, e.g. `/reference/scatter`. */
  link: string;
  /** Number of attributes and containers documented. */
  attributeCount: number;
  /** A docs chart page documents this trace type, but no module is registered yet. */
  pending?: boolean;
}

export interface RenderOptions {
  /** Link prefix for reference pages (default `/reference/`). */
  linkPrefix?: string;
  /** Trace type → chart page link (e.g. `scatter` → `/charts/basic/scatter`). */
  chartPages?: Readonly<Record<string, string>>;
  /** Trace type → ids of examples that use it. */
  examplesByTrace?: Readonly<Record<string, readonly string[]>>;
  /** Link to the machine-readable schema (default `/plot-schema.json`). */
  schemaLink?: string;
}

/** Page names that are hand-written in the reference section and can't be used by traces. */
export const RESERVED_PAGE_NAMES: ReadonlySet<string> = new Set([
  'index',
  'api',
  'events',
  'colorscales',
  'marker-symbols',
  'plotly-compat',
  'attributes',
]);

export const GENERATED_NOTICE =
  '<!-- Generated from the attribute schema by tools/schema-gen (pnpm --filter @mk7s/holochart-schema-gen run docs). Do not edit. -->';

function frontmatter(fields: Record<string, string | number | boolean | number[]>): string {
  const lines = Object.entries(fields).map(([k, v]) => {
    const value = Array.isArray(v)
      ? `[${v.join(', ')}]`
      : typeof v === 'string'
        ? JSON.stringify(v)
        : String(v);
    return `${k}: ${value}`;
  });
  return ['---', ...lines, '---'].join('\n');
}

interface PageInput {
  name: string;
  kind: ReferencePageKind;
  title: string;
  intro: string[];
  attributes: JSONSchemaNode;
  pending?: boolean;
}

function renderPage(
  input: PageInput,
  options: RenderOptions,
): { info: ReferencePageInfo; content: string } {
  const entries = flattenAttributes(input.attributes);
  const count = allEntries(entries).length;
  const link = `${options.linkPrefix ?? '/reference/'}${input.name}`;
  const schemaLink = options.schemaLink ?? '/plot-schema.json';
  const body: string[] = [
    frontmatter({
      title: input.title,
      description: `Every ${input.kind === 'trace' ? `\`${input.name}\` trace` : input.name} attribute: type, default, allowed values, edit type and description.`,
      outline: [2, 3],
      generated: true,
      editLink: false,
    }),
    '',
    GENERATED_NOTICE,
    '',
    '<div v-pre>',
    '',
    `# ${input.title}`,
    '',
    ...input.intro,
    `Generated from the attribute schema (${count} entries). Machine-readable: [plot-schema.json](${schemaLink}).`,
    '',
  ];
  if (entries.length === 0) {
    body.push('_No attributes are declared yet._', '');
  } else {
    body.push(renderTree(entries), '');
    for (const e of entries) body.push(renderEntry(e));
  }
  body.push('</div>', '');
  return {
    info: {
      name: input.name,
      kind: input.kind,
      title: input.title,
      link,
      attributeCount: count,
      ...(input.pending ? { pending: true } : {}),
    },
    content: body.join('\n').replace(/\n{3,}/g, '\n\n'),
  };
}

/** Result of rendering the whole reference. */
export interface RenderedReference {
  /** File name (e.g. `scatter.md`) → Markdown content. */
  pages: Record<string, string>;
  /** Page list in sidebar order: layout, config, then traces alphabetically. */
  manifest: ReferencePageInfo[];
}

/**
 * Render every attribute reference page from a plot schema.
 *
 * @throws If a trace type collides with a hand-written reference page name.
 */
export function renderReference(
  schema: PlotSchema,
  options: RenderOptions = {},
): RenderedReference {
  const pages: Record<string, string> = {};
  const manifest: ReferencePageInfo[] = [];
  const add = (input: PageInput): void => {
    const { info, content } = renderPage(input, options);
    pages[`${input.name}.md`] = content;
    manifest.push(info);
  };

  add({
    name: 'layout',
    kind: 'layout',
    title: 'Layout attributes',
    intro: [
      'Attributes of `layout`: figure size, margins, fonts, axes, subplots and components. Trace modules and components registered with the chart add their own layout attributes, which are included here.',
      '',
    ],
    attributes: schema.layout.attributes,
  });
  add({
    name: 'config',
    kind: 'config',
    title: 'Config options',
    intro: [
      'Attributes of `config`: per-chart behavior such as responsiveness, interaction and the modebar. Config is not part of the figure style and is never templated.',
      '',
    ],
    attributes: schema.config.attributes,
  });

  // Trace types documented by a chart page but not registered yet get a placeholder page, so links
  // from chart pages to `/reference/<type>` never break while the trace module is being built.
  const types = new Set([...Object.keys(schema.traces), ...Object.keys(options.chartPages ?? {})]);
  for (const type of [...types].sort()) {
    if (RESERVED_PAGE_NAMES.has(type) || type === 'layout' || type === 'config') {
      throw new Error(`Trace type "${type}" collides with a reserved reference page name.`);
    }
    const trace = schema.traces[type];
    if (!trace) {
      const chartPage = options.chartPages?.[type];
      add({
        name: type,
        kind: 'trace',
        title: `${type} attributes`,
        intro: [
          `The \`${type}\` trace module is not registered yet. This page lists its attributes once its trace package exports the module.`,
          '',
          ...(chartPage ? [`- **Guide:** [${type} chart page](${chartPage})`, ''] : []),
        ],
        attributes: { role: 'object' },
        pending: true,
      });
      continue;
    }
    const intro: string[] = [];
    const description =
      typeof trace.meta['description'] === 'string' ? trace.meta['description'] : '';
    if (description) intro.push(sanitizeMarkdown(description), '');
    const facts: string[] = [];
    if (trace.categories.length > 0) {
      facts.push(`- **Categories:** ${trace.categories.map((c) => `\`${c}\``).join(', ')}`);
    }
    const plotly = trace.meta['plotlyEquivalent'];
    facts.push(`- **Plotly equivalent:** \`${typeof plotly === 'string' ? plotly : type}\``);
    const chartPage = options.chartPages?.[type];
    if (chartPage) facts.push(`- **Guide:** [${type} chart page](${chartPage})`);
    const examples = options.examplesByTrace?.[type] ?? [];
    if (examples.length > 0) {
      facts.push(`- **Used in examples:** ${examples.map((id) => `\`${id}\``).join(', ')}`);
    }
    intro.push(...facts, '');
    add({
      name: type,
      kind: 'trace',
      title: `${type} attributes`,
      intro,
      attributes: trace.attributes,
    });
  }
  return { pages, manifest };
}
