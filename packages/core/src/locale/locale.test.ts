import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { supplyDefaults } from '../defaults/supply-defaults.ts';
import { attr } from '../schema/attr.ts';
import { createRegistry } from '../registry/registry.ts';
import type { CoreTraceModule } from '../registry/types.ts';
import { createScale } from '../scales/scale.ts';
import { formatDateLabel, formatNumber, formatValue } from '../scales/format.ts';
import {
  addLocale,
  createLocaleStore,
  DEFAULT_LOCALE,
  isLocaleModule,
  localeOf,
  localize,
  normalizeLocaleName,
  resolveLocale,
  type LocaleModule,
} from './locale.ts';

/** A trimmed plotly.js `lib/locales/de.js`. */
const de: LocaleModule = {
  moduleType: 'locale',
  name: 'de',
  dictionary: { Zoom: 'Zoom', 'Reset axes': 'Achsen zurücksetzen', trace: 'Datenspur' },
  format: {
    days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    shortDays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    months: [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember',
    ],
    shortMonths: [
      'Jan',
      'Feb',
      'Mär',
      'Apr',
      'Mai',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Dez',
    ],
    date: '%d.%m.%Y',
    decimal: ',',
    thousands: '.',
  },
};

/** plotly.js's `de-CH`: formats only (no dictionary, no separators). */
const deCH: LocaleModule = {
  moduleType: 'locale',
  name: 'de-CH',
  dictionary: {},
  format: { date: '%d.%m.%Y', shortMonths: de.format?.shortMonths ?? [] },
};

/** plotly.js's `fr` date formats: day before month. */
const fr: LocaleModule = {
  moduleType: 'locale',
  name: 'fr',
  dictionary: { 'Reset axes': 'Réinitialiser les axes' },
  format: {
    shortMonths: [
      'Jan',
      'Fév',
      'Mar',
      'Avr',
      'Mai',
      'Jun',
      'Jul',
      'Aoû',
      'Sep',
      'Oct',
      'Nov',
      'Déc',
    ],
    decimal: ',',
    thousands: ' ',
    dayMonth: '%-d %b',
    dayMonthYear: '%-d %b %Y',
  },
};

const MAR_5_2024 = Date.UTC(2024, 2, 5, 12, 30);

function store(...modules: LocaleModule[]) {
  const s = createLocaleStore();
  for (const m of modules) addLocale(s, m);
  return s;
}

describe('normalizeLocaleName', () => {
  it('matches names case-insensitively, with `_` as `-`', () => {
    expect(normalizeLocaleName('de')).toBe('de');
    expect(normalizeLocaleName('DE-ch')).toBe('de-CH');
    expect(normalizeLocaleName(' pt_br ')).toBe('pt-BR');
    expect(normalizeLocaleName('zh-hant-tw')).toBe('zh-Hant-TW');
  });
});

describe('locale registration', () => {
  it('accepts plotly.js locale modules as they are', () => {
    expect(isLocaleModule(de)).toBe(true);
    expect(isLocaleModule({ name: 'de' })).toBe(false);
    expect(isLocaleModule({ moduleType: 'locale' })).toBe(false);
    const registry = createRegistry().registerLocale(de);
    expect(registry.locales.locales.get('de')?.dictionary).toBe(de.dictionary);
  });

  it('lets a regional locale serve its language until the language registers', () => {
    const s = store({ ...deCH, dictionary: { Zoom: 'Zoomen' } });
    expect(s.locales.get('de')?.dictionary).toEqual({ Zoom: 'Zoomen' });
    addLocale(s, de);
    expect(s.locales.get('de')?.dictionary).toBe(de.dictionary);
    // The language keeps its own content when another region registers later.
    addLocale(s, { moduleType: 'locale', name: 'de-AT', dictionary: { Zoom: 'Z' } });
    expect(s.locales.get('de')?.dictionary).toBe(de.dictionary);
  });

  it('keeps an earlier dictionary when a module brings only formats', () => {
    const s = store(de, { moduleType: 'locale', name: 'de', format: { decimal: '.' } });
    expect(s.locales.get('de')?.dictionary).toBe(de.dictionary);
    expect(s.locales.get('de')?.format).toEqual({ decimal: '.' });
  });

  it('registers under the normalized name', () => {
    const s = store({ ...deCH, name: 'de_ch' });
    expect([...s.locales.keys()]).toEqual(['de', 'de-CH']);
  });
});

