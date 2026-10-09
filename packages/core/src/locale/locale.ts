/**
 * Locales (plan E17.6): UI strings and number/date formats per language, in plotly.js's locale
 * module shape (`{ moduleType: 'locale', name, dictionary, format }`), so Plotly locale files
 * register as they are.
 *
 * A chart's locale is `config.locale` (default `en-US`), looked up — per string and per format
 * key, like Plotly's `Lib._` and `getFormatObj` — in `config.locales`, then the registry, for the
 * full name and then its language (`de-CH` → `de`); missing format keys come from English.
 * `layout.separators` overrides the locale's decimal and thousands separators.
 *
 * The default (`en-US`, nothing registered for English, separators `.,`) is {@link DEFAULT_LOCALE}:
 * d3's own en-US formatters, exactly the output Holochart had before locales.
 */
import { format as d3Format, formatLocale, type FormatLocaleDefinition } from 'd3-format';
import { timeFormatLocale, utcFormat, type TimeLocaleDefinition } from 'd3-time-format';

/** Number and date formats of a locale (plotly.js's `format` object, all keys resolved). */
export interface LocaleFormat {
  /** Day names, Sunday first (`%A`). */
  days: readonly string[];
  /** Short day names, Sunday first (`%a`). */
  shortDays: readonly string[];
  /** Month names (`%B`). */
  months: readonly string[];
  /** Short month names (`%b`). */
  shortMonths: readonly string[];
  /** AM and PM (`%p`). */
  periods: readonly string[];
  /** `%c`. */
  dateTime: string;
  /** `%x`. */
  date: string;
  /** `%X`. */
  time: string;
  /** Decimal separator (overridden by `layout.separators`). */
  decimal: string;
  /** Thousands separator (overridden by `layout.separators`). */
  thousands: string;
  /** Digits per thousands group, e.g. `[3]`. */
  grouping: readonly number[];
  /** Currency prefix and suffix (`$` in d3-format specifiers). */
  currency: readonly string[];
  /** Date tick label of whole years. */
  year: string;
  /** Date tick label of months. */
  month: string;
  /** Date tick label of days (first line; the year goes on the second). */
  dayMonth: string;
  /** Full date under time tick labels and in hover labels. */
  dayMonthYear: string;
}

/** The translatable content of a locale: UI strings and (partial) formats. */
export interface LocaleDefinition {
  /** English UI string → translation (Plotly's keys, e.g. `'Zoom'`, `'trace'`, `'open:'`). */
  dictionary?: Readonly<Record<string, string>>;
  /** Formats; missing keys fall back to the language, then to English. */
  format?: Readonly<Partial<LocaleFormat>>;
}

/**
 * A locale module, as `register()` takes it — the shape of plotly.js's `lib/locales/*.js`, so a
 * Plotly locale registers unchanged.
 *
 * @example
 * ```ts
 * register({
 *   moduleType: 'locale',
 *   name: 'de',
 *   dictionary: { Zoom: 'Zoom', 'Reset axes': 'Achsen zurücksetzen' },
 *   format: { decimal: ',', thousands: '.', shortMonths: ['Jan', 'Feb', 'Mär' /* … *\/] },
 * });
 * ```
 */
export interface LocaleModule extends LocaleDefinition {
  moduleType: 'locale';
  /** BCP 47 name, e.g. `'de'` or `'de-CH'` (matched case-insensitively; `_` works as `-`). */
  name: string;
}

/**
 * A chart's resolved locale (`fullLayout._locale`): the translation function and the formatters
 * every label, tick and hover text goes through.
 */
export interface Locale {
  /** Normalized `config.locale`. */
  readonly name: string;
  /** Formats in effect, with `decimal` / `thousands` from `layout.separators`. */
  readonly format: Readonly<LocaleFormat>;
  /** Decimal then thousands separator (`layout.separators` after defaults). */
  readonly separators: string;
  /** Translate a UI string (Plotly's `Lib._`); strings without a translation come back as they are. */
  _(text: string): string;
  /** A d3-format formatter in this locale, or `null` for an invalid specifier. Cached. */
  numberFormat(specifier: string): ((n: number) => string) | null;
  /** A UTC d3-time-format formatter in this locale. Cached. */
  timeFormat(specifier: string): (d: Date) => string;
}

function names(specifier: string, n: number, date: (i: number) => number): string[] {
  const f = utcFormat(specifier);
  return Array.from({ length: n }, (_, i) => f(new Date(date(i))));
}

let en: LocaleDefinition | undefined;

