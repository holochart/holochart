/**
 * Generates the coverage tables of the Plotly compatibility page (`reference/plotly-compat.md`,
 * backlog S2.10): which plotly.js trace types, trace attributes, layout attributes and config
 * options Holochart's schema has, as supported / partial / missing.
 *
 * Inputs:
 * - Holochart's schema: `public/plot-schema.json`, which `gen:reference` writes from the registry
 *   of the full bundle, so this runs after it (`pnpm run gen`). The copy checked in under
 *   `packages/core/src/generated/` is built from an empty registry and has no trace types.
 * - plotly.js' schema: the reduced copy vendored in `plotly-compat/plotly-schema.jsonl` (see
 *   `plotly-compat/reduce-plotly-schema.ts` for how to refresh it).
 *
 * Output: the text between the `generated:plotly-compat` markers of the page, which is checked in.
 * The rest of the page is hand-written. Nothing is written when the tables are up to date.
 *
 * Usage: `node scripts/gen-plotly-compat.ts [--check] [--schema <file>]`. `--check` writes nothing
 * and exits with 1 when the page is out of date.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as prettier from 'prettier';
import {
  byTopLevelKey,
  caveatPaths,
  compareTrees,
  overall,
  tally,
  type Finding,
  type Status,
  type Tally,
} from './plotly-compat/compare.ts';
import { readPlotlySchema, type PlotlySchema } from './plotly-compat/plotly-schema.ts';
import { compactAttributes, type Branch } from './plotly-compat/schema-tree.ts';

const DOCS_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = path.join(DOCS_ROOT, 'reference/plotly-compat.md');
const DEFAULT_SCHEMA = path.join(DOCS_ROOT, 'public/plot-schema.json');

export const START = '<!-- generated:plotly-compat:start -->';
export const END = '<!-- generated:plotly-compat:end -->';

/** Holochart's `plot-schema.json` (see `plotSchema` in `@mk7s/holochart-core`). */
export interface HolochartSchema {
  traces: Record<string, { attributes: unknown }>;
  layout: { attributes: unknown };
  config: { attributes: unknown };
}

/**
 * What to use instead of the Plotly trace types Holochart does not have. Hand-written: the schema
 * cannot say why a type is absent.
 */
const MISSING_TRACE_NOTES: Readonly<Record<string, string>> = {
  scattergl: 'Use `scatter`: every Holochart trace is drawn on the GPU.',
  scatterpolargl: 'Use `scatterpolar`: every Holochart trace is drawn on the GPU.',
  scattergeo: 'No geographic subplots (`layout.geo`).',
  choropleth: 'No geographic subplots (`layout.geo`).',
  scattermap: 'No tile maps (`layout.map`).',
  choroplethmap: 'No tile maps (`layout.map`).',
  densitymap: 'No tile maps (`layout.map`).',
  scatterternary: 'No ternary subplots (`layout.ternary`).',
  scattersmith: 'No Smith charts (`layout.smith`).',
  carpet: 'No carpet axes.',
  scattercarpet: 'No carpet axes.',
  contourcarpet: 'No carpet axes.',
};

/**
 * Differences that the comparison reports but that are not gaps, by `scope:path`. Plotly's schema
 * lists all four sides for both axis letters; an x axis can only be at the top or the bottom.
 */
const NOT_A_GAP: ReadonlySet<string> = new Set(['layout:xaxis.side', 'layout:yaxis.side']);

const LABEL: Readonly<Record<Status, string>> = {
  supported: 'Supported',
  partial: 'Partial',
  missing: 'Missing',
};

/** A finding shared by every trace type that has the attribute in Plotly is listed once. */
const COMMON_MIN_TRACES = 5;

function settle(scope: string, findings: Finding[]): Finding[] {
  return findings.map((f) => {
    if (f.status !== 'partial' || !NOT_A_GAP.has(`${scope}:${f.path}`)) return f;
    return { path: f.path, status: 'supported', count: f.count };
  });
}