describe('resolveLocale', () => {
  it('is the default locale for en-US without English overrides', () => {
    expect(resolveLocale('en-US', store(de))).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('en-us', store())).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('', store())).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('en-US', store(), { separators: ', ' })).not.toBe(DEFAULT_LOCALE);
  });

  it('falls back from region to language to English, per string and format key', () => {
    const l = resolveLocale('de-CH', store(de, deCH));
    expect(l.name).toBe('de-CH');
    expect(l._('Reset axes')).toBe('Achsen zurücksetzen');
    expect(l._('Pan')).toBe('Pan');
    expect(l.format.date).toBe('%d.%m.%Y');
    expect(l.format.months[2]).toBe('März');
    expect(l.format.periods).toEqual(['AM', 'PM']);
    expect(l.separators).toBe(',.');
  });

  it('uses English formats for unknown locales and `en`', () => {
    const l = resolveLocale('xx', store());
    expect(l._('Zoom')).toBe('Zoom');
    expect(l.format.date).toBe('%d/%m/%Y');
    expect(l.separators).toBe('.,');
    expect(resolveLocale('en-GB', store()).format.date).toBe('%d/%m/%Y');
  });

  it('looks in per-chart definitions (`config.locales`) first', () => {
    const defs = { DE: { dictionary: { Zoom: 'Vergrößern' }, format: { decimal: '·' } } };
    const l = resolveLocale('de', store(de), { defs });
    expect(l._('Zoom')).toBe('Vergrößern');
    expect(l._('Reset axes')).toBe('Achsen zurücksetzen');
    expect(l.separators).toBe('·.');
  });

  it('caches resolved locales per registration state', () => {
    const s = store(de);
    const a = resolveLocale('de', s);
    expect(resolveLocale('de', s)).toBe(a);
    expect(resolveLocale('de', s, { separators: '.,' })).not.toBe(a);
    addLocale(s, fr);
    expect(resolveLocale('de', s)).not.toBe(a);
  });
});