/**
 * plotly.js's `locale-en` formats, the fallback of every key a locale leaves out. The day and month
 * names come from d3's en-US locale (already in every bundle), Sunday and January first.
 */
function english(): LocaleDefinition {
  const days = (specifier: string): string[] =>
    names(specifier, 7, (i) => Date.UTC(2000, 0, 2 + i));
  const months = (specifier: string): string[] => names(specifier, 12, (i) => Date.UTC(2000, i));
  return (en ??= {
    format: {
      days: days('%A'),
      shortDays: days('%a'),
      months: months('%B'),
      shortMonths: months('%b'),
      periods: ['AM', 'PM'],
      dateTime: '%a %b %e %X %Y',
      date: '%d/%m/%Y',
      time: '%H:%M:%S',
      decimal: '.',
      thousands: ',',
      grouping: [3],
      currency: ['$', ''],
      year: '%Y',
      month: '%b %Y',
      dayMonth: '%b %-d',
      dayMonthYear: '%b %-d, %Y',
    },
  });
}

/** US English (plotly.js's `locale-en-us`): English with month-first `%x`. */
const EN_US: LocaleDefinition = { format: { date: '%m/%d/%Y' } };

/**
 * Canonical case of a locale name, so `de-ch`, `de_CH` and `DE-CH` all name `de-CH`: the language
 * lower case, two-letter regions upper case, four-letter scripts title case (`zh-Hant-TW`).
 * @internal
 */
export function normalizeLocaleName(name: string): string {
  return name
    .trim()
    .replace(/_/g, '-')
    .split('-')
    .filter((part) => part !== '')
    .map((part, i) => {
      if (i > 0 && part.length === 2) return part.toUpperCase();
      if (i > 0 && part.length === 4)
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      return part.toLowerCase();
    })
    .join('-');
}

/**
 * Where registered locales live: the core registry keeps one of these per chart registry.
 * @experimental
 */
export interface LocaleStore {
  /** Registered definitions by normalized name. */
  readonly locales: Map<string, LocaleDefinition>;
  /** Resolved locales by name and separators; cleared on every registration. */
  readonly resolved: Map<string, Locale>;
}

/** An empty {@link LocaleStore}. */
export function createLocaleStore(): LocaleStore {
  return { locales: new Map(), resolved: new Map() };
}

function nonEmpty<T extends object>(o: T | undefined): T | undefined {
  return o && Object.keys(o).length > 0 ? o : undefined;
}

/**
 * Add a locale module to a store, with plotly.js's rules: a regional locale (`de-CH`) also serves
 * its language (`de`) until the language gets a dictionary or format of its own, and a module
 * without a dictionary (or format) keeps the one registered before.
 */
export function addLocale(store: LocaleStore, module: LocaleModule): void {
  const name = normalizeLocaleName(module.name);
  const base = name.split('-')[0] as string;
  const dictionary = nonEmpty(module.dictionary);
  const format = nonEmpty(module.format);
  const entry = store.locales.get(name) ?? {};
  if (base !== name) {
    // The language entry follows the regional one while they share (or both lack) content.
    const baseEntry = { ...store.locales.get(base) };
    if (dictionary && baseEntry.dictionary === entry.dictionary) baseEntry.dictionary = dictionary;
    if (format && baseEntry.format === entry.format) baseEntry.format = format;
    store.locales.set(base, baseEntry);
  }
  store.locales.set(name, {
    dictionary: dictionary ?? entry.dictionary,
    format: format ?? entry.format,
  });
  store.resolved.clear();
}

/** True when `m` is a locale module (`moduleType: 'locale'` and a name). @internal */
export function isLocaleModule(m: unknown): m is LocaleModule {
  const rec = m as Record<string, unknown> | null;
  return rec?.['moduleType'] === 'locale' && typeof rec['name'] === 'string';
}

/** Memoize a formatter factory per specifier; invalid specifiers give `null` (Plotly prints the raw number). */
function memo<T>(make: (specifier: string) => T): (specifier: string) => T | null {
  const cache = new Map<string, T | null>();
  return (specifier) => {
    if (!cache.has(specifier)) {
      let f: T | null = null;
      try {
        f = make(specifier);
      } catch {
        // Invalid specifier.
      }
      cache.set(specifier, f);
    }
    return cache.get(specifier) as T | null;
  };
}

/** The formats of a chain of definitions (Plotly's `getFormatObj`): per key, the first that has it. */
function mergeFormat(defs: readonly (LocaleDefinition | undefined)[]): LocaleFormat {
  const out = {} as Record<string, unknown>;
  for (const key in english().format) {
    out[key] = defs.find((d) => d?.format?.[key as keyof LocaleFormat] !== undefined)?.format?.[
      key as keyof LocaleFormat
    ];
  }
  return out as unknown as LocaleFormat;
}

