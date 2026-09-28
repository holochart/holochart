/**
 * Danish (`da`), from plotly.js `lib/locales/da.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Danish (`da`): formats only, UI strings stay English. */
export const da: LocaleModule = {
  moduleType: 'locale',
  name: 'da',
  dictionary: {},
  format: {
    days: ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'],
    shortDays: ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'],
    months: [
      'Januar',
      'Februar',
      'Marts',
      'April',
      'Maj',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'December',
    ],
    shortMonths: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Maj',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Dec',
    ],
    date: '%d-%m-%Y',
  },
};