describe('formatting with a locale', () => {
  const s = store(de, deCH, fr);
  const german = resolveLocale('de', s);
  const french = resolveLocale('fr', s);

  it('writes numbers with the locale separators', () => {
    expect(formatNumber(12345.25, { exponentformat: 'none', locale: german })).toBe('12.345,25');
    expect(formatNumber(1234567.25, { locale: german })).toBe('1,234567M');
    expect(formatNumber(-1234.5, { locale: french })).toBe('−1 234,5');
    // Years are not grouped.
    expect(formatNumber(2024, { locale: german })).toBe('2024');
    expect(formatNumber(1234.5, { tickformat: ',.2f', locale: german })).toBe('1.234,50');
    expect(formatNumber(0.256, { tickformat: '.1%', locale: french })).toBe('25,6%');
  });

  it('is unchanged in English', () => {
    expect(formatNumber(-12345.25, { exponentformat: 'none' })).toBe('−12,345.25');
    expect(formatNumber(1234.5, { tickformat: ',.2f', locale: DEFAULT_LOCALE })).toBe('1,234.50');
  });

  it('writes month and day names and the default date formats of the locale', () => {
    expect(formatDateLabel(MAR_5_2024, '%A, %-d. %B %Y', null, german)).toBe(
      'Dienstag, 5. März 2024',
    );
    expect(formatDateLabel(MAR_5_2024, '%x', null, german)).toBe('05.03.2024');
    expect(formatDateLabel(MAR_5_2024, '', 'm', german)).toBe('Mär 2024');
    expect(formatDateLabel(MAR_5_2024, '', 'd', french)).toBe('5 Mar\n2024');
    expect(formatDateLabel(MAR_5_2024, '', 'M', french)).toBe('12:30\n5 Mar 2024');
    expect(formatDateLabel(MAR_5_2024, '', 'd')).toBe('Mar 5\n2024');
  });

  it('keeps d3’s en-US `%x` for the default locale', () => {
    expect(formatDateLabel(MAR_5_2024, '%x', null)).toBe('3/5/2024');
  });

  it('formats axis values in the axis locale', () => {
    const scale = createScale({ type: 'linear', range: [0, 20000], length: 400 });
    const axis = { _id: 'x', type: 'linear', exponentformat: 'none', _locale: german } as never;
    expect(formatValue(scale, axis, 12345.678, true)).toBe('12.345,68');
    expect(formatValue(scale, axis, 15000, false)).toBe('15.000');
  });

  it('maps English separators to the locale ones (property)', () => {
    const sep = fc.constantFrom('.', ',', ' ', ' ', "'", '·');
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        sep,
        sep,
        fc.boolean(),
        (v, decimal, thousands, separatethousands) => {
          fc.pre(decimal !== thousands);
          const locale = resolveLocale('en-US', store(), { separators: decimal + thousands });
          const en = formatNumber(v, { separatethousands });
          const mapped = en.replace(/[.,]/g, (c) => (c === '.' ? decimal : thousands));
          expect(formatNumber(v, { separatethousands, locale })).toBe(mapped);
        },
      ),
    );
  });
});

describe('supplyDefaults', () => {
  const dots: CoreTraceModule = {
    type: 'dots',
    categories: ['cartesian'],
    schema: attr.object({ x: attr.dataArray(), y: attr.dataArray() }),
    meta: { description: 'Test dots.' },
    supplyDefaults(_in, _out, ctx) {
      ctx.coerce('x');
      ctx.coerce('y');
    },
  };
  const registry = createRegistry().register(dots).registerLocale(de, fr);
  const data = [{ type: 'dots', x: [1, 2], y: [3, 4] }];

  it('resolves config.locale onto the layout and axes', () => {
    const { fullLayout, fullData } = supplyDefaults({ data, config: { locale: 'de' } }, registry);
    const locale = localeOf(fullLayout);
    expect(locale.name).toBe('de');
    expect(fullLayout['separators']).toBe(',.');
    expect(localeOf(fullLayout.xaxis)).toBe(locale);
    expect(localize(fullLayout, 'Reset axes')).toBe('Achsen zurücksetzen');
    // Plotly's `_(gd, 'trace') + ' ' + i`.
    expect(fullData[0]?.name).toBe('Datenspur 0');
  });

  it('lets layout.separators override the locale separators', () => {
    const { fullLayout } = supplyDefaults(
      { data, layout: { separators: '.,' }, config: { locale: 'de' } },
      registry,
    );
    expect(localeOf(fullLayout).separators).toBe('.,');
    expect(localeOf(fullLayout).format.months[2]).toBe('März');
  });

  it('defaults to en-US', () => {
    const { fullLayout, fullData } = supplyDefaults({ data }, registry);
    expect(localeOf(fullLayout)).toBe(DEFAULT_LOCALE);
    expect(fullLayout['separators']).toBe('.,');
    expect(fullData[0]?.name).toBe('trace 0');
  });

  it('uses per-chart locales (config.locales)', () => {
    const { fullLayout } = supplyDefaults(
      {
        data,
        config: { locale: 'x-pirate', locales: { 'x-pirate': { dictionary: { Pan: 'Sail' } } } },
      },
      registry,
    );
    expect(localize(fullLayout, 'Pan')).toBe('Sail');
  });
});
