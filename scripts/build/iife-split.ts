/**
 * The script-tag build's split into a 2D script and a 3D add-on (ADR-015, M6):
 *
 * - `holochart.iife.min.js` (`packages/holochart/src/iife.ts`): everything but the 3D package. Its
 *   copy of render keeps the 3D loaders (`loadMeshModule`, `loadLinesMarkers3D`, public API), but
 *   {@link iife2DPlugin} rewrites their dynamic `import()` of the 3D chunks (which a single-file
 *   build would inline) into a lookup of the chunk the add-on provides (`iife/host.ts`), and fails
 *   the build if any 3D module ends up in the script.
 * - `holochart-3d.iife.min.js` (`packages/holochart/src/iife-3d.ts`): the 3D package and render's
 *   3D chunks, and nothing else. {@link iife3DAddonPlugin} maps what it shares with the main script
 *   to that script's instances ({@link ADDON_GLOBALS}): `three`, core, the runtime, traces-basic,
 *   components and render (the package, and render's own modules the 3D chunks import by relative
 *   path), so a page has one three.js, one registry and one copy of render's module state. It
 *   checks at build time that every name the add-on imports from them exists on the main script's
 *   side (for the packages read from `Holochart` itself: in the public export list or in
 *   `iife/addon-shared.ts`), and fails the build if the add-on bundles any other module.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AstNode } from './strip-descriptions.ts';

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../..');
const RENDER_SRC = path.join(WORKSPACE_ROOT, 'packages/render/src');

/** render's modules that only the lazily loaded 3D chunks use (bundled into the add-on only). */
export const RENDER_3D_MODULE =
  /[\\/]packages[\\/]render[\\/]src[\\/]primitives[\\/](?:mesh(?:-lazy|-geometry|-material|\.glsl)?|lighting(?:-model)?|transparency|lines-markers-3d|line3d(?:-math|\.glsl)?|markers3d|spheres(?:\.glsl)?|depth-sort|blend3d|extrusion(?:-lazy|-geometry|-cartesian|-domain)?|view3d(?:-camera)?)\.ts$/;

/**
 * render modules that the 3D chunks import but render doesn't export (so they can't come from the
 * main script): stateless helpers the add-on may carry its own copy of. Anything stateful must be
 * shared instead — export it from render's index.
 */
const RENDER_COPIED_MODULE = /[\\/]packages[\\/]render[\\/]src[\\/]precision\.ts$/;

/** The 3D package's sources. */
const TRACES_3D_MODULE = /[\\/]packages[\\/]traces-3d[\\/]src[\\/]/;

/**
 * The full bundle's 2.5D view (`layout.view3d`): only useful with render's 2.5D chunk, so the
 * script-tag build ships it in the add-on too (its component stays in the 2D script).
 */
const VIEW3D_VIEW_MODULE = /[\\/]packages[\\/]holochart[\\/]src[\\/]view3d[\\/]view\.ts$/;

/** The full bundle's list of the 3D package's public exports, which the add-on puts on the global. */
const EXPORTS_3D_MODULE = /[\\/]packages[\\/]holochart[\\/]src[\\/]exports-3d\.ts$/;

/** The virtual module of the add-on entry that bundles render's 3D chunks (`iife/build.d.ts`). */
const RENDER_3D_CHUNKS = 'holochart-iife:render-3d';
const RENDER_3D_CHUNKS_ID = `\0${RENDER_3D_CHUNKS}`;

/**
 * Where the add-on finds each shared package: expressions on the main script's global (rolldown
 * `output.globals`; the modules are external). `Holochart.__iife` is `iife/host.ts`; of core, the
 * runtime, traces-basic and components the main script has the public exports and the `@internal`
 * ones the add-on needs (`iife/addon-shared.ts`) as properties of `Holochart` itself.
 */
