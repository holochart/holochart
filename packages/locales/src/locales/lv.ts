/**
 * Latvian (`lv`), from plotly.js `lib/locales/lv.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Latvian (`lv`): formats only, UI strings stay English. */
export const lv: LocaleModule = {
  moduleType: 'locale',
  name: 'lv',
  dictionary: {},
  format: {
    days: [
      'svētdiena',
      'pirmdiena',
      'otrdiena',
      'trešdiena',
      'ceturtdiena',
      'piektdiena',
      'sestdiena',
    ],
    shortDays: ['svt', 'prm', 'otr', 'tre', 'ctr', 'pkt', 'sst'],
    months: [
      'Janvāris',
      'Februāris',
      'Marts',
      'Aprīlis',
      'Maijs',
      'Jūnijs',
      'Jūlijs',
      'Augusts',
      'Septembris',
      'Oktobris',
      'Novembris',
      'Decembris',
    ],
    shortMonths: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Mai',
      'Jūn',
      'Jūl',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Dec',
    ],
    date: '%d-%m-%Y',
  },
};
