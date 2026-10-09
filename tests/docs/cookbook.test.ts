import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assert, describe, expect, it } from 'vitest';
import recipes from '../../apps/docs/cookbook/catalog.json';
import { exampleIds, lintPage, parsePage } from '../../apps/docs/scripts/lint-pages.ts';
import { chartFamilies } from '../../examples/_lib/families.ts';
import { readManifest, REPO_ROOT } from '../../tools/gallery-gen/src/manifest.ts';
import { buildCookbookCatalog } from '../../apps/docs/scripts/cookbook-catalog.ts';
import { captureCookbookFigure } from './cookbook-capture.ts';

interface Figure {
  data: {
    type?: string;
    x?: number[] | string[];
    y?: (number | null)[];
    xaxis?: string;
    yaxis?: string;
    name?: string;
    orientation?: string;
    connectgaps?: boolean;
    hovertemplate?: string;
    customdata?: string[];
    fill?: string;
    legendgroup?: string;
    line?: { width?: number };
    marker?: { color?: string[] };
  }[];
  layout: {
    grid?: { rows: number; columns: number; pattern: string };
    template?: string;
    xaxis?: { type?: string; tickformatstops?: unknown[]; ticklabelmode?: string };
    [key: string]: unknown;
  };
  config?: { responsive?: boolean };
}
async function figure(id: string): Promise<Figure> {
  return captureCookbookFigure<Figure>(REPO_ROOT, id);
}
const manifest = readManifest()!;
const docsRoot = path.join(REPO_ROOT, 'apps/docs');

