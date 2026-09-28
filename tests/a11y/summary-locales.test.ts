import { de, es, fr } from '../../packages/locales/src/index.ts';
import { describe, expect, it } from 'vitest';
import { SUMMARY_TEMPLATES } from '../../packages/runtime/src/a11y/summary.ts';

/**
 * The generated-summary translations in `@mk7s/holochart-locales` (plan E17.2) stay in sync with
 * the runtime's English templates: every template translated, no stale keys, every placeholder
 * kept.
 */
const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe.each([de, fr, es])('$name summary translations', (locale) => {
  const english: readonly string[] = Object.values(SUMMARY_TEMPLATES);
  const dictionary = locale.dictionary ?? {};

  it('translate every template and nothing else', () => {
    // Plotly's UI strings have no placeholders; the two skew sentences have none either.
    const templates = Object.keys(dictionary).filter(
      (key) => key.includes('{') || english.includes(key),
    );
    expect(templates.sort()).toEqual([...english].sort());
  });

  it('keep every placeholder', () => {
    for (const template of english) {
      expect(placeholders(dictionary[template]!), template).toEqual(placeholders(template));
    }
  });
});
