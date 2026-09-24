import { fonts } from '@mk7s/holochart';
import { configureText } from '@mk7s/holochart-render';

/**
 * Vendored Inter v4.1 (SIL OFL 1.1, see ./fonts/OFL.txt), for examples that demonstrate
 * registering a custom web font. The default look needs no font setup: charts draw text with the
 * renderer's shipped TeX Gyre Heros (ADR-021). The files are the upstream WOFF2 builds re-wrapped
 * as WOFF (identical glyph data), because troika cannot decode WOFF2. URLs are resolved relative
 * to this module, which Vite rewrites to served asset URLs.
 */
const url = (file: string): string => new URL(`./fonts/${file}`, import.meta.url).href;

/** Family name under which {@link registerInter} registers the vendored faces. */
export const INTER = 'Inter';

let registered = false;

/**
 * Register Inter (regular, bold, italic, bold italic) with `fonts.register`, the public API, so
 * any `font.family` naming `Inter` draws and measures with it. Leaves the default font alone.
 * Idempotent.
 */
export function registerInter(): void {
  if (registered) return;
  registered = true;
  fonts.register(INTER, {
    regular: url('Inter-Regular.woff'),
    bold: url('Inter-Bold.woff'),
    italic: url('Inter-Italic.woff'),
    boldItalic: url('Inter-BoldItalic.woff'),
  });
}

let installed = false;

/**
 * Register Inter and make it troika's default font (Plotly-look era).
 *
 * @deprecated Examples show the default look, drawn with the shipped default font; call nothing.
 * To demonstrate a web font, use {@link registerInter} and name the family. Kept only until every
 * example has dropped it.
 */
export function useExampleFonts(): void {
  if (installed) return;
  installed = true;
  // troika reads its configuration once, before the first font request.
  configureText({ defaultFontURL: url('Inter-Regular.woff') });
  registerInter();
}
