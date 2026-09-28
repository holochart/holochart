/**
 * Indonesian (`id`), from plotly.js `lib/locales/id.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Indonesian (`id`): formats only, UI strings stay English. */
export const id: LocaleModule = {
  moduleType: 'locale',
  name: 'id',
  dictionary: {},
  format: {
    days: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
    shortDays: ['Min', 'Sen', 'Sel', 'Rab', 'kam', 'Jum', 'Sab'],
    months: [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'Nopember',
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
      'Agus',
      'Sep',
      'Okt',
      'Nop',
      'Des',
    ],
    date: '%d/%m/%Y',
  },
};
