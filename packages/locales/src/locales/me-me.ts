/**
 * Montenegrin (Latin) (`me-ME`), from plotly.js `lib/locales/me-me.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Montenegrin (Latin) (`me-ME`): formats only, UI strings stay English. */
export const meME: LocaleModule = {
  moduleType: 'locale',
  name: 'me-ME',
  dictionary: {},
  format: {
    days: ['Neđelja', 'Poneđeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'],
    shortDays: ['Neđ', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub'],
    months: [
      'Januar',
      'Februar',
      'Mart',
      'April',
      'Maj',
      'Jun',
      'Jul',
      'Avgust',
      'Septembar',
      'Oktobar',
      'Novembar',
      'Decembar',
    ],
    shortMonths: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Maj',
      'Jun',
      'Jul',
      'Avg',
      'Sep',
      'Okt',
      'Nov',
      'Dec',
    ],
    date: '%d/%m/%Y',
  },
};
