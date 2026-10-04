/**
 * API reports (backlog S2.13): one `api-reports/<package>.api.md` per published package, listing
 * every export of its entry point with its signature and stability tag, so a change to the public
 * API shows up as a diff in review. See `api-reports/README.md`.
 *
 * Usage (on built packages; the root scripts build first):
 *
 * - `pnpm api:report`: regenerate every report. `node tools/api-report/src/cli.ts`.
 * - `pnpm api:check`: fail when a committed report differs from a fresh one (CI).
 *   `node tools/api-report/src/cli.ts --check`.
 *
 * How it works: API Extractor analyses each package's bundled `dist/index.d.ts` (what users get,
 * `@internal` members already stripped, ADR-015), configured here rather than by one
 * `api-extractor.json` per package. Its report goes to a temporary folder, `finishReport` adds
 * the stability tags, and the result is written or compared. The reports depend only on the built
 * declarations and the pinned API Extractor, so regenerating is deterministic.
 *
 * Two things are not API Extractor's: the report of `@mk7s/holochart/global` (the members of
 * `window.Holochart`, read with the compiler: `GLOBALS`), and a check that the full bundle's export
 * list matches the tags of the packages it lists (`FULL_BUNDLE`), which fails both commands.
 *
 * API Extractor bundles its own TypeScript (5.9, ADR-015 "Alternatives"), older than the
 * repo's. It only has to parse declaration files, which TypeScript 6 writes in syntax 5.9 reads;
 * its "newer TypeScript" notice is printed once. Compiler errors it reports are printed, since
 * they would mean a declaration it could not read.
 */
import {
  Extractor,
  ExtractorConfig,
  ExtractorLogLevel,
  type ExtractorMessage,
} from '@microsoft/api-extractor';
import { createTwoFilesPatch } from 'diff';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import {
  finishReport,
  globalReport,
  listedBundleProblems,
  packageStability,
  publicNames,
  reportFileName,
  type GlobalMember,
  type ListedBundle,
  type ReportPackage,
} from './report.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const REPORTS = join(ROOT, 'api-reports');
/** Lines of a stale report's diff printed by `--check`. */
const MAX_DIFF_LINES = 80;

interface Package extends ReportPackage {
  /** Absolute package directory. */
  readonly dir: string;
  /** Absolute path of the declarations the report is made from. */
  readonly entry: string;
  /** Set for the types of a global ({@link GLOBALS}): reported by {@link globalReport}. */
  readonly global?: GlobalTypes;
}

/** A hand-written declaration file that types a global of a script-tag build. */
interface GlobalTypes {
  /** The file, relative to the package. */
  readonly file: string;
  /** The exported type of the global. */
  readonly type: string;
  /** The global variable. */
  readonly variable: string;
  /** Report of the package whose exports the global's members are. */
  readonly signatures: string;
}

/** A package's bundled declarations: what API Extractor analyses. */
function entryPoint(dir: string): string {
  const entry = join(dir, 'dist/index.d.ts');
  if (!existsSync(entry)) {
    throw new Error(`${relative(ROOT, entry)} is missing: run \`pnpm build:packages\` first.`);
  }
  return entry;
}

/**
 * Subpath entry points that type a global, by package and subpath. They get a report of their own
 * (the members of the global), not API Extractor's: such a file builds the global's type from the
 * package's own bundled declarations, which API Extractor would report a second time, in full.
 */
const GLOBALS: Readonly<Record<string, Readonly<Record<string, GlobalTypes>>>> = {
  '@mk7s/holochart': {
    // `window.Holochart`, the script-tag build's global.
    global: {
      file: 'global.d.ts',
      type: 'HolochartGlobal',
      variable: 'Holochart',
      signatures: 'holochart.api.md',
    },
  },
};

/**
 * The full bundle lists its exports by name (`packages/holochart/src/exports.ts`,
 * `exports-3d.ts`): everything the packages below export but their `@internal` plumbing. The
 * other packages are namespaces of the bundle (`render`, `themes`, `express`) or not in it
 * (`locales`).
 */
const FULL_BUNDLE: ListedBundle = {
  name: '@mk7s/holochart',
  packages: [
    '@mk7s/holochart-core',
    '@mk7s/holochart-runtime',
    '@mk7s/holochart-components',
    '@mk7s/holochart-traces-basic',
    '@mk7s/holochart-traces-stats',
    '@mk7s/holochart-traces-sci',
    '@mk7s/holochart-traces-finance',
    '@mk7s/holochart-traces-hier',
    '@mk7s/holochart-traces-3d',
  ],
  // How a partial bundle wires 2.5D bars; the full bundle does it itself.
  except: ['setBarExtruder', 'BarExtruder'],
};