export const ADDON_GLOBALS: Readonly<Record<string, string>> = {
  three: 'Holochart.__iife.three',
  '@mk7s/holochart-core': 'Holochart',
  '@mk7s/holochart-runtime': 'Holochart',
  '@mk7s/holochart-traces-basic': 'Holochart',
  '@mk7s/holochart-components': 'Holochart',
  '@mk7s/holochart-render': 'Holochart.render',
};

/** Runs before the add-on's wrapper reads {@link ADDON_GLOBALS}: fail loudly without the main script. */
export const ADDON_BANNER =
  'if(typeof Holochart!="object"||!Holochart||!Holochart.__iife)throw new Error("[holochart] holochart-3d.iife.min.js needs holochart.iife.min.js: load it first (<script src=\\".../holochart.iife.min.js\\"></script> before this script).");';

/** The slice of rolldown's plugin API used here (rolldown is not resolvable from `scripts/`). */
interface PluginContext {
  parse(code: string, options: { lang: 'ts' }): AstNode;
  error(message: string): never;
  getModuleIds(): IterableIterator<string>;
}

interface Chunk {
  type: 'chunk' | 'asset';
  fileName: string;
  moduleIds?: readonly string[];
}

const relative = (id: string): string => path.relative(WORKSPACE_ROOT, id);

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The loaders' dynamic imports of the 3D chunks, and the chunk names of `iife/host.ts`. */
const LOADERS: Readonly<Record<string, { specifier: string; chunk: string }>> = {
  'mesh-loader.ts': { specifier: './mesh-lazy.ts', chunk: 'mesh' },
  'lines-markers-3d-loader.ts': { specifier: './lines-markers-3d.ts', chunk: 'lines-markers-3d' },
  'extrusion-loader.ts': { specifier: './extrusion-lazy.ts', chunk: 'extrusion' },
  'view-loader.ts': { specifier: './view.ts', chunk: 'view3d' },
};

/**
 * rolldown plugin of the 2D script (see the module comment). `hostModule`: absolute path of
 * `packages/holochart/src/iife/host.ts`.
 */
export function iife2DPlugin(hostModule: string) {
  return {
    name: 'holochart:iife-2d',
    transform: {
      filter: {
        id: /[\\/](?:render[\\/]src[\\/]primitives|holochart[\\/]src[\\/]view3d)[\\/][\w-]+-loader\.ts$/,
      },
      handler(this: PluginContext, code: string, id: string) {
        const loader = LOADERS[path.basename(id)];
        if (!loader) return null;
        const call = `import('${loader.specifier}')`;
        // The dynamic import, not the `typeof import(…)` type of the chunk.
        const calls = [...code.matchAll(new RegExp(`(?<!typeof )${escapeRegExp(call)}`, 'g'))];
        if (calls.length !== 1) {
          this.error(`${relative(id)}: expected one \`${call}\` to route to the 3D add-on.`);
        }
        const at = calls[0]!.index;
        // Same length (padded), and the import appended (imports are hoisted): lines and columns,
        // and with them the sourcemap, stay unchanged.
        const lookup = `__hcLazy3D('${loader.chunk}')`.padEnd(call.length, ' ');
        return {
          code: `${code.slice(0, at)}${lookup}${code.slice(at + call.length)}\nimport { lazy3D as __hcLazy3D } from ${JSON.stringify(hostModule)};\n`,
          map: null,
        };
      },
    },
    generateBundle(this: PluginContext) {
      const bundled = [...this.getModuleIds()].filter(
        (id) =>
          TRACES_3D_MODULE.test(id) || RENDER_3D_MODULE.test(id) || VIEW3D_VIEW_MODULE.test(id),
      );
      if (bundled.length > 0) {
        this.error(
          `the 2D script must not contain 3D code (it belongs in holochart-3d.iife.min.js):\n  ${bundled.map(relative).join('\n  ')}`,
        );
      }
    },
  };
}

