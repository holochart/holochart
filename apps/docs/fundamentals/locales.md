---
title: Locales
description: Translate UI strings and format numbers and dates for a language with config.locale, Plotly-compatible locale modules and layout.separators.
status: complete
---

# Locales

A locale sets the language of a chart's user interface strings and how it writes numbers and
dates: the decimal and thousands separators, month and day names, and the default date formats of
date axes. Holochart takes plotly.js's locale modules as they are, and `@mk7s/holochart-locales`
ships all of them (76 locales), so a chart localized for Plotly looks the same here.

## Using a locale

Register a locale module, then name it in `config.locale`:

```ts
import { register } from '@mk7s/holochart';
import { de } from '@mk7s/holochart-locales';

register(de);

createChart(el, {
  data: [{ type: 'scatter', x: ['2024-03-01', '2024-10-01'], y: [1.0875, 1.0912] }],
  config: { locale: 'de' },
});
```

<Example id="locales/german-time-series" />

In the example, the date axis reads `Mär 2024` and `Nov 2024`, the y axis `1,09`, the hover label
`Dienstag, 5. März 2024`, and the modebar's buttons are titled in German. Import only the locales
you use: a locale is about 0.5 kB with formats only, 1 to 1.5 kB with Plotly's UI strings and 3 to
4 kB with [Holochart's own strings](#holochart-s-own-strings), and all of them together are about
40 kB (gzipped). The default, `en-US`, needs
nothing registered.

## What a locale changes

- **Numbers**: tick labels, hover labels, formats such as `%{y:,.2f}` in `hovertemplate` and
  `texttemplate`, `tickformat`, colorbar ticks, pie values and percentages, contour labels and
  indicator numbers use the locale's decimal and thousands separators (`1.234,5` in German,
  `1 234,5` in French).
- **Dates**: month and day names (`%b`, `%B`, `%a`, `%A`), AM and PM (`%p`), the locale's `%x`,
  `%X` and `%c` formats, and the default labels of date axes, from the locale's `year`, `month`,
  `dayMonth` and `dayMonthYear` formats (French puts the day first: `5 Mar 2024`).
- **UI strings**: modebar button titles, default trace names (`trace 0` becomes `Datenspur 0`),
  and the labels of OHLC and candlestick (`open:`, `close:`), box (`median:`, `q1:`, …) and violin
  (`kde:`) hover labels.
