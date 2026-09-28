/**
 * Icelandic (`is`), from plotly.js `lib/locales/is.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Icelandic (`is`): formats only, UI strings stay English. */
export const is: LocaleModule = {
  moduleType: 'locale',
  name: 'is',
  dictionary: {},
  format: {
    days: [
      'Sunnudagur',
      'Mánudagur',
      'Þriðjudagur',
      'Miðvikudagur',
      'Fimmtudagur',
      'Föstudagur',
      'Laugardagur',
    ],
    shortDays: ['Sun', 'Mán', 'Þri', 'Mið', 'Fim', 'Fös', 'Lau'],
    months: [
      'Janúar',
      'Febrúar',
      'Mars',
      'Apríl',
      'Maí',
      'Júní',
      'Júlí',
      'Ágúst',
      'September',
      'Október',
      'Nóvember',
      'Desember',
    ],
    shortMonths: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Maí',
      'Jún',
      'Júl',
      'Ágú',
      'Sep',
      'Okt',
      'Nóv',
      'Des',
    ],
    date: '%d/%m/%Y',
  },
};
