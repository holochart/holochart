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
import {
  finishReport,
  packageStability,
  publicNames,
  reportFileName,
  type ReportPackage,
} from './report.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const REPORTS = join(ROOT, 'api-reports');
/** Lines of a stale report's diff printed by `--check`. */
const MAX_DIFF_LINES = 80;

interface Package extends ReportPackage {
  /** Absolute package directory. */
  readonly dir: string;
}

/** A package's bundled declarations: what API Extractor analyses. */
function entryPoint(dir: string): string {
  const entry = join(dir, 'dist/index.d.ts');
  if (!existsSync(entry)) {
    throw new Error(`${relative(ROOT, entry)} is missing: run \`pnpm build:packages\` first.`);
  }
  return entry;
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
    packages.push({
      name: manifest.name,
      dir,
      stability: packageStability(readFileSync(join(dir, 'src/index.ts'), 'utf8')),
      publicNames: publicNames(readFileSync(entryPoint(dir), 'utf8')),
    });
  }
  return packages;
}

let versionNoticePrinted = false;

/** The report API Extractor generates for `pkg`, unprocessed. */
function extract(pkg: Package, tempDir: string): string {
  const entry = entryPoint(pkg.dir);
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
  let written = 0;
  try {
    if (!check) mkdirSync(REPORTS, { recursive: true });
    const expected = new Set<string>();
    for (const pkg of packages) {
      const fileName = reportFileName(pkg.name);
      expected.add(fileName);
      const path = join(REPORTS, fileName);
      const fresh = finishReport(extract(pkg, tempDir), pkg, experimental);
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
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
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
