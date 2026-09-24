/**
 * The font attributes Plotly added in 2.x beyond family/size/color/weight/style (plan E8.3):
 * `variant`, `textcase`, `lineposition` and `shadow`, shared by `layout.font` (with defaults) and
 * every other font container ({@link fontSchema}, without defaults, so unset fields inherit from
 * `layout.font`).
 */
import { attr } from '../schema/attr.ts';

/** `font.variant` values (CSS `font-variant-caps`). */
export const FONT_VARIANTS = [
  'normal',
  'small-caps',
  'all-small-caps',
  'all-petite-caps',
  'petite-caps',
  'unicase',
] as const;

/** `font.textcase` values. */
export const FONT_TEXTCASES = ['normal', 'word caps', 'upper', 'lower'] as const;

const VARIANT_DESCRIPTION =
  'Capitals variant (CSS `font-variant-caps`). The SDF text renderer approximates small and petite caps with uppercase letters at a reduced size.';
const TEXTCASE_DESCRIPTION =
  'Letter case transform: `upper`, `lower`, `word caps` (first letter of each word), or `normal`.';
const LINEPOSITION_DESCRIPTION =
  'Text decoration: `under`, `over` and/or `through` joined with `+` (e.g. `under+over`), or `none`.';
const SHADOW_DESCRIPTION =
  'CSS `text-shadow` behind the text (`2px 2px 3px black`; only the first shadow is drawn), `none`, or `auto` for a thin halo in the contrast color of the text.';

/** The four attributes without defaults, for containers that inherit from `layout.font`. */
export function fontExtraAttributes() {
  return {
    variant: attr.enumerated({ values: FONT_VARIANTS, description: VARIANT_DESCRIPTION }),
    textcase: attr.enumerated({ values: FONT_TEXTCASES, description: TEXTCASE_DESCRIPTION }),
    lineposition: attr.flaglist({
      flags: ['under', 'over', 'through'],
      extras: ['none'],
      description: LINEPOSITION_DESCRIPTION,
    }),
    shadow: attr.string({ description: SHADOW_DESCRIPTION }),
  };
}

/** The four attributes with Plotly's defaults, for `layout.font`. */
export function layoutFontExtraAttributes() {
  return {
    variant: attr.enumerated({
      values: FONT_VARIANTS,
      dflt: 'normal',
      description: VARIANT_DESCRIPTION,
    }),
    textcase: attr.enumerated({
      values: FONT_TEXTCASES,
      dflt: 'normal',
      description: TEXTCASE_DESCRIPTION,
    }),
    lineposition: attr.flaglist({
      flags: ['under', 'over', 'through'],
      extras: ['none'],
      dflt: 'none',
      description: LINEPOSITION_DESCRIPTION,
    }),
    shadow: attr.string({ dflt: 'none', description: SHADOW_DESCRIPTION }),
  };
}
