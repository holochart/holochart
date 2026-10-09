import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MODEBAR_BUILTIN_BUTTONS,
  modebarBuiltinButton,
} from '../../packages/components/src/modebar/buttons.ts';
import { createRegistry, resolveLocale, type FullLayout } from '../../packages/core/src/index.ts';
import {
  allLocales,
  de,
  deCH,
  es,
  fr,
  it as italian,
  ja,
  ko,
  ptBR,
  ru,
  tr,
  zhCN,
} from '../../packages/locales/src/index.ts';
import { sayer, SUMMARY_TEMPLATES } from '../../packages/runtime/src/a11y/summary.ts';
import { announce, KEYBOARD_TEMPLATES } from '../../packages/runtime/src/fx/keyboard.ts';
import { sceneModebarButtons } from '../../packages/traces-3d/src/scene/modebar.ts';
import * as geo from '../../packages/traces-geo/src/a11y.ts';
import * as graph from '../../packages/traces-graph/src/a11y.ts';
import * as hier from '../../packages/traces-hier/src/a11y.ts';
import * as stats from '../../packages/traces-stats/src/a11y.ts';
import { STAT_LABELS } from '../../packages/traces-stats/src/box/hover.ts';

/**
 * Holochart's own strings in `@mk7s/holochart-locales` (plan E17.2, backlog S2.15) stay in sync
 * with the English text the charts look up: the ten translated locales have every chart summary,
 * every keyboard announcement and every UI label, no stale keys, and every placeholder of the
 * English source, wherever a template is translated.
 */

/** The locales that translate Holochart's own strings; the others fall back to English. */
const TRANSLATED = [de, es, fr, italian, ja, ko, ptBR, ru, tr, zhCN];

/** The generated chart summaries (`a11y/summary.ts`). */
const SUMMARIES: readonly string[] = Object.values(SUMMARY_TEMPLATES);

/**
 * What keyboard navigation announces: the runtime's sentences (`fx/keyboard.ts`), those the
 * trace packages' stops bring (`KeyboardPoint.say`), with the parcoords label they name a
 * dimension by and the sentences a graph's stops add for a folded node and for where ↑ and ↓
 * lead, and what a map says of its view after a view key (`TraceA11y.keyboardViewSay`).
 */
const ANNOUNCEMENTS: readonly string[] = [
  ...new Set([
    ...Object.values(KEYBOARD_TEMPLATES),
    hier.NODE_TEMPLATE,
    hier.ITEM_TEMPLATE,
    stats.ITEM_TEMPLATE,
    stats.BOX_TEMPLATE,
    stats.CELL_TEMPLATE,
    stats.CATEGORY_TEMPLATE,
    stats.DIMENSION_TEMPLATE,
    geo.VIEW_TEMPLATE,
    graph.NODE_TEMPLATE,
    graph.LINK_TEMPLATE,
    graph.RANK_TEMPLATE,
    graph.TREE_TEMPLATE,
    graph.FOLDED_TEMPLATE,
    graph.UP_TEMPLATE,
    graph.DOWN_TEMPLATE,
  ]),
];

const TEMPLATES: readonly string[] = [...SUMMARIES, ...ANNOUNCEMENTS];

/** The legend toolbar's name and the plot area's keyboard hint, as their sources spell them. */
const LEGEND = 'Legend';
const KEYBOARD_HINT = 'Chart data: arrow keys move between points, + and - zoom';

/**
 * Every UI string a chart looks up in its locale's dictionary (`localize`, `locale._`): modebar
 * titles (2D, drawing and 3D), the default trace name, the hover labels of box, violin, OHLC and
 * candlestick, and the two accessibility labels.
 */
