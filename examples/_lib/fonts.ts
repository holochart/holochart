import { configureText, registerFont } from '@mk7s/holochart-render';

/**
 * Vendored Inter v4.1 (SIL OFL 1.1, see ./fonts/OFL.txt) so examples and visual baselines never
 * depend on troika's CDN default font. The files are the upstream WOFF2 builds re-wrapped as WOFF
 * (identical glyph data), because troika cannot decode WOFF2. URLs are resolved relative to this module, which Vite
 * rewrites to served asset URLs.
 */
const faces = [
  { file: 'Inter-Regular.woff', weight: 400, style: 'normal' },
  { file: 'Inter-Bold.woff', weight: 700, style: 'normal' },
  { file: 'Inter-Italic.woff', weight: 400, style: 'italic' },
  { file: 'Inter-BoldItalic.woff', weight: 700, style: 'italic' },
] as const;

const url = (file: string): string => new URL(`./fonts/${file}`, import.meta.url).href;

let installed = false;

/** Register Inter for every weight/style and make it troika's default font. Idempotent. */
export function useExampleFonts(): void {
  if (installed) return;
  installed = true;
  // troika reads its configuration once, before the first font request.
  configureText({ defaultFontURL: url('Inter-Regular.woff') });
  for (const { file, weight, style } of faces) {
    registerFont({ family: 'Inter', url: url(file), weight, style });
  }
}
