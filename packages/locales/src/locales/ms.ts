/**
 * Malay (`ms`), from plotly.js `lib/locales/ms.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Malay (`ms`): formats only, UI strings stay English. */
export const ms: LocaleModule = {
  moduleType: 'locale',
  name: 'ms',
  dictionary: {},
  format: {
    days: ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'],
    shortDays: ['Aha', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'],
    months: [
      'Januari',
      'Februari',
      'Mac',
      'April',
      'Mei',
      'Jun',
      'Julai',
      'Ogos',
      'September',
      'Oktober',
      'November',
      'Disember',
    ],
    shortMonths: [
      'Jan',
      'Feb',
      'Mac',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Ogo',
      'Sep',
      'Okt',
      'Nov',
      'Dis',
    ],
    date: '%d/%m/%Y',
  },
};