const LABELS: readonly string[] = [
  ...new Set([
    ...MODEBAR_BUILTIN_BUTTONS.map((name) => modebarBuiltinButton(name).title),
    ...sceneModebarButtons.flat().map((button) => button.title),
    'trace',
    ...Object.values(STAT_LABELS),
    'mean ± σ:',
    'kde:',
    ...['open', 'high', 'low', 'close'].map((key) => `${key}:`),
    LEGEND,
    KEYBOARD_HINT,
  ]),
];

/** The placeholder names of a template, sorted, repeats kept. */
const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

/** Whether a brace is left once the well-formed placeholders are taken out (`{ name }`, `{name`). */
const strayBraces = (s: string): boolean => /[{}]/.test(s.replace(/\{\w+\}/g, ''));

/** Holochart's templates among a dictionary's keys: Plotly's UI strings have no placeholders. */
const templatesOf = (dictionary: Readonly<Record<string, string>>): string[] =>
  Object.keys(dictionary).filter((key) => key.includes('{') || TEMPLATES.includes(key));

/** A full layout as far as `localize` reads it: one with the locale `name`. */
function layoutIn(name: string): FullLayout {
  const registry = createRegistry().registerLocale(...allLocales);
  return { _locale: resolveLocale(name, registry.locales) } as unknown as FullLayout;
}

const source = (file: string): string =>
  readFileSync(new URL(`../../packages/${file}`, import.meta.url), 'utf8');

describe('the English sources', () => {
  it('are distinct sentences: a summary and an announcement never share a dictionary key', () => {
    expect(new Set(TEMPLATES).size).toBe(TEMPLATES.length);
    for (const template of TEMPLATES) expect(strayBraces(template), template).toBe(false);
  });

  it('spell the accessibility labels as the dictionaries do', () => {
    // The two labels are literals at their call sites; a reworded one would silently lose its
    // translations.
    expect(source('components/src/legend/legend-keys.ts')).toContain(
      `localize(fullLayout, '${LEGEND}')`,
    );
    expect(source('runtime/src/fx/focus.ts')).toContain(`'${KEYBOARD_HINT}'`);
  });
});

describe.each(TRANSLATED)('$name', (locale) => {
  const dictionary = locale.dictionary ?? {};

  it('translates every chart summary and announcement, and nothing stale', () => {
    expect(templatesOf(dictionary).sort()).toEqual([...TEMPLATES].sort());
  });

  it('translates every UI label a chart looks up', () => {
    const missing = LABELS.filter((label) => !dictionary[label]?.trim());
    expect(missing).toEqual([]);
  });

  it('fills in every translated sentence', () => {
    const fullLayout = layoutIn(locale.name);
    for (const template of TEMPLATES) {
      const names = placeholders(template);
      const values = Object.fromEntries(names.map((name) => [name, `<${name}>`]));
      const text = announce(fullLayout, template, values);
      expect(text, template).not.toMatch(/[{}]/);
      for (const name of names) expect(text, template).toContain(`<${name}>`);
    }
  });
});

describe('every locale', () => {
  it.each(allLocales.map((l) => [l.name, l] as const))(
    '%s keeps exactly the placeholders of each template it translates',
    (_, locale) => {
      const dictionary = locale.dictionary ?? {};
      for (const template of templatesOf(dictionary)) {
        // A key with a placeholder that is no template of the charts is stale (or misspelt).
        expect(TEMPLATES, template).toContain(template);
        const translation = dictionary[template]!;
        expect(placeholders(translation), template).toEqual(placeholders(template));
        expect(strayBraces(translation), template).toBe(false);
      }
    },
  );

  it('falls back to English, sentence by sentence, where a template is not translated', () => {
    // Dutch has plotly.js's UI strings and none of Holochart's own.
    expect(announce(layoutIn('nl'), 'rotate')).toBe('View rotated.');
    expect(
      announce(layoutIn('nl'), 'point', { name: 'A', text: '(1, 2)', n: '1', count: '3' }),
    ).toBe('A: (1, 2), point 1 of 3.');
  });
});