function code(text: string): string {
  return `\`${text}\``;
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function row(cells: readonly (string | number)[]): string {
  return `| ${cells.map((c) => cell(String(c))).join(' | ')} |`;
}

function table(head: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  return [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
}

function percent(t: Tally): string {
  return t.total === 0 ? 'n/a' : `${Math.round((100 * t.supported) / t.total)}%`;
}

function add(a: Tally, b: Tally): Tally {
  return {
    supported: a.supported + b.supported,
    partial: a.partial + b.partial,
    missing: a.missing + b.missing,
    total: a.total + b.total,
  };
}

function findingKey(f: Finding): string {
  return `${f.status}|${f.path}|${f.note ?? ''}`;
}

/** The gaps of a list of findings as Markdown: partial attributes with their notes, then missing. */
function gapLists(findings: readonly Finding[]): string {
  const partial = findings.filter((f) => f.status === 'partial');
  const missing = findings.filter((f) => f.status === 'missing');
  const out: string[] = [];
  if (partial.length > 0) {
    // Attributes with the same note share a line.
    const byNote = new Map<string, string[]>();
    for (const f of partial) {
      const note = f.note ?? '';
      byNote.set(note, [...(byNote.get(note) ?? []), f.path]);
    }
    out.push(
      'Partial:',
      '',
      ...[...byNote].map(([note, paths]) => `- ${paths.map(code).join(', ')}: ${note}`),
      '',
    );
  }
  if (missing.length > 0) {
    const names = missing.map((f) => (f.count > 1 ? `${code(f.path)} (${f.count})` : code(f.path)));
    out.push(`Missing: ${names.join(', ')}`, '');
  }
  return out.join('\n');
}

function details(summary: string, body: string): string {
  return `<details>\n<summary>${summary}</summary>\n\n${body.trim()}\n\n</details>\n`;
}

function counts(t: Tally): string {
  const parts: string[] = [];
  if (t.partial > 0) parts.push(`${t.partial} partial`);
  if (t.missing > 0) parts.push(`${t.missing} missing`);
  return parts.join(', ');
}

/** The generated part of the page, as Markdown (unformatted). */
export function renderCoverage(plotly: PlotlySchema, ours: HolochartSchema): string {
  const plotlyTypes = Object.keys(plotly.traces).sort();
  const shared = plotlyTypes.filter((type) => ours.traces[type] !== undefined);
  const absent = plotlyTypes.filter((type) => ours.traces[type] === undefined);
  const own = Object.keys(ours.traces)
    .filter((type) => plotly.traces[type] === undefined)
    .sort();

  // ---- traces ----
  const traceFindings = new Map<string, Finding[]>();
  for (const type of shared) {
    const attributes = ours.traces[type]?.attributes;
    traceFindings.set(
      type,
      settle(
        `trace:${type}`,
        compareTrees(
          plotly.traces[type]?.attributes ?? {},
          compactAttributes(attributes),
          caveatPaths(attributes),
        ),
      ),
    );
  }
  const traceTallies = new Map([...traceFindings].map(([type, f]) => [type, tally(f)]));
  const traceTotal = [...traceTallies.values()].reduce(add, {
    supported: 0,
    partial: 0,
    missing: 0,
    total: 0,
  });

  // Gaps shared by every trace type whose Plotly schema has the attribute.
  const having = new Map<string, number>();
  const gapIn = new Map<string, { finding: Finding; types: string[] }>();
  for (const [type, findings] of traceFindings) {
    for (const f of findings) {
      having.set(f.path, (having.get(f.path) ?? 0) + 1);
      if (f.status === 'supported') continue;
      const entry = gapIn.get(findingKey(f)) ?? { finding: f, types: [] };
      entry.types.push(type);
      gapIn.set(findingKey(f), entry);
    }
  }
  const common = new Map(
    [...gapIn].filter(
      ([, e]) =>
        e.types.length >= COMMON_MIN_TRACES && e.types.length === having.get(e.finding.path),
    ),
  );

  // ---- layout: Plotly's layout attributes plus those its trace types add (`barmode`, …) ----
  const layoutTree: Branch = { ...plotly.layout };
  const addedBy = new Map<string, string[]>();
  for (const type of plotlyTypes) {
    for (const [key, node] of Object.entries(plotly.traces[type]?.layout ?? {})) {
      layoutTree[key] ??= node;
      addedBy.set(key, [...(addedBy.get(key) ?? []), type]);
    }
  }
  const layoutFindings = settle(
    'layout',
    compareTrees(
      layoutTree,
      compactAttributes(ours.layout.attributes),
      caveatPaths(ours.layout.attributes),
    ),
  );
  const layoutKeys = byTopLevelKey(layoutFindings);
  const layoutTotal = tally(layoutFindings);

  // ---- config ----
  const configFindings = settle(
    'config',
    compareTrees(
      plotly.config,
      compactAttributes(ours.config.attributes),
      caveatPaths(ours.config.attributes),
    ),
  );
  const configKeys = byTopLevelKey(configFindings);

  const traceStatus = (type: string): Status =>
    overall(traceTallies.get(type) ?? { supported: 0, partial: 0, missing: 1, total: 1 });
  const fullTypes = shared.filter((type) => traceStatus(type) === 'supported');
  const keyStatuses = (keys: Map<string, Finding[]>): Record<Status, number> => {
    const out: Record<Status, number> = { supported: 0, partial: 0, missing: 0 };
    for (const findings of keys.values()) out[overall(tally(findings))]++;
    return out;
  };
  const layoutStatus = keyStatuses(layoutKeys);
  const configStatus = keyStatuses(configKeys);

  const out: string[] = [];
  out.push(
    `Compared with **plotly.js ${plotly.version}**.`,
    '',
    table(
      ['', 'Supported', 'Partial', 'Missing', 'Total'],
      [
        [
          'Trace types',
          fullTypes.length,
          shared.length - fullTypes.length,
          absent.length,
          plotlyTypes.length,
        ],
        [
          `Attributes of the ${shared.length} shared trace types`,
          `${traceTotal.supported} (${percent(traceTotal)})`,
          traceTotal.partial,
          traceTotal.missing,
          traceTotal.total,
        ],
        [
          'Top-level layout keys',
          layoutStatus.supported,
          layoutStatus.partial,
          layoutStatus.missing,
          layoutKeys.size,
        ],
        [
          'Layout attributes',
          `${layoutTotal.supported} (${percent(layoutTotal)})`,
          layoutTotal.partial,
          layoutTotal.missing,
          layoutTotal.total,
        ],
        [
          'Config options',
          configStatus.supported,
          configStatus.partial,
          configStatus.missing,
          configKeys.size,
        ],
      ],
    ),
    '',
    'A trace type or a layout key counts as supported only when every one of its Plotly attributes ' +
      'is, and as partial when Holochart has it but lacks or limits some of its attributes.',
    '',
  );
  if (own.length > 0) {
    out.push(
      `Holochart also has ${own.length === 1 ? 'a trace type' : 'trace types'} that plotly.js ` +
        `does not: ${own.map((type) => `[${code(type)}](/reference/${type})`).join(', ')}.`,
      '',
    );
  }

  out.push('## Trace types', '');
  out.push(
    table(
      ['Plotly trace type', 'Status', 'Supported', 'Partial', 'Missing', 'Notes'],
      plotlyTypes.map((type) => {
        const t = traceTallies.get(type);
        if (!t) {
          return [code(type), LABEL.missing, '', '', '', MISSING_TRACE_NOTES[type] ?? ''];
        }
        return [
          code(type),
          LABEL[overall(t)],
          `${t.supported} (${percent(t)})`,
          t.partial,
          t.missing,
          `[Attributes](/reference/${type})`,
        ];
      }),
    ),
    '',
    'The numbers count attributes of the Plotly trace type.',
    '',
  );

  out.push('## Trace attributes', '');
  if (common.size > 0) {
    out.push(
      '### In every trace type',
      '',
      'These gaps are the same in every shared trace type that has the attribute in Plotly, and ' +
        'are left out of the lists per trace type below.',
      '',
      gapLists([...common.values()].map((e) => e.finding)),
    );
  }
  out.push('### By trace type', '');
  for (const type of shared) {
    const gaps = (traceFindings.get(type) ?? []).filter(
      (f) => f.status !== 'supported' && !common.has(findingKey(f)),
    );
    if (gaps.length === 0) continue;
    out.push(details(`<code>${type}</code>: ${counts(tally(gaps))}`, gapLists(gaps)));
  }

  out.push('## Layout', '');
  out.push(
    table(
      ['Layout key', 'Status', 'Supported', 'Partial', 'Missing', 'Notes'],
      [...layoutKeys].map(([key, findings]) => {
        const t = tally(findings);
        const by = addedBy.get(key);
        return [
          code(key),
          LABEL[overall(t)],
          t.supported,
          t.partial,
          t.missing,
          by ? `With ${by.map(code).join(', ')} traces` : '',
        ];
      }),
    ),
    '',
    'The numbers count the attributes under each key. `xaxis` and `yaxis` stand for every axis ' +
      '(`xaxis2`, …), and likewise `scene`, `polar`, `coloraxis` and `legend`.',
    '',
  );
  for (const [key, findings] of layoutKeys) {
    const t = tally(findings);
    if (overall(t) !== 'partial' || t.total === 1) continue;
    const gaps = findings.filter((f) => f.status !== 'supported');
    out.push(details(`<code>${key}</code>: ${counts(t)}`, gapLists(gaps)));
  }
  const single = [...layoutKeys.values()]
    .filter((findings) => findings.length === 1 && findings[0]?.status === 'partial')
    .flat();
  if (single.length > 0) out.push(gapLists(single));

  out.push('## Config', '');
  out.push(
    table(
      ['Config option', 'Status', 'Notes'],
      [...configKeys].map(([key, findings]) => {
        const notes = findings
          .filter((f) => f.status === 'partial')
          .map((f) => (f.path === key ? (f.note ?? '') : `${code(f.path)}: ${f.note ?? ''}`));
        const lacking = findings.filter((f) => f.status === 'missing' && f.path !== key);
        if (lacking.length > 0)
          notes.push(`Missing: ${lacking.map((f) => code(f.path)).join(', ')}`);
        return [code(key), LABEL[overall(tally(findings))], notes.join('; ')];
      }),
    ),
    '',
  );
  return out.join('\n');
}

/** `page` with the text between the markers replaced by `generated`. */
export function replaceGenerated(page: string, generated: string): string {
  const start = page.indexOf(START);
  const end = page.indexOf(END);
  if (start < 0 || end < start) {
    throw new Error(`reference/plotly-compat.md: missing the ${START} … ${END} markers`);
  }
  return `${page.slice(0, start + START.length)}\n\n${generated.trim()}\n\n${page.slice(end)}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { check: { type: 'boolean', default: false }, schema: { type: 'string' } },
  });
  const schemaFile = values.schema ? path.resolve(values.schema) : DEFAULT_SCHEMA;
  if (!existsSync(schemaFile)) {
    throw new Error(`${schemaFile} does not exist: run \`pnpm run gen:reference\` first`);
  }
  const ours = JSON.parse(await readFile(schemaFile, 'utf8')) as HolochartSchema;
  const plotly = await readPlotlySchema();

  const current = await readFile(PAGE, 'utf8');
  const config = (await prettier.resolveConfig(PAGE)) ?? {};
  const next = await prettier.format(replaceGenerated(current, renderCoverage(plotly, ours)), {
    ...config,
    filepath: PAGE,
  });
  const rel = path.relative(process.cwd(), PAGE);
  if (next === current) {
    console.log(`plotly compatibility: ${rel} is up to date (plotly.js ${plotly.version})`);
  } else if (values.check) {
    console.error(`${rel} is out of date: run \`pnpm --filter @mk7s/holochart-docs gen:compat\``);
    process.exitCode = 1;
  } else {
    await writeFile(PAGE, next);
    console.log(`plotly compatibility: wrote ${rel} (plotly.js ${plotly.version})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
