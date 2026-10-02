/**
 * Helpers shared by the periodic-table examples of the chemistry and physics demo: the three broad
 * kinds of element, number formatting and short two-line category names.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import type { Category, Element } from './data.mts';

export type Kind = 'Metal' | 'Metalloid' | 'Nonmetal';

export const KINDS: readonly Kind[] = ['Metal', 'Metalloid', 'Nonmetal'];

/** Metal, metalloid or nonmetal; halogens and noble gases count as nonmetals. */
export function kindOf(e: Element): Kind {
  switch (e.category) {
    case 'Metalloid':
      return 'Metalloid';
    case 'Nonmetal':
    case 'Halogen':
    case 'Noble gas':
      return 'Nonmetal';
    default:
      return 'Metal';
  }
}

/** A number with at most `digits` decimals, thousands separated, no trailing zeros. */
export function fmt(v: number, digits = 2): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** A density in g/cm³: gases need more decimals than solids. */
export function fmtDensity(v: number): string {
  return v < 0.1 ? v.toLocaleString('en-US', { maximumSignificantDigits: 3 }) : fmt(v, 2);
}

/** Category names broken over two lines, for axis ticks. */
export const CATEGORY_TWO_LINES: Record<Category, string> = {
  'Alkali metal': 'Alkali<br>metal',
  'Alkaline earth metal': 'Alkaline<br>earth metal',
  'Transition metal': 'Transition<br>metal',
  'Post-transition metal': 'Post-transition<br>metal',
  Lanthanide: 'Lanthanide',
  Actinide: 'Actinide',
  Metalloid: 'Metalloid',
  Nonmetal: 'Nonmetal',
  Halogen: 'Halogen',
  'Noble gas': 'Noble gas',
};