describe('translated sentences at run time', () => {
  it('announce in the chart’s language, with the values in the translation’s order', () => {
    const values = { name: 'A', text: '(1, 2)', n: '2', count: '5' };
    expect(announce(layoutIn('de'), 'point', values)).toBe('A: (1, 2), Punkt 2 von 5.');
    expect(announce(layoutIn('ja'), 'point', values)).toBe('A：(1, 2)、5個中2番目のポイント。');
    expect(announce(layoutIn('tr'), 'point', values)).toBe('A: (1, 2), 5 noktadan 2. nokta.');
    expect(announce(layoutIn('fr'), 'rotate')).toBe('Vue pivotée.');
    // A stop's own sentence (`KeyboardPoint.say`) is looked up the same way.
    expect(
      announce(layoutIn('es'), stats.CELL_TEMPLATE, {
        name: 'z',
        text: '7',
        row: '2',
        rows: '3',
        column: '1',
        columns: '4',
      }),
    ).toBe('z: 7, fila 2 de 3, columna 1 de 4.');
    // So is what a map says of its view after a view key (`TraceA11y.keyboardViewSay`).
    const view = { lon: '12,5', lat: '−40', scale: '1,25' };
    expect(announce(layoutIn('de'), geo.VIEW_TEMPLATE, view)).toBe(
      'Karte zentriert auf Längengrad 12,5°, Breitengrad −40°, Maßstab 1,25.',
    );
    expect(announce(layoutIn('ja'), geo.VIEW_TEMPLATE, view)).toBe(
      '地図の中心は経度12,5°、緯度−40°、縮尺1,25。',
    );
    expect(announce(layoutIn('nl'), geo.VIEW_TEMPLATE, view)).toBe(
      'Map centered at longitude 12,5°, latitude −40°, scale 1,25.',
    );
  });

  it('summarize in the chart’s language', () => {
    const say = sayer(layoutIn('pt-BR'));
    expect(say('rises', { name: 'Vendas', start: '1', startX: 'jan', end: '9', endX: 'dez' })).toBe(
      'Vendas sobe de 1 (jan) para 9 (dez).',
    );
  });

  it('reach a regional locale through its language', () => {
    expect(deCH.dictionary?.[KEYBOARD_TEMPLATES.rotate]).toBeUndefined();
    expect(announce(layoutIn('de-CH'), 'rotate')).toBe('Ansicht gedreht.');
    expect(announce(layoutIn('es-AR'), 'rotate')).toBe('Vista girada.');
    expect(announce(layoutIn('es-PE'), 'rotate')).toBe('Vista girada.');
    expect(announce(layoutIn('fr-CH'), 'rotate')).toBe('Vue pivotée.');
  });

  it('name a parcoords dimension without a label', () => {
    const stops = (fullLayout: unknown) => {
      const parts = stats.parcoords(
        (() => ({ x: 0, y: 0, width: 100, height: 100 })) as never,
        (() => [
          { dim: { label: '', values: [4], unit: [0.5], index: 0 }, x: 10 },
          { dim: { label: 'Speed', values: [7], unit: [0.5], index: 1 }, x: 90 },
        ]) as never,
        (() => 50) as never,
        (value) => String(value ?? ''),
        (value) => String(value),
      );
      const list = parts['parcoords']!.keyboardPoints!(
        { length: 1 } as never,
        {} as never,
        { domain: { x: [0, 1], y: [0, 1] }, height: 100, fullLayout } as never,
      );
      return [list?.at(0)?.hoverText, list?.at(1)?.hoverText];
    };
    expect(stops(layoutIn('es'))).toEqual(['Dimensión 1: 4', 'Speed: 7']);
    expect(stops(layoutIn('nl'))).toEqual(['Dimension 1: 4', 'Speed: 7']);
    // A layout built by hand has no locale.
    expect(stops({})).toEqual(['Dimension 1: 4', 'Speed: 7']);
  });
});