/** A shared package the add-on imports from (a key of {@link ADDON_GLOBALS}), if any. */
function sharedPackage(source: string, importer: string | undefined): string | undefined {
  if (Object.hasOwn(ADDON_GLOBALS, source)) return source;
  if (!importer || !source.startsWith('.')) return undefined;
  const id = path.resolve(path.dirname(importer), source);
  if (!id.startsWith(RENDER_SRC + path.sep)) return undefined;
  if (RENDER_3D_MODULE.test(id) || RENDER_COPIED_MODULE.test(id)) return undefined;
  // One of render's own modules, imported by a 3D chunk: the main script's copy, through render's
  // public namespace (checked in `buildEnd`).
  return '@mk7s/holochart-render';
}

interface SharedImport {
  pkg: string;
  name: string;
  importer: string;
}

/** Named value imports (and re-exports) of shared packages in one module. */
function sharedImports(program: AstNode, importer: string, fail: (msg: string) => never) {
  const out: SharedImport[] = [];
  for (const node of program['body'] as AstNode[]) {
    const isImport = node.type === 'ImportDeclaration';
    const isReexport =
      (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
      node['source'] != null;
    if (!isImport && !isReexport) continue;
    if (node['importKind'] === 'type' || node['exportKind'] === 'type') continue;
    const source = (node['source'] as AstNode & { value: string }).value;
    const pkg = sharedPackage(source, importer);
    if (!pkg) continue;
    const where = `${relative(importer)}: '${source}'`;
    if (node.type === 'ExportAllDeclaration') {
      fail(`${where}: \`export *\` from a package shared with the main script; name the exports.`);
    }
    for (const spec of (node['specifiers'] as AstNode[] | undefined) ?? []) {
      if (spec['importKind'] === 'type' || spec['exportKind'] === 'type') continue;
      if (spec.type !== 'ImportSpecifier' && spec.type !== 'ExportSpecifier') {
        fail(`${where}: use named imports from packages shared with the main script.`);
      }
      const key = (spec.type === 'ImportSpecifier' ? spec['imported'] : spec['local']) as AstNode;
      const name = (key['name'] ?? key['value']) as string;
      out.push({ pkg, name, importer });
    }
  }
  return out;
}

/** The export names of a shared package on the main script's side. */
async function mainScriptExports(pkg: string, threeModule: string): Promise<Set<string>> {
  if (pkg === 'three') return new Set(Object.keys(await import(pathToFileURL(threeModule).href)));
  const dist = path.join(
    WORKSPACE_ROOT,
    'packages',
    pkg.replace('@mk7s/holochart-', ''),
    'dist/index.js',
  );
  if (!existsSync(dist)) {
    throw new Error(`[holochart:iife-3d] ${relative(dist)} is missing: build ${pkg} first.`);
  }
  return new Set(Object.keys(await import(pathToFileURL(dist).href)));
}

/** The value names a module exports by name (`export { a } from`, `export const a`, `export * as a`). */
function exportedNames(program: AstNode): string[] {
  const names: string[] = [];
  const nameOf = (node: AstNode): string => (node['name'] ?? node['value']) as string;
  for (const node of program['body'] as AstNode[]) {
    if (node['exportKind'] === 'type') continue;
    if (node.type === 'ExportAllDeclaration') {
      if (node['exported'] != null) names.push(nameOf(node['exported'] as AstNode));
    } else if (node.type === 'ExportNamedDeclaration') {
      for (const spec of (node['specifiers'] as AstNode[] | undefined) ?? []) {
        if (spec['exportKind'] !== 'type') names.push(nameOf(spec['exported'] as AstNode));
      }
      const declaration = node['declaration'] as AstNode | null | undefined;
      for (const d of (declaration?.['declarations'] as AstNode[] | undefined) ?? []) {
        names.push(nameOf(d['id'] as AstNode));
      }
      if (declaration?.['id'] != null) names.push(nameOf(declaration['id'] as AstNode));
    }
  }
  return names;
}

/**
 * rolldown plugin of the 3D add-on (see the module comment). `threeModule`: absolute path of
 * `packages/holochart/src/iife/three.ts` (the three.js names the main script shares); `entry`:
 * absolute path of the add-on entry; `globalModules`: absolute paths of the modules whose named
 * exports are the properties of `window.Holochart` (the public list, `exports.ts`, and the
 * `@internal` names shared with the add-on, `iife/addon-shared.ts`, which is the last one).
 */
export function iife3DAddonPlugin(options: {
  threeModule: string;
  entry: string;
  globalModules: readonly string[];
}) {
  const imports: SharedImport[] = [];
  return {
    name: 'holochart:iife-3d',
    resolveId: {
      order: 'pre' as const,
      handler(source: string, importer: string | undefined) {
        if (source === RENDER_3D_CHUNKS) return RENDER_3D_CHUNKS_ID;
        const pkg = sharedPackage(source, importer);
        if (pkg) return { id: pkg, external: true };
        if (source.startsWith('@mk7s/holochart') && source !== '@mk7s/holochart-traces-3d') {
          throw new Error(
            `[holochart:iife-3d] ${importer ? relative(importer) : '?'} imports ${source}, which the main script doesn't share with add-ons (see ADDON_GLOBALS).`,
          );
        }
        return null;
      },
    },
    load(id: string) {
      if (id !== RENDER_3D_CHUNKS_ID) return null;
      const chunk = (file: string) => JSON.stringify(path.join(RENDER_SRC, 'primitives', file));
      return `export * as mesh from ${chunk('mesh-lazy.ts')};\nexport * as linesMarkers3D from ${chunk('lines-markers-3d.ts')};\nexport * as extrusion from ${chunk('extrusion-lazy.ts')};\n`;
    },
    transform: {
      filter: { id: /\.ts$/ },
      handler(this: PluginContext, code: string, id: string) {
        const program = this.parse(code, { lang: 'ts' });
        imports.push(...sharedImports(program, id, (msg) => this.error(msg)));
        return null;
      },
    },
    async buildEnd(this: PluginContext, error?: Error) {
      if (error) return;
      const exports = new Map<string, Set<string>>();
      // The properties of `window.Holochart`: the named exports of the main script's lists.
      const onGlobal = new Set(
        options.globalModules.flatMap((file) =>
          exportedNames(this.parse(readFileSync(file, 'utf8'), { lang: 'ts' })),
        ),
      );
      const shared = options.globalModules[options.globalModules.length - 1]!;
      const missing: string[] = [];
      for (const { pkg, name, importer } of imports) {
        if (!exports.has(pkg)) exports.set(pkg, await mainScriptExports(pkg, options.threeModule));
        const exported = exports.get(pkg)!.has(name);
        if (exported && (ADDON_GLOBALS[pkg] !== 'Holochart' || onGlobal.has(name))) continue;
        const fix =
          pkg === 'three'
            ? `add it to ${relative(options.threeModule)}`
            : exported
              ? `add it to ${relative(shared)}`
              : `export it from ${pkg}'s index`;
        missing.push(`${relative(importer)}: '${name}' from ${pkg} (${fix})`);
      }
      if (missing.length > 0) {
        this.error(
          `the 3D add-on imports names the main script doesn't share:\n  ${[...new Set(missing)].join('\n  ')}`,
        );
      }
    },
    generateBundle(this: PluginContext, _options: unknown, bundle: Record<string, Chunk>) {
      const allowed = (id: string) =>
        id === options.entry ||
        id === RENDER_3D_CHUNKS_ID ||
        TRACES_3D_MODULE.test(id) ||
        RENDER_3D_MODULE.test(id) ||
        VIEW3D_VIEW_MODULE.test(id) ||
        EXPORTS_3D_MODULE.test(id) ||
        RENDER_COPIED_MODULE.test(id);
      const extra = Object.values(bundle)
        .flatMap((chunk) => chunk.moduleIds ?? [])
        .filter((id) => !allowed(id) && !id.startsWith('\0'));
      if (extra.length > 0) {
        this.error(
          `the 3D add-on must bundle only 3D code (the rest comes from the main script):\n  ${extra.map(relative).join('\n  ')}`,
        );
      }
    },
  };
}