/** What reading declarations needs of the compiler (as API Extractor is configured below). */
const DECLARATION_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  types: [],
  noEmit: true,
};

/** The members of the global type `pkg.global` declares, read with the compiler. */
function globalMembers(pkg: Package & { global: GlobalTypes }): GlobalMember[] {
  const program = ts.createProgram({ rootNames: [pkg.entry], options: DECLARATION_OPTIONS });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(pkg.entry);
  const module = source && checker.getSymbolAtLocation(source);
  const symbol =
    module && checker.getExportsOfModule(module).find((s) => s.name === pkg.global.type);
  if (!symbol) {
    throw new Error(`${relative(ROOT, pkg.entry)} does not export the type ${pkg.global.type}.`);
  }
  const members = checker
    .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))
    .map((member) => ({
      name: member.name,
      optional: (member.flags & ts.SymbolFlags.Optional) !== 0,
    }));
  if (members.length === 0) {
    throw new Error(`${pkg.global.type} has no members: is ${pkg.name} built?`);
  }
  return members;
}

/** Every publishable package of the workspace (`packages/*`, not private), by directory name. */
function publishedPackages(): Package[] {
  const packages: Package[] = [];
  for (const entry of readdirSync(join(ROOT, 'packages')).sort()) {
    const dir = join(ROOT, 'packages', entry);
    const manifestPath = join(dir, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name: string;
      private?: boolean;
    };
    if (manifest.private) continue;
    const stability = packageStability(readFileSync(join(dir, 'src/index.ts'), 'utf8'));
    packages.push({
      name: manifest.name,
      dir,
      entry: entryPoint(dir),
      stability,
      publicNames: publicNames(readFileSync(entryPoint(dir), 'utf8')),
    });
    for (const [subpath, global] of Object.entries(GLOBALS[manifest.name] ?? {})) {
      packages.push({
        name: `${manifest.name}/${subpath}`,
        dir,
        entry: join(dir, global.file),
        stability,
        publicNames: new Set(),
        global,
      });
    }
  }
  return packages;
}

let versionNoticePrinted = false;

