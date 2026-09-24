/**
 * @mk7s/holochart-themes — the built-in templates (plan E8.1): Holochart's own `holochart`,
 * `holochart-dark`, `high-contrast` and `neon`, and plotly.py's `plotly`, `plotly_white`,
 * `plotly_dark`, `simple_white`, `ggplot2`, `seaborn`, `presentation`, `xgridoff`, `ygridoff`,
 * `gridon` and `none`.
 *
 * The full `@mk7s/holochart` bundle registers them all ({@link builtinThemes}), so
 * `layout.template: 'plotly_dark'` (or `'seaborn+presentation'`) just works. With the runtime
 * alone, register the ones you use: `register(defineTheme('neon'))` or `register(...builtinThemes)`.
 * Named palettes and colorscales live in core (`colors`, `colorways`, `registerBuiltinColors`).
 */
import type { Template } from '@mk7s/holochart-core';
import { highContrast, holochart, holochartDark, neon } from './holochart.ts';
import {
  ggplot2,
  gridon,
  none,
  plotly,
  plotly_dark,
  plotly_white,
  presentation,
  seaborn,
  simple_white,
  xgridoff,
  ygridoff,
} from './plotly.ts';

export { highContrast, holochart, holochartDark, neon } from './holochart.ts';
export {
  ggplot2,
  gridon,
  none,
  plotly,
  plotly_dark,
  plotly_white,
  presentation,
  seaborn,
  simple_white,
  xgridoff,
  ygridoff,
} from './plotly.ts';

/** Every built-in theme by its registered name. */
export const THEMES = {
  holochart,
  'holochart-dark': holochartDark,
  plotly,
  plotly_white,
  plotly_dark,
  simple_white,
  ggplot2,
  seaborn,
  presentation,
  xgridoff,
  ygridoff,
  gridon,
  none,
  'high-contrast': highContrast,
  neon,
} as const satisfies Record<string, Template>;

/** A built-in theme name. */
export type ThemeName = keyof typeof THEMES;

/** Names of the built-in themes, in the plan's order. */
export const THEME_NAMES = /* @__PURE__ */ Object.keys(THEMES) as ThemeName[];

/**
 * A registrable template module (the runtime's `TemplateModule` shape), so a theme can be passed
 * to `register(...)` like a trace or component.
 */
export interface ThemeModule {
  readonly kind: 'template';
  readonly name: string;
  readonly template: Template;
}

/** The template module for one built-in theme. */
export function defineTheme(name: ThemeName): ThemeModule {
  return { kind: 'template', name, template: THEMES[name] };
}

/** Every built-in theme as a template module: `register(...builtinThemes)`. */
export const builtinThemes: readonly ThemeModule[] = /* @__PURE__ */ THEME_NAMES.map(defineTheme);
