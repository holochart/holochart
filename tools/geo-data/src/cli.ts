/**
 * `pnpm --filter @mk7s/holochart-geo-data build`: rebuild the basemap data modules of
 * `@mk7s/holochart-traces-geo` from Natural Earth (ADR-024). The modules are checked in; run this
 * after changing the build or the pinned Natural Earth release.
 *
 * - `--offline`: fail instead of downloading a source file that is not in `.cache/`.
 * - `--check`: write nothing; exit 1 when a module on disk differs from what the build gives.
 * - `--measure`: write nothing; print the size and displacement of each candidate grid.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildBasemap, type BuildSources } from './build.ts';
import { GRID, RESOLUTIONS, type Resolution } from './config.ts';
import { moduleName, moduleSize, moduleText, type Part } from './emit.ts';
import { readSource } from './sources.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'packages', 'traces-geo', 'src', 'basemap', 'generated');

/** Grids compared by `--measure` (ADR-024 leaves the choice to the measurement). */
const CANDIDATE_GRIDS = [1e4, 2e4, 5e4, 1e5];

const flags = new Set(process.argv.slice(2));
const offline = flags.has('--offline');

async function sources(resolution: Resolution): Promise<BuildSources> {
  const [countries, lakes, rivers, subunits] = await Promise.all([
    readSource(resolution, 'countries', { offline }),
    readSource(resolution, 'lakes', { offline }),
    readSource(resolution, 'rivers', { offline }),
    readSource(resolution, 'subunits', { offline }),
  ]);
  return { countries, lakes, rivers, subunits };
}

const kB = (bytes: number): string => (bytes / 1000).toFixed(1).padStart(7);

async function measure(): Promise<void> {
  console.log('resolution    grid  max move  base min / gzip kB  extras min / gzip kB  dropped');
  for (const resolution of RESOLUTIONS) {
    const input = await sources(resolution);
    for (const grid of CANDIDATE_GRIDS) {
      const { base, extras, report } = buildBasemap(input, { grid });
      const b = moduleSize(base);
      const e = moduleSize(extras);
      const dropped = Object.entries(report.droppedPolygons)
        .map(([name, count]) => `${count} ${name}`)
        .concat(report.droppedFeatures.map((name) => `all of ${name}`))
        .join(', ');
      console.log(
        `${String(resolution).padStart(9)}m ${String(grid).padStart(7)} ${report.maxDisplacementKm.toFixed(2).padStart(6)} km ` +
          `${kB(b.min)} /${kB(b.gzip)}    ${kB(e.min)} /${kB(e.gzip)}      ${dropped || 'nothing'}`,
      );
    }
  }
}

async function build(check: boolean): Promise<void> {
  let stale = false;
  for (const resolution of RESOLUTIONS) {
    const built = buildBasemap(await sources(resolution), { grid: GRID[resolution] });
    const { report } = built;
    console.log(
      `1:${resolution}m on a ${report.grid} grid (vertices move at most ${report.maxDisplacementKm.toFixed(2)} km): ` +
        `${report.countries} countries, ${report.subunits} subunits, ${report.lakes} lakes, ${report.rivers} river stretches`,
    );
    console.log(`  without an id: ${report.withoutId.join(', ') || 'none'}`);
    const dropped = Object.entries(report.droppedPolygons).map(([name, n]) => `${n} of ${name}`);
    console.log(`  polygons that collapse on the grid: ${dropped.join(', ') || 'none'}`);
    if (report.droppedFeatures.length) {
      console.log(`  features lost entirely: ${report.droppedFeatures.join(', ')}`);
    }
    console.log(`  label points moved inside: ${report.movedLabels.join(', ') || 'none'}`);
    for (const part of ['base', 'extras'] as Part[]) {
      const file = path.join(OUT_DIR, moduleName(part, resolution));
      const text = moduleText(built[part], part, resolution);
      const size = moduleSize(built[part]);
      const rel = path.relative(REPO_ROOT, file);
      if (check) {
        const same = existsSync(file) && (await readFile(file, 'utf8')) === text;
        if (!same) stale = true;
        console.log(`  ${same ? 'up to date' : 'STALE'} ${rel}`);
      } else {
        await mkdir(OUT_DIR, { recursive: true });
        await writeFile(file, text);
        console.log(`  wrote ${rel}: ${kB(size.min)} kB min, ${kB(size.gzip)} kB gzip`);
      }
    }
  }
  if (stale) {
    console.error('geo-data: the checked-in modules are stale; run the build without --check.');
    process.exitCode = 1;
  }
}

if (flags.has('--measure')) await measure();
else await build(flags.has('--check'));