let defaultFormat: LocaleFormat | undefined;

/**
 * The default locale: US English with d3's own formatters (`%x` is `%-m/%-d/%Y`, `%X` is
 * `%-I:%M:%S %p`, as d3's en-US), used whenever nothing English is registered and the separators
 * are `.,`.
 * @internal
 */
export const DEFAULT_LOCALE: Locale = {
  name: 'en-US',
  // A getter keeps the module free of top-level work, so bundles that never format drop it.
  get format() {
    return (defaultFormat ??= mergeFormat([EN_US, english()]));
  },
  separators: '.,',
  _: (text) => text,
  numberFormat: /* @__PURE__ */ memo(d3Format),
  timeFormat: /* @__PURE__ */ memo(utcFormat) as Locale['timeFormat'],
};

/** Per-chart locales (`config.locales`), keyed by name as the user wrote them. */
export type LocaleDefinitions = Readonly<Record<string, LocaleDefinition | undefined>>;

/**
 * Resolve a chart's locale: `name` (`config.locale`) looked up in `defs` (`config.locales`), then
 * in `store`, then its language, then English; `separators` (`layout.separators`, default the
 * locale's) set the decimal and thousands separators. Resolved locales are cached in the store
 * (not when `defs` has entries).
 * @internal
 */
export function resolveLocale(
  name: string,
  store: LocaleStore,
  options: { defs?: LocaleDefinitions; separators?: string } = {},
): Locale {
  const full = normalizeLocaleName(name) || 'en-US';
  const defs = new Map<string, LocaleDefinition | undefined>();
  for (const [n, d] of Object.entries(options.defs ?? {})) {
    if (typeof d === 'object' && d !== null) defs.set(normalizeLocaleName(n), d);
  }
  const chain: (LocaleDefinition | undefined)[] = [];
  let custom = false;
  for (const n of new Set([full, full.split('-')[0] as string])) {
    const own = defs.get(n);
    const registered = store.locales.get(n);
    if (own || registered) custom = true;
    chain.push(own, registered ?? (own || n !== 'en-US' ? undefined : EN_US));
  }
  chain.push(english());
  const format = mergeFormat(chain);
  const separators = options.separators || format.decimal + format.thousands;
  if (full === 'en-US' && !custom && separators === '.,') return DEFAULT_LOCALE;
  const key = `${full} ${separators}`;
  let locale = defs.size > 0 ? undefined : store.resolved.get(key);
  if (!locale) {
    locale = createLocale(full, chain, format, separators);
    if (defs.size === 0) store.resolved.set(key, locale);
  }
  return locale;
}

function createLocale(
  name: string,
  chain: readonly (LocaleDefinition | undefined)[],
  format: LocaleFormat,
  separators: string,
): Locale {
  const f: LocaleFormat = {
    ...format,
    decimal: separators.charAt(0),
    thousands: separators.charAt(1),
  };
  let numbers: ReturnType<typeof formatLocale> | undefined;
  let times: ReturnType<typeof timeFormatLocale> | undefined;
  return {
    name,
    format: f,
    separators,
    _: (text) => chain.find((d) => d?.dictionary?.[text])?.dictionary?.[text] ?? text,
    // d3's locale definitions are subsets of plotly.js's format object.
    numberFormat: memo((specifier) =>
      (numbers ??= formatLocale(f as unknown as FormatLocaleDefinition)).format(specifier),
    ),
    timeFormat: memo((specifier) =>
      (times ??= timeFormatLocale(f as unknown as TimeLocaleDefinition)).utcFormat(specifier),
    ) as Locale['timeFormat'],
  };
}

/**
 * The locale of a full layout or full axis (`_locale`, set by supply-defaults), or
 * {@link DEFAULT_LOCALE} for objects built by hand.
 * @internal
 */
export function localeOf(owner: unknown): Locale {
  return (owner as { _locale?: Locale } | null | undefined)?._locale ?? DEFAULT_LOCALE;
}

/**
 * Translate a UI string for a chart (Plotly's `Lib._(gd, text)`): `owner` is its full layout (or a
 * full axis).
 *
 * @example
 * ```ts
 * button.title = localize(fullLayout, 'Reset axes'); // 'Achsen zurücksetzen' with config.locale 'de'
 * ```
 * @internal
 */
export function localize(owner: unknown, text: string): string {
  return localeOf(owner)._(text);
}
