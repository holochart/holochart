/**
 * Polish (`pl`), from plotly.js `lib/locales/pl.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Polish (`pl`): formats only, UI strings stay English. */
export const pl: LocaleModule = {
  moduleType: 'locale',
  name: 'pl',
  dictionary: {},
  format: {
    days: ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'],
    shortDays: ['Nie', 'Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'So'],
    months: [
      'Styczeń',
      'Luty',
      'Marzec',
      'Kwiecień',
      'Maj',
      'Czerwiec',
      'Lipiec',
      'Sierpień',
      'Wrzesień',
      'Październik',
      'Listopad',
      'Grudzień',
    ],
    shortMonths: ['Sty', 'Lu', 'Mar', 'Kw', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Pa', 'Lis', 'Gru'],
    date: '%Y-%m-%d',
  },
};
