/**
 * Where the built-in default font's files come from, for ESM consumers (plan E2.18, E8.3).
 *
 * Holochart ships TeX Gyre Heros (GUST Font License, a free Helvetica-style family) as the font of
 * every family that is not registered. Each face is a generated module exporting its OTF file as a
 * `data:` URL (`generated/`, from `packages/render/fonts/` by `scripts/fonts/generate-default-
 * fonts.ts`), imported with a static-string dynamic `import()`: every bundler splits it into its
 * own lazy chunk without configuration, and nothing is fetched until text needs that face.
 *
 * The IIFE build replaces this module with `default-font-files.script.ts` (see
 * `packages/holochart/tsdown.config.ts`): a single script cannot split chunks, so it loads the OTF
 * files shipped next to it instead of inlining four fonts.
 */
import type { TextFontStyle } from '../primitives/text-fonts.ts';

/** One face of the built-in default font. */
export interface DefaultFontFile {
  /** File name in the package's `fonts/` folder. */
  readonly file: string;
  readonly weight: number;
  readonly style: TextFontStyle;
  /** Resolve the face's URL (a `data:` URL here), loading its chunk on first call. */
  readonly load: () => Promise<string>;
}

/** The built-in default font's faces: 400/700 × upright/italic. */
export const DEFAULT_FONT_FILES: readonly DefaultFontFile[] = [
  {
    file: 'texgyreheros-regular.otf',
    weight: 400,
    style: 'normal',
    load: () => import('./generated/texgyreheros-regular.ts').then((m) => m.default),
  },
  {
    file: 'texgyreheros-bold.otf',
    weight: 700,
    style: 'normal',
    load: () => import('./generated/texgyreheros-bold.ts').then((m) => m.default),
  },
  {
    file: 'texgyreheros-italic.otf',
    weight: 400,
    style: 'italic',
    load: () => import('./generated/texgyreheros-italic.ts').then((m) => m.default),
  },
  {
    file: 'texgyreheros-bolditalic.otf',
    weight: 700,
    style: 'italic',
    load: () => import('./generated/texgyreheros-bolditalic.ts').then((m) => m.default),
  },
];
