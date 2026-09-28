/**
 * Faroese (`fo`), from plotly.js `lib/locales/fo.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Faroese (`fo`): formats only, UI strings stay English. */
export const fo: LocaleModule = {
  moduleType: 'locale',
  name: 'fo',
  dictionary: {},
  format: {
    days: [
      'Sunnudagur',
      'Mánadagur',
      'Týsdagur',
      'Mikudagur',
      'Hósdagur',
      'Fríggjadagur',
      'Leyardagur',
    ],
    shortDays: ['Sun', 'Mán', 'Týs', 'Mik', 'Hós', 'Frí', 'Ley'],
    months: [
      'Januar',
      'Februar',
      'Mars',
      'Apríl',
      'Mei',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Desember',
    ],
    shortMonths: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Des',
    ],
    date: '%d-%m-%Y',
  },
};
