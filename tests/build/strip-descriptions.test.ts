/**
 * Schema descriptions are stripped from production builds and kept everywhere else (plan E21.5,
 * ADR-020). Three layers:
 *
 * 1. the transform itself, on small snippets;
 * 2. every workspace package bundled in-process from its sources with and without the plugin (no
 *    prior build needed, so this runs in the CI test job);
 * 3. the built `dist/` when it exists: `index.js` and the IIFE have no descriptions,
 *    `index.development.js` has them, and package.json exports the development build.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import * as components from '../../packages/components/src/index.ts';
import * as core from '../../packages/core/src/index.ts';
import * as runtime from '../../packages/runtime/src/index.ts';
import * as tracesBasic from '../../packages/traces-basic/src/index.ts';
import { basicTraces } from '../../packages/traces-basic/src/index.ts';
import {
  StripDescriptionsError,
  WORKSPACE_ROOT,
  scanWorkspaceHelpers,
  stripDescriptions,
  stripDescriptionsPlugin,
  type AstNode,
  type HelperIndex,
} from '../../scripts/build/strip-descriptions.ts';

interface Rolldown {
  rolldown(options: Record<string, unknown>): Promise<{
    generate(
      options: Record<string, unknown>,
    ): Promise<{ output: { type: string; code?: string }[] }>;
    close(): Promise<void>;
  }>;
}

/** rolldown and its parser, from Vite's dependency (rolldown is not a root dependency). */
const requireFromVite = createRequire(
  realpathSync(path.join(WORKSPACE_ROOT, 'node_modules/vite/package.json')),
);
const rolldownUrl = pathToFileURL(requireFromVite.resolve('rolldown')).href;
const parseAstUrl = pathToFileURL(requireFromVite.resolve('rolldown/parseAst')).href;

let parse: (code: string) => AstNode;
let rd: Rolldown;
beforeAll(async () => {
  const mod = (await import(parseAstUrl)) as {
    parseAst(code: string, options: { lang: 'ts' }): AstNode;
  };
  parse = (code) => mod.parseAst(code, { lang: 'ts' });
  rd = (await import(rolldownUrl)) as Rolldown;
});

function strip(code: string, helpers: HelperIndex = new Map()): string {
  return stripDescriptions(code, parse(code), helpers).code;
}

describe('stripDescriptions', () => {
  it('blanks description options of attr builders and keeps every position', () => {
    const code = [
      "const a = attr.number({ dflt: 1, description: 'One.' });",
      'const b = attr.object(',
      "  { c: attr.color({\n    description:\n      'Multi\\nline.',\n    editType: 'style' }) },",
      "  { editType: 'plot', description: `Object ${x}.` /* why */, },",
      ');',
    ].join('\n');
    const out = strip(code);
    expect(out).toHaveLength(code.length);
    expect(out.split('\n')).toHaveLength(code.split('\n').length);
    expect(out).not.toMatch(/description|One\.|Multi|Object/);
    expect(out).toContain("editType: 'style'");
    expect(() => parse(out)).not.toThrow();
    // Positions of the surviving code are unchanged.
    expect(out.indexOf("editType: 'plot'")).toBe(code.indexOf("editType: 'plot'"));
  });

  it('strips bare builder calls only in the module that defines attr', () => {
    const inAttr =
      "function string(o) {}\nexport const attr = { string };\nstring({ description: 'x' });";
    expect(strip(inAttr)).not.toContain('description');
    const elsewhere = "string({ description: 'x' });";
    expect(strip(elsewhere)).toBe(elsewhere);
  });

  it('keeps descriptions outside attr calls (trace meta, runtime values)', () => {
    const code = "export const t = { meta: { description: 'Trace.' }, x: { description: y } };";
    const result = stripDescriptions(code, parse(code), new Map());
    expect(result.code).toBe(code);
    expect(result.leftovers).toEqual([]);
    const loose = "const opts = { description: 'Loose.' };";
    expect(stripDescriptions(loose, parse(loose), new Map()).leftovers).toEqual([15]);
  });

  it('blanks the description argument of local and imported helpers', () => {
    const code = [
      "import { fontSchema as fs, other } from '../../packages/core/src/index.ts';",
      'function font(description: string, n: number) {',
      "  return attr.object({ size: attr.number({ dflt: n }) }, { description, editType: 'plot' });",
      '}',
      "const a = font('Local font.', 2);",
      "const b = fs(`Imported ${'font'}.`);",
      "const c = other('Not a helper.');",
    ].join('\n');
    const out = strip(code, new Map([['fontSchema', 0]]));
    expect(out).toContain("font(''");
    expect(out).toContain("fs(''");
    expect(out).toContain("other('Not a helper.')");
    expect(out).not.toMatch(/Local font|Imported/);
  });

  it('refuses helpers whose description parameter does something else', () => {
    const code =
      'function font(description: string) { console.log(description); return attr.object({}, { description }); }';
    expect(() => stripDescriptions(code, parse(code), new Map())).toThrow(StripDescriptionsError);
    const call = "import { fontSchema } from 'x';\nfontSchema(makeText());";
    expect(() => stripDescriptions(call, parse(call), new Map([['fontSchema', 0]]))).toThrow(
      /not a plain string/,
    );
  });
});