describe('cookbook source contracts', () => {
  it('keeps recipes discoverable and links only canonical sources and verified Python variants', () => {
    const directory = buildCookbookCatalog(docsRoot);
    expect(directory.map((entry) => entry.slug)).toEqual(recipes.map((recipe) => recipe.slug));
    expect(directory.filter((entry) => entry.python)).toHaveLength(5);
    expect(JSON.stringify(directory)).not.toContain('browserSourceHashes');
    const known = new Set(manifest.examples.map((entry) => entry.id));
    expect(recipes).toHaveLength(10);
    expect(new Set(recipes.map((recipe) => recipe.slug)).size).toBe(10);
    expect(new Set(recipes.map((recipe) => recipe.example)).size).toBe(10);
    for (const recipe of recipes) {
      const source = readFileSync(path.join(docsRoot, `cookbook/${recipe.slug}.md`), 'utf8');
      const page = parsePage(`cookbook/${recipe.slug}.md`, source);
      const entry = manifest.examples.find((entry) => entry.id === recipe.example)!;
      const card = directory.find((entry) => entry.slug === recipe.slug)!;
      expect(card.thumbnail).toBe(entry.thumbnail);
      expect(card.thumbnailSize).toEqual(entry.thumbnailSize);
      expect(page.frontmatter['status']).toBe('complete');
      expect(page.frontmatter['recipe-example']).toBe(recipe.example);
      expect(exampleIds(page.body)).toEqual([recipe.example]);
      expect(lintPage(page, known)).toEqual([]);
      expect(source).toContain(`(/gallery/sources/${recipe.example}.js)`);
      expect(source).toContain(`(/gallery/example/${recipe.example})`);
      expect(
        entry.variants.some((variant) => variant.source === `examples/${recipe.example}.ts`),
      ).toBe(true);
      const python = entry.variants.find((variant) => variant.language === 'python');
      expect(Boolean(python), recipe.slug).toBe(recipe.python);
      if (python) {
        expect(python.verification.browserVerified).toBe(true);
        expect(python.verification.state).toBe('rendered');
        expect(
          createHash('sha256')
            .update(readFileSync(path.join(REPO_ROOT, python.source)))
            .digest('hex'),
        ).toBe(python.verification.sourceSha256);
        assert(python.download, 'Python variants must include a download');
        const links = /<NotebookLinks\s+([^>]+)>/.exec(source)?.[1];
        expect(links).toContain(`variant="${path.basename(python.download, '.py')}"`);
        expect(links).toContain(`slug="${path.basename(python.notebook!, '.ipynb')}"`);
      } else expect(source).not.toMatch(/<NotebookLinks\b|\]\(\/notebooks\//);
      for (const family of recipe.families) {
        expect(chartFamilies.some((entry) => entry.id === family)).toBe(true);
        expect(source).toContain(`(/gallery/${family}/)`);
      }
    }
  });

  it('uses real coupled, independent and matched range relationships', async () => {
    const small = await figure('layout/grid-coupled');
    expect(small.layout.grid).toEqual({ rows: 2, columns: 2, pattern: 'coupled' });
    expect(small.data.map((trace) => [trace.xaxis ?? 'x', trace.yaxis ?? 'y'])).toEqual([
      ['x', 'y'],
      ['x2', 'y'],
      ['x', 'y2'],
      ['x2', 'y2'],
    ]);
    const linked = await figure('axes/linked-axes');
    expect(linked.data).toHaveLength(4);
    for (const number of [2, 3, 4]) {
      expect(linked.layout[`xaxis${number}`]).toEqual({ matches: 'x' });
      expect(linked.layout[`yaxis${number}`]).toEqual({ matches: 'y' });
    }
    const dashboard = await figure('layout/grid-independent');
    expect(dashboard.data).toHaveLength(6);
    expect(dashboard.layout.grid).toEqual({ rows: 2, columns: 3, pattern: 'independent' });
    expect(dashboard.config?.responsive).toBe(true);
  });

  it('preserves ranking labels and missing samples instead of silently changing data', async () => {
    const ranked = (await figure('recipes/ranked-bars')).data[0]!;
    expect(ranked.orientation).toBe('h');
    expect(ranked.x).toEqual([1.7, 2.4, 5.2, 7.3, 9.6, 14.1, 21.5, 38.2]);
    const categories = ranked.y as unknown as string[];
    expect(categories.at(-1)).toBe('Search engines');
    expect(ranked.marker?.color?.[categories.indexOf('Social networks')]).toBe('#ea2a37');
    const gaps = (await figure('line/gaps')).data;
    expect(gaps[0]!.y!.filter((value) => value === null)).toHaveLength(8);
    expect(gaps[0]!.y!.filter((value) => Number.isNaN(value))).toHaveLength(1);
    expect(gaps[1]!.connectgaps).toBe(true);
    expect(gaps[0]!.x).toHaveLength(48);
    expect(gaps[1]!.y![0]).toBeCloseTo(gaps[0]!.y![0]! + 8);
  });

  it('uses paired band bounds, UTC date formatting and actual hover metadata', async () => {
    const band = (await figure('area/band')).data;
    expect(band[1]!.fill).toBe('tonexty');
    expect(band[0]!.x).toEqual(band[1]!.x);
    expect(band[0]!.legendgroup).toBe(band[1]!.legendgroup);
    expect(band[0]!.line?.width).toBe(0);
    band[0]!.y!.forEach((lower, index) => expect(lower!).toBeLessThanOrEqual(band[1]!.y![index]!));
    const dates = await figure('timeseries/date-formatting');
    expect(dates.data[0]!.x).toHaveLength(548);
    expect(dates.data[0]!.x![0]).toBe(Date.UTC(2024, 6, 1));
    expect(dates.layout.xaxis?.type).toBe('date');
    expect(dates.layout.xaxis?.tickformatstops).toHaveLength(4);
    expect(dates.layout.xaxis?.ticklabelmode).toBe('period');
    const hover = (await figure('scatter/interactive')).data;
    expect(hover).toHaveLength(3);
    for (const trace of hover) {
      expect(trace.customdata).toHaveLength(10);
      expect(trace.hovertemplate).toContain('%{customdata}');
      expect(trace.hovertemplate).toContain('%{y:.1f}');
    }
  });

  it('keeps mixed measures on aligned axes and changes theme without private imports', async () => {
    const mixed = (await figure('line/with-bars')).data;
    expect(mixed.map((trace) => trace.type)).toEqual(['scatter', 'bar']);
    expect(mixed[0]!.x).toEqual(mixed[1]!.x);
    expect(mixed[1]!.yaxis).toBeUndefined();
    const theme = await figure('themes/plotly_white');
    expect(theme.layout.template).toBe('plotly_white');
    expect(theme.data).toHaveLength(5);
  });
});