- **Accessibility strings**, in [ten locales](#holochart-s-own-strings): the generated chart
  summaries, the keyboard announcements, the legend toolbar's name and the plot area's keyboard
  hint.

Your own text (titles, trace names, `ticktext`, category names) is drawn as you wrote it.

## Separators

`layout.separators` overrides the locale's decimal and thousands separators: two characters,
decimal first. `', '` writes `1 234,5`; a single character (`'.'`) turns thousands separators
off. It defaults to the locale's (`'.,'` in English), so `layout.separators` wins over
`config.locale`, as in Plotly.

```ts
createChart(el, {
  data: [{ type: 'bar', x: ['A', 'B'], y: [48215.4, 31870.25], texttemplate: '%{y:,.1f}' }],
  layout: { separators: ', ' },
});
```

<Example id="locales/french-bars" />

Without a format, numbers get thousands separators when they have five or more integer digits or
a decimal part (so years stay `2024`), or always with `separatethousands: true` on an axis.

## How a locale is found

`config.locale` is matched case-insensitively, with `_` accepted for `-` (`'pt_br'` is `pt-BR`).
Each UI string and each format is looked up in this order, and the first locale that has it wins:

1. `config.locales[name]` (locales for this chart only, see below);
2. the registered locale `name`;
3. the same two for the language alone: `de-CH` falls back to `de`;
4. English.

So plotly.js's `de-CH`, which only has formats, takes its UI strings and separators from `de` when
both are registered. As in Plotly, registering a regional locale also serves its language until
the language registers content of its own, and a module without a dictionary (or format) keeps
the one registered before under that name.

`register` adds locales for every chart (a chart registry from `createChartRegistry()` keeps its
own). A chart picks up a newly registered locale on its next update.

## Per-chart locales

`config.locales` defines locales for one chart, in the same shape without `moduleType` and
`name`. They are looked up before registered locales:

```ts
createChart(el, {
  data,
  config: {
    locale: 'de',
    locales: { de: { dictionary: { 'Reset axes': 'Ansicht zurücksetzen' } } },
  },
});
```

## Writing and porting locales

A locale module is plotly.js's locale format: a `name`, a `dictionary` of UI strings keyed by their
English text, and a `format` object with any of `days`, `shortDays`, `months`, `shortMonths`,
`periods`, `dateTime`, `date`, `time`, `decimal`, `thousands`, `grouping`, `currency`, `year`,
`month`, `dayMonth` and `dayMonthYear`. Missing keys come from the language, then English. A
Plotly locale file registers unchanged, and so does your own:

```ts
import { register, type LocaleModule } from '@mk7s/holochart';

const pirate: LocaleModule = {
  moduleType: 'locale',
  name: 'en-PIRATE',
  dictionary: { Zoom: 'Spyglass', Pan: 'Sail', 'Reset axes': 'Back to port', trace: 'crew' },
  format: { periods: ['ante meridiem', 'post meridiem'] },
};
register(pirate);
```

The dictionary keys are Plotly's (`'Zoom'`, `'Download plot as a PNG'`, `'trace'`, `'open:'`, …),
so translations written for Plotly apply here.

## Holochart's own strings

plotly.js has no screen-reader text, so its locales have none to translate. Holochart's is looked
up the same way, the English text being the dictionary key:

- the sentences of the [generated summaries](/guides/accessibility#summaries-in-other-languages)
  (`'{name} rises from {start} ({startX}) to {end} ({endX}).'`, …);
- the [keyboard announcements](/guides/accessibility#announcement-sentences)
  (`'{name}: {text}, point {n} of {count}.'`, `'Zoomed in.'`, `'View rotated.'`, …);
- two labels: `'Legend'`, the name of the legend's keyboard toolbar, and
  `'Chart data: arrow keys move between points, + and - zoom'`, the plot area's keyboard hint.

`@mk7s/holochart-locales` translates all of them in ten locales: **`de`, `es`, `fr`, `it`, `ja`,
`ko`, `pt-BR`, `ru`, `tr` and `zh-CN`**, the most widely used of the locales that already had
Plotly's UI strings. In the same ten it fills the gaps Plotly's files leave among the strings a
chart looks up: the titles of the drawing buttons (`'Draw line'`, `'Erase active shape'`, …), and
in `ko` and `pt-BR` the hover labels and (`ko`) the default trace name, which plotly.js has under
keys without the colon the lookup uses. Every other locale falls back to English for these,
string by string, after its language (see [How a locale is found](#how-a-locale-is-found)): with
`zh-CN` registered too, `zh-TW` and `zh-HK` take its Simplified Chinese sentences, and `pt-PT`
takes `pt-BR`'s.

These translations are **machine translations that no native speaker has reviewed**. The other UI
strings are plotly.js's, written by its contributors, and are kept as they are, including where
they could be better. To correct or add a translation, register the locale with your entries (a
translation keeps every `{placeholder}` of its key, in any order):

```ts
import { register } from '@mk7s/holochart';
import { ja } from '@mk7s/holochart-locales';

register({
  ...ja,
  dictionary: { ...ja.dictionary, 'View rotated.': 'ビューを回転しました。' },
});
```

Not translated in any locale: the rest of the hidden description (chart type sentence, axis and
trace lines, table captions) and a few control names; see
[Languages](/guides/accessibility#languages) in the accessibility guide.

## Script tag

The `<script>` build does not include locales. `@mk7s/holochart-locales` ships one script per
locale in `dist/scripts/`, like plotly.js's `plotly-locale-de.js`: load it after
`holochart.iife.min.js` and it registers itself.

```html
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart/dist/holochart.iife.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart-locales/dist/scripts/holochart-locale-de.js"></script>
<script>
  Holochart.createChart(document.getElementById('chart'), {
    data: [{ y: [1.5, 2.25, 1.75] }],
    config: { locale: 'de' },
  });
</script>
```

File names are the lower-cased locale names (`holochart-locale-pt-br.js`), and
`holochart-locales.js` registers every locale. A locale script loaded before Holochart queues its
locale in `window.HolochartLocales`; register the queue with `Holochart.register(...HolochartLocales)`
once Holochart has loaded.

## Right-to-left scripts

Text is laid out with the Unicode bidirectional algorithm, so Arabic and Hebrew titles, tick
labels and legend entries read right to left, numbers and Latin words inside them keep their
order, and Arabic letters join (initial, medial and final forms from the font). Each label's
direction follows its first strong character.

<Example id="locales/rtl-labels" />

The built-in default font covers Latin scripts only. Arabic, Hebrew and other characters it lacks
are drawn with troika's unicode fallback fonts (Noto), fetched from a CDN on first use. To stay
offline, register a font family that has the script and name it in the figure:

```ts
import { fonts } from '@mk7s/holochart';

fonts.register('Noto Sans Arabic', { regular: '/fonts/NotoSansArabic-Regular.ttf' });

createChart(el, {
  data,
  layout: { font: { family: 'Noto Sans Arabic' }, title: { text: 'المبيعات الشهرية 2024' } },
  config: { locale: 'ar' },
});
```

or host the fallback data yourself with `configureText({ unicodeFontsURL })` from
`@mk7s/holochart-render`. Font files must be TTF, OTF or WOFF (not WOFF2). The font parser applies
the joining forms and ligatures Arabic needs but skips some contextual lookups and mark
positioning, so fonts that rely on those for diacritics may place them less precisely than a
browser.

### What right-to-left support does not do

Only the text inside a label is laid out right to left. The chart around it is not:

- **Nothing is mirrored.** A legend keeps its symbols on the left of its text and its items in
  left-to-right order (a horizontal legend fills from the left); dropdown menus, button menus,
  sliders, the range selector and the modebar are laid out as in English, and so are the axes: the
  y axis is on the left and x grows to the right unless you set `side`, `autorange: 'reversed'`
  and the legend's `x` / `xanchor` yourself. The chart does not read the page's `dir`.
- **Measuring without a browser has no bidi and no shaping.** Layout measures text before it is
  drawn. In a browser it asks the canvas, which shapes Arabic and measures it correctly. Where
  there is no canvas (Node, server-side layout, unit tests), a fallback table is used instead: it
  counts every Arabic or Hebrew code point as one average-width glyph (0.556 em) and adds them up
  in the order they are stored. Joined Arabic letters are narrower than that in a font, and vowel
  marks (harakat, niqqud), which take no width in a font, are counted as letters, so vowelled
  text measures too wide. Margins, legend widths and ellipsis cut-offs computed there are
  estimates for these scripts. Wrapping still breaks between words, and an ellipsis cuts between
  whole letters, never between a letter and its marks (where the runtime has `Intl.Segmenter`).
- **The built-in UI is not translated into Arabic or Hebrew.** plotly.js's `ar` and `he` locales
  carry month and day names and date formats but no UI strings, and Holochart's own strings are
  not translated into them either: modebar titles, hover label words and keyboard announcements
  stay English.
- **Tested without glyphs.** The unit tests check that Arabic and Hebrew labels measure, wrap,
  truncate and go through a whole figure without an error, and that the text engine receives them
  untouched in logical order. No visual test covers the drawn glyphs: the example above needs
  fonts fetched at run time.

## Chinese, Japanese and Korean

CJK text works the same way: the default font has no CJK glyphs, so they come from the fallback
fonts or from a registered family such as Noto Sans JP. A registered family draws the whole label,
so pick one that also covers Latin letters and digits (CJK fonts do).

<Example id="locales/japanese" />

## Shipped locales

`@mk7s/holochart-locales` exports each locale under its name in camel case (`pt-BR` → `ptBR`), and
`allLocales` with all of them. Locales without a dictionary change only formats: their UI strings
stay English, or come from the language when it is registered (_via_). The separators are the
defaults of `layout.separators` (decimal, then thousands). Ten locales also translate
[Holochart's own strings](#holochart-s-own-strings): `de`, `es`, `fr`, `it`, `ja`, `ko`, `pt-BR`,
`ru`, `tr` and `zh-CN`.

| Locale  | Language               | Export | UI strings | Separators |
| ------- | ---------------------- | ------ | ---------- | ---------- |
| `af`    | Afrikaans              | `af`   | —          | `.` `,`    |
| `am`    | Amharic                | `am`   | —          | `.` `,`    |
| `ar`    | Arabic                 | `ar`   | —          | `.` `,`    |
| `ar-DZ` | Arabic (Algeria)       | `arDZ` | —          | `.` `,`    |
| `ar-EG` | Arabic (Egypt)         | `arEG` | —          | `.` `,`    |
| `az`    | Azerbaijani            | `az`   | —          | `.` `,`    |
| `bg`    | Bulgarian              | `bg`   | —          | `.` `,`    |
| `bs`    | Bosnian                | `bs`   | —          | `.` `,`    |
| `ca`    | Catalan                | `ca`   | —          | `.` `,`    |
| `cs`    | Czech                  | `cs`   | yes        | `,` space  |
| `cy`    | Welsh                  | `cy`   | yes        | `.` `,`    |
| `da`    | Danish                 | `da`   | —          | `.` `,`    |
| `de`    | German                 | `de`   | yes        | `,` `.`    |
| `de-CH` | German (Switzerland)   | `deCH` | via `de`   | `,` `.`    |
| `el`    | Greek                  | `el`   | —          | `.` `,`    |
| `eo`    | Esperanto              | `eo`   | —          | `.` `,`    |
| `es`    | Spanish                | `es`   | yes        | `,` space  |
| `es-AR` | Spanish (Argentina)    | `esAR` | via `es`   | `,` space  |
| `es-PE` | Spanish (Peru)         | `esPE` | via `es`   | `.` `,`    |
| `et`    | Estonian               | `et`   | —          | `.` `,`    |
| `eu`    | Basque                 | `eu`   | —          | `.` `,`    |
| `fa`    | Persian                | `fa`   | —          | `.` `,`    |
| `fi`    | Finnish                | `fi`   | yes        | `.` `,`    |
| `fo`    | Faroese                | `fo`   | —          | `.` `,`    |
| `fr`    | French                 | `fr`   | yes        | `,` space  |
| `fr-CH` | French (Switzerland)   | `frCH` | via `fr`   | `,` space  |
| `gl`    | Galician               | `gl`   | —          | `.` `,`    |
| `gu`    | Gujarati               | `gu`   | —          | `.` `,`    |
| `he`    | Hebrew                 | `he`   | —          | `.` `,`    |
| `hi-IN` | Hindi (India)          | `hiIN` | —          | `.` `,`    |
| `hr`    | Croatian               | `hr`   | yes        | `,` `,`    |
| `hu`    | Hungarian              | `hu`   | —          | `.` `,`    |
| `hy`    | Armenian               | `hy`   | —          | `.` `,`    |
| `id`    | Indonesian             | `id`   | —          | `.` `,`    |
| `is`    | Icelandic              | `is`   | —          | `.` `,`    |
| `it`    | Italian                | `it`   | yes        | `,` `.`    |
| `ja`    | Japanese               | `ja`   | yes        | `.` `,`    |
| `ka`    | Georgian               | `ka`   | —          | `.` `,`    |
| `km`    | Khmer                  | `km`   | —          | `.` `,`    |
| `ko`    | Korean                 | `ko`   | yes        | `.` `,`    |
| `lt`    | Lithuanian             | `lt`   | —          | `.` `,`    |
| `lv`    | Latvian                | `lv`   | —          | `.` `,`    |
| `me`    | Montenegrin (Cyrillic) | `me`   | —          | `.` `,`    |
| `me-ME` | Montenegrin (Latin)    | `meME` | —          | `.` `,`    |
| `mk`    | Macedonian             | `mk`   | —          | `.` `,`    |
| `ml`    | Malayalam              | `ml`   | —          | `.` `,`    |
| `ms`    | Malay                  | `ms`   | —          | `.` `,`    |
| `mt`    | Maltese                | `mt`   | —          | `.` `,`    |
| `nl`    | Dutch                  | `nl`   | yes        | `,` `.`    |
| `nl-BE` | Dutch (Belgium)        | `nlBE` | —          | `,` `.`    |
| `no`    | Norwegian              | `no`   | yes        | `,` space  |
| `pa`    | Punjabi                | `pa`   | —          | `.` `,`    |
| `pl`    | Polish                 | `pl`   | —          | `.` `,`    |
| `pt-BR` | Portuguese (Brazil)    | `ptBR` | yes        | `,` `.`    |
| `pt-PT` | Portuguese (Portugal)  | `ptPT` | yes        | `,` `.`    |
| `rm`    | Romansh                | `rm`   | —          | `.` `,`    |
| `ro`    | Romanian               | `ro`   | yes        | `.` `,`    |
| `ru`    | Russian                | `ru`   | yes        | `,` space  |
| `si`    | Sinhala                | `si`   | yes        | `.` `,`    |
| `sk`    | Slovak                 | `sk`   | yes        | `,` space  |
| `sl`    | Slovenian              | `sl`   | —          | `.` `,`    |
| `sq`    | Albanian               | `sq`   | —          | `.` `,`    |
| `sr`    | Serbian (Cyrillic)     | `sr`   | —          | `.` `,`    |
| `sr-SR` | Serbian (Latin)        | `srSR` | —          | `.` `,`    |
| `sv`    | Swedish                | `sv`   | yes        | `.` `,`    |
| `sw`    | Swahili                | `sw`   | yes        | `.` `,`    |
| `ta`    | Tamil                  | `ta`   | —          | `.` `,`    |
| `th`    | Thai                   | `th`   | —          | `.` `,`    |
| `tr`    | Turkish                | `tr`   | yes        | `,` `.`    |
| `tt`    | Tatar                  | `tt`   | —          | `.` `,`    |
| `uk`    | Ukrainian              | `uk`   | yes        | `,` space  |
| `ur`    | Urdu                   | `ur`   | —          | `.` `,`    |
| `vi`    | Vietnamese             | `vi`   | —          | `.` `,`    |
| `zh-CN` | Chinese (Simplified)   | `zhCN` | yes        | `.` `,`    |
| `zh-HK` | Chinese (Hong Kong)    | `zhHK` | via `zh`   | `.` `,`    |
| `zh-TW` | Chinese (Traditional)  | `zhTW` | yes        | `.` `,`    |

The data is plotly.js's `lib/locales` (MIT License), with one fix: the Arabic name of May.

## Plotly differences

- Locale names match case-insensitively and `_` works as `-`; Plotly needs the exact name.
- In the default `en-US` locale, `%x`, `%X` and `%c` follow d3's US English (`3/5/2024`,
  `12:30:00 PM`), where Plotly writes `03/05/2024` and `12:30:00`. Registered English locales and
  every other locale use their own definitions, as in Plotly.
- Table cells and parallel coordinates ticks are written in US English, as in Plotly.
- Holochart has no text editing, notifier or Chart Studio link, so those dictionary entries
  (`'Click to enter Plot title'`, `'Snapshot succeeded'`, …) are unused.
- Plotly has no accessibility text. Holochart's generated summaries and keyboard announcements are
  translated in [ten locales](#holochart-s-own-strings); the rest of the screen-reader
  description (chart type, axis and trace lines, table captions) is English.