/** Descriptions of every schema node reachable from a package's exports (sources). */
function collectDescriptions(exports: object): Set<string> {
  const out = new Set<string>();
  const seen = new Set<object>();
  const visit = (v: unknown): void => {
    if (typeof v !== 'object' || v === null || seen.has(v) || ArrayBuffer.isView(v)) return;
    seen.add(v);
    const node = v as Record<string, unknown>;
    const kind = node['kind'];
    if (
      (kind === 'attr' || kind === 'object' || kind === 'items') &&
      typeof node['description'] === 'string'
    ) {
      out.add(node['description']);
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(exports);
  return out;
}

const WINDOW = 24;

/**
 * Every `WINDOW`-long slice of the string literals and template text in `code`. Comments are left
 * out: unminified builds keep JSDoc, which may quote attribute names the way descriptions do.
 */
function windowsOf(code: string): Set<string> {
  const strings: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object' || node === null) return;
    const n = node as Record<string, unknown>;
    if (n['type'] === 'Literal' && typeof n['value'] === 'string') strings.push(n['value']);
    if (n['type'] === 'TemplateElement') {
      strings.push(String((n['value'] as { cooked?: string; raw: string }).cooked ?? ''));
    }
    for (const [key, value] of Object.entries(n)) if (key !== 'parent') visit(value);
  };
  visit(parse(code));
  const out = new Set<string>();
  for (const s of strings) {
    for (let i = 0; i + WINDOW <= s.length; i++) out.add(s.slice(i, i + WINDOW));
  }
  return out;
}

/**
 * Text that ships on purpose and overlaps descriptions: trace `meta.description` (part of
 * `registry.list()`), and option values that only feed templated descriptions (a few bytes; the
 * plugin cannot tell them from data).
 */
const KEPT = [
  ...basicTraces.flatMap((m) => {
    const d = (m as { meta?: { description?: string } }).meta?.description;
    return d ? [d] : [];
  }),
  'color arrays of the traces that reference this axis',
];
const KEPT_WINDOWS = new Set(
  KEPT.flatMap((k) =>
    Array.from({ length: k.length - WINDOW + 1 }, (_, i) => k.slice(i, i + WINDOW)),
  ),
);

/** True when some slice of `description` (other than kept text) occurs behind `windows`. */
function occurs(description: string, windows: Set<string>): boolean {
  for (let i = 0; i + WINDOW <= description.length; i++) {
    const w = description.slice(i, i + WINDOW);
    if (windows.has(w) && !KEPT_WINDOWS.has(w)) return true;
  }
  return false;
}

/**
 * Descriptions declared in each package (long enough to be matched). A package's exports also
 * reach schema nodes of the packages it depends on, so those are subtracted.
 */
const DESCRIPTIONS: Record<string, string[]> = (() => {
  const found = {
    core: collectDescriptions(core),
    runtime: collectDescriptions(runtime),
    components: collectDescriptions(components),
    'traces-basic': collectDescriptions(tracesBasic),
  };
  const deps: Record<string, (keyof typeof found)[]> = {
    core: [],
    runtime: ['core'],
    components: ['core', 'runtime'],
    'traces-basic': ['core', 'runtime'],
  };
  return Object.fromEntries(
    Object.entries(found).map(([dir, set]) => [
      dir,
      [...set].filter(
        (d) => d.length >= WINDOW && !(deps[dir] ?? []).some((dep) => found[dep].has(d)),
      ),
    ]),
  );
})();
const ALL_DESCRIPTIONS = [...new Set(Object.values(DESCRIPTIONS).flat())];

async function bundlePackage(dir: string, strip: boolean): Promise<string> {
  const build = await rd.rolldown({
    input: path.join(WORKSPACE_ROOT, 'packages', dir, 'src/index.ts'),
    platform: 'neutral',
    // Only the package itself, as in its tsdown build.
    external: (id: string) => !id.startsWith('.') && !path.isAbsolute(id),
    logLevel: 'silent',
    plugins: strip ? [stripDescriptionsPlugin()] : [],
  });
  try {
    const { output } = await build.generate({ format: 'es' });
    return output.map((c) => c.code ?? '').join('\n');
  } finally {
    await build.close();
  }
}

describe('workspace packages', () => {
  it('finds the schema descriptions to look for', () => {
    expect(DESCRIPTIONS['core']?.length).toBeGreaterThan(100);
    expect(DESCRIPTIONS['traces-basic']?.length).toBeGreaterThan(50);
    expect(DESCRIPTIONS['components']?.length).toBeGreaterThan(30);
  });

  it('indexes exported description helpers without conflicts', () => {
    expect(scanWorkspaceHelpers((code) => parse(code)).get('fontSchema')).toBe(0);
  });

  it.each(['core', 'runtime', 'components', 'traces-basic'])(
    '%s: the production bundle has no descriptions, the unstripped one has them',
    async (dir) => {
      const own = DESCRIPTIONS[dir] ?? [];
      const stripped = windowsOf(await bundlePackage(dir, true));
      const kept = windowsOf(await bundlePackage(dir, false));
      expect(own.filter((d) => occurs(d, stripped))).toEqual([]);
      // Short templated descriptions (`Marker style of ${which} bars.`) have no literal slice.
      expect(own.filter((d) => occurs(d, kept)).length).toBeGreaterThan(own.length * 0.85);
    },
    30_000,
  );
});

const PACKAGES_WITH_SCHEMAS = ['core', 'runtime', 'components', 'traces-basic'];
const devBuilt = PACKAGES_WITH_SCHEMAS.every((dir) =>
  existsSync(path.join(WORKSPACE_ROOT, 'packages', dir, 'dist/index.development.js')),
);

// Only after a build with this setup (dist/index.development.js exists); stale dist is skipped.
describe.skipIf(!devBuilt)('built dist/', () => {
  const read = (rel: string): string => readFileSync(path.join(WORKSPACE_ROOT, rel), 'utf8');

  it.each(PACKAGES_WITH_SCHEMAS)('%s: index.js is stripped, index.development.js is not', (dir) => {
    const own = DESCRIPTIONS[dir] ?? [];
    const prod = windowsOf(read(`packages/${dir}/dist/index.js`));
    const dev = windowsOf(read(`packages/${dir}/dist/index.development.js`));
    expect(own.filter((d) => occurs(d, prod))).toEqual([]);
    expect(own.filter((d) => occurs(d, dev)).length).toBeGreaterThan(own.length * 0.85);
  });

  it.each(PACKAGES_WITH_SCHEMAS)('%s: package.json exports the development build', (dir) => {
    const pkg = JSON.parse(read(`packages/${dir}/package.json`)) as {
      exports: Record<string, Record<string, string>>;
      publishConfig: { exports: Record<string, Record<string, string>> };
    };
    for (const exports of [pkg.exports, pkg.publishConfig.exports]) {
      const root = exports['.'] ?? {};
      expect(root['development']).toBe('./dist/index.development.js');
      // `development` must come before `import`: the first matching condition wins.
      expect(Object.keys(root).indexOf('development')).toBeLessThan(
        Object.keys(root).indexOf('import'),
      );
    }
  });

  it.skipIf(
    !existsSync(path.join(WORKSPACE_ROOT, 'packages/holochart/dist/holochart.iife.min.js')),
  )('the IIFE has no descriptions', () => {
    const iife = windowsOf(read('packages/holochart/dist/holochart.iife.min.js'));
    expect(ALL_DESCRIPTIONS.filter((d) => occurs(d, iife))).toEqual([]);
  });
});
