/**
 * Where the built-in default font's files come from in the `<script>` (IIFE) build: the OTF files
 * shipped next to the script, in `fonts/` (plan E2.18, ADR-015).
 *
 * The IIFE build swaps this module in for `default-font-files.ts` (see
 * `packages/holochart/tsdown.config.ts`). A single script cannot load lazy chunks, and inlining
 * four fonts (~720 kB as base64) would make every page pay for faces it never draws, so the faces
 * stay separate files, fetched only when text needs them: `holochart.iife.min.js` loaded from
 * `https://cdn.example/holochart/dist/` draws with
 * `https://cdn.example/holochart/dist/fonts/texgyreheros-regular.otf`, and so on.
 *
 * The script's URL is read while the script first runs (`document.currentScript` is only set
 * then). If it can't be found (e.g. the bundle was concatenated into another file), the fonts
 * resolve against the page URL; pages that serve them elsewhere set
 * `configureText({ defaultFontFaces })`.
 */
import type { DefaultFontFile } from './default-font-files.ts';

/** Folder next to the script that holds the font files (see the holochart package's `files`). */
export const SCRIPT_FONTS_FOLDER = 'fonts/';

/** URL of the running script, if it can be determined. Exported for tests. */
export function findScriptURL(doc: Document | undefined): string | undefined {
  if (!doc) return undefined;
  const current = doc.currentScript as { src?: unknown } | null;
  if (current && typeof current.src === 'string' && current.src !== '') return current.src;
  // Not evaluated as the first run of a classic script: look for the Holochart script tag.
  const scripts = doc.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i]?.src ?? '';
    if (/\/holochart[^/]*\.js([?#]|$)/.test(src)) return src;
  }
  return undefined;
}

/** Captured at evaluation time, while `document.currentScript` is still this script. */
const SCRIPT_URL = findScriptURL(typeof document === 'undefined' ? undefined : document);

/** URL of a font file shipped next to the script at `scriptURL` (else next to the page). */
export function scriptFontURL(file: string, scriptURL: string | undefined = SCRIPT_URL): string {
  const base = scriptURL ?? (typeof document === 'undefined' ? undefined : document.baseURI);
  return base ? new URL(SCRIPT_FONTS_FOLDER + file, base).href : SCRIPT_FONTS_FOLDER + file;
}

const face = (file: string, weight: number, style: 'normal' | 'italic'): DefaultFontFile => ({
  file,
  weight,
  style,
  load: () => Promise.resolve(scriptFontURL(file)),
});

/** Same faces as `default-font-files.ts`, as files next to the script. */
export const DEFAULT_FONT_FILES: readonly DefaultFontFile[] = [
  face('texgyreheros-regular.otf', 400, 'normal'),
  face('texgyreheros-bold.otf', 700, 'normal'),
  face('texgyreheros-italic.otf', 400, 'italic'),
  face('texgyreheros-bolditalic.otf', 700, 'italic'),
];