/** The report API Extractor generates for `pkg`, unprocessed. */
function extract(pkg: Package, tempDir: string): string {
  const { entry } = pkg;
  const fileName = reportFileName(pkg.name);
  const none = { logLevel: ExtractorLogLevel.None };
  const config = ExtractorConfig.prepare({
    // No config file on disk: this path only anchors relative paths and messages.
    configObjectFullPath: join(pkg.dir, 'api-extractor.json'),
    packageJsonFullPath: join(pkg.dir, 'package.json'),
    configObject: {
      projectFolder: pkg.dir,
      mainEntryPointFilePath: entry,
      newlineKind: 'lf',
      compiler: {
        // The declarations are self-contained; the packages' own tsconfig (source conditions,
        // `.ts` import extensions) is for building them, not for reading them.
        overrideTsconfig: {
          compilerOptions: {
            target: 'ES2022',
            lib: ['ES2023', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            skipLibCheck: true,
            types: [],
          },
          files: [entry],
        },
      },
      apiReport: {
        enabled: true,
        reportFileName: fileName.replace(/\.api\.md$/, ''),
        reportFolder: join(tempDir, 'report'),
        reportTempFolder: join(tempDir, 'temp'),
        // Types an export refers to but the entry point does not export are part of its shape:
        // list them too (each use is flagged `ae-forgotten-export`).
        includeForgottenExports: true,
        tagsToReport: { '@experimental': true },
      },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
      messages: {
        compilerMessageReporting: { default: { logLevel: ExtractorLogLevel.Warning } },
        extractorMessageReporting: {
          // The reports are about the export surface; doc-comment hygiene is TypeDoc's and the
          // docs gates' business.
          default: none,
          'ae-forgotten-export': { logLevel: ExtractorLogLevel.Warning, addToApiReportFile: true },
          // A stable or experimental export whose signature needs an `@internal` type: flagged
          // in the report like a forgotten export, so the leak is fixed or shows in review.
          'ae-incompatible-release-tags': {
            logLevel: ExtractorLogLevel.Warning,
            addToApiReportFile: true,
          },
        },
        tsdocMessageReporting: { default: none },
      },
    },
  });
  const result = Extractor.invoke(config, {
    // Writes the report instead of comparing it: comparing is done here, after `finishReport`.
    localBuild: true,
    messageCallback: (message: ExtractorMessage) => {
      switch (message.messageId) {
        case 'console-compiler-version-notice':
          if (!versionNoticePrinted) console.log(`  note: ${message.text.trim()}`);
          versionNoticePrinted = true;
          message.handled = true;
          break;
        case 'console-preamble':
        case 'console-writing-api-report':
        case 'console-api-report-created':
        case 'console-api-report-not-copied':
        case 'console-api-report-copied':
        case 'console-api-report-unchanged':
          message.handled = true;
          break;
      }
    },
  });
  if (!result.succeeded) {
    throw new Error(
      `API Extractor failed for ${pkg.name}: ${result.errorCount} error(s), ` +
        `${result.warningCount} warning(s).`,
    );
  }
  return readFileSync(join(tempDir, 'temp', fileName), 'utf8');
}

function main(): void {
  const check = process.argv.includes('--check');
  const packages = publishedPackages();
  const experimental = new Set(
    packages.filter((pkg) => pkg.stability === 'experimental').map((pkg) => pkg.name),
  );
  const tempDir = mkdtempSync(join(tmpdir(), 'holochart-api-report-'));
  // API Extractor copies its report here (unused) and does not create the folder itself.
  mkdirSync(join(tempDir, 'report'));
  const stale: string[] = [];
  const unlisted: string[] = [];
  let written = 0;
  try {
    if (!check) mkdirSync(REPORTS, { recursive: true });
    const expected = new Set<string>();
    const reports = new Map<string, string>();
    for (const pkg of packages) {
      const fileName = reportFileName(pkg.name);
      expected.add(fileName);
      const path = join(REPORTS, fileName);
      const fresh = pkg.global
        ? globalReport(
            pkg.name,
            pkg.global.variable,
            pkg.global.signatures,
            globalMembers({ ...pkg, global: pkg.global }),
          )
        : finishReport(extract(pkg, tempDir), pkg, experimental);
      reports.set(pkg.name, fresh);
      const committed = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
      if (committed === fresh) continue;
      if (!check) {
        writeFileSync(path, fresh);
        written++;
        console.log(`  ${committed === undefined ? 'created' : 'updated'} api-reports/${fileName}`);
        continue;
      }
      stale.push(fileName);
      console.error(
        `\napi-reports/${fileName} is ${committed === undefined ? 'missing' : 'stale'}:`,
      );
      if (committed !== undefined) {
        const patch = createTwoFilesPatch(
          `api-reports/${fileName} (committed)`,
          `api-reports/${fileName} (from this build)`,
          committed,
          fresh,
          undefined,
          undefined,
          { context: 2 },
        ).split('\n');
        console.error(patch.slice(0, MAX_DIFF_LINES).join('\n'));
        if (patch.length > MAX_DIFF_LINES) {
          console.error(`… ${patch.length - MAX_DIFF_LINES} more lines`);
        }
      }
    }
    // Reports of packages that no longer exist.
    const orphans = existsSync(REPORTS)
      ? readdirSync(REPORTS).filter((file) => file.endsWith('.api.md') && !expected.has(file))
      : [];
    for (const file of orphans) {
      if (check) {
        stale.push(file);
        console.error(`\napi-reports/${file} has no published package.`);
      } else {
        rmSync(join(REPORTS, file));
        written++;
        console.log(`  removed api-reports/${file}`);
      }
    }
    unlisted.push(...listedBundleProblems(FULL_BUNDLE, reports));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  if (unlisted.length > 0) {
    console.error(
      `\n${FULL_BUNDLE.name} and the packages it lists disagree (see api-reports/README.md):\n` +
        unlisted.map((problem) => `  - ${problem}`).join('\n'),
    );
    process.exitCode = 1;
  }

  if (stale.length > 0) {
    console.error(
      `\n${stale.length} API report(s) out of date: ${stale.join(', ')}.\n` +
        'The public API changed. If that is intended, run `pnpm api:report`, review the diff and ' +
        'commit it with your change (and add a changeset); see api-reports/README.md.',
    );
    process.exitCode = 1;
  } else if (check) {
    console.log(`API reports are up to date (${packages.length} packages).`);
  } else {
    console.log(
      written === 0
        ? `API reports unchanged (${packages.length} packages).`
        : `API reports: ${written} file(s) changed. Review and commit api-reports/.`,
    );
  }
}

main();
