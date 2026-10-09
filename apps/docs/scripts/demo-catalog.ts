/** Build-only joins; never import another VitePress data loader at runtime. */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { chartFamilies } from '../../../examples/_lib/families.ts';
import { demoChoices, type DemoChoice } from '../.vitepress/theme/demo-catalog.ts';
import type { GalleryExample } from '../.vitepress/theme/data/gallery.data.ts';

export interface DemoEntry extends DemoChoice {
  title: string;
  route: string;
  notesRoute: string;
  thumbnail: string;
  thumbnailSize: { width: number; height: number };
  familyLinks: { id: string; label: string; route: string }[];
}
export function buildDemoDirectory(
  docsRoot: string,
  examples: readonly GalleryExample[],
  choices: readonly DemoChoice[] = demoChoices,
): DemoEntry[] {
  const byId = new Map(examples.map((entry) => [entry.id, entry]));
  const repoRoot = path.resolve(docsRoot, '../..');
  const seen = new Set<string>();
  return choices.map((choice) => {
    if (seen.has(choice.slug)) throw new Error('Duplicate curated demo: ' + choice.slug);
    seen.add(choice.slug);
    const page = path.join(docsRoot, 'demos', choice.slug + '.md');
    const source = readFileSync(page, 'utf8');
    const title = /^title:\s*(.+)$/m.exec(source)?.[1]?.replace(/^(['"])(.*)\1$/, '$2');
    if (!title || !/^status:\s*complete$/m.test(source))
      throw new Error('Curated demo must have a complete titled page: ' + choice.slug);
    const anchors = [...source.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => {
      const explicit = /\{#([^}]+)\}/.exec(match[1]!);
      return (
        explicit?.[1] ??
        match[1]!
          .toLowerCase()
          .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
          .trim()
          .replace(/\s+/g, '-')
      );
    });
    if (!anchors.includes(choice.notesAnchor))
      throw new Error(
        'Curated data-notes anchor missing: ' + choice.slug + '#' + choice.notesAnchor,
      );
    if (choice.previewKind === 'report' && !source.includes('id="' + choice.previewId + '"'))
      throw new Error('Curated thumbnail is not an example in this report: ' + choice.previewId);
    const preview = byId.get(choice.previewId);
    if (!preview || !existsSync(path.join(docsRoot, 'public', preview.thumbnail)))
      throw new Error('Curated demo thumbnail missing: ' + choice.previewId);
    const reusable = byId.get(choice.reuse.id);
    if (!reusable || reusable.contentKind === 'demo' || choice.reuse.id.startsWith('demos/'))
      throw new Error('Curated demo needs an existing non-demo starter: ' + choice.reuse.id);
    if (
      choice.previewKind === 'report' &&
      !choice.previewId.startsWith('demos/' + choice.slug + '/')
    )
      throw new Error('Report thumbnail must belong to its demo: ' + choice.slug);
    if (choice.dataMode === 'live' && choice.previewKind !== 'technique')
      throw new Error(
        'Live data needs an explicitly labelled static technique preview: ' + choice.slug,
      );
    if (!existsSync(path.join(repoRoot, choice.sourcePath)))
      throw new Error('Curated data evidence missing: ' + choice.sourcePath);
    const demoExamples = examples.filter((entry) =>
      entry.id.startsWith('demos/' + choice.slug + '/'),
    );
    const actualFamilies = new Set<string>(
      demoExamples.flatMap((entry) => [entry.primaryFamily, ...entry.secondaryFamilies]),
    );
    const familyLinks = choice.families.map((id) => {
      const family = chartFamilies.find((family) => family.id === id);
      if (!family || (choice.dataMode !== 'live' && !actualFamilies.has(id)))
        throw new Error('Unsupported curated demo family: ' + choice.slug + '/' + id);
      return { id, label: family.label, route: '/gallery/' + id + '/' };
    });
    return {
      ...choice,
      title,
      route: '/demos/' + choice.slug,
      notesRoute: '/demos/' + choice.slug + '#' + choice.notesAnchor,
      thumbnail: preview.thumbnail,
      thumbnailSize: preview.thumbnailSize,
      familyLinks,
    };
  });
}
