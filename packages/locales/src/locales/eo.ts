/**
 * Esperanto (`eo`), from plotly.js `lib/locales/eo.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Esperanto (`eo`): formats only, UI strings stay English. */
export const eo: LocaleModule = {
  moduleType: 'locale',
  name: 'eo',
  dictionary: {},
  format: {
    days: ['Dimanĉo', 'Lundo', 'Mardo', 'Merkredo', 'Ĵaŭdo', 'Vendredo', 'Sabato'],
    shortDays: ['Dim', 'Lun', 'Mar', 'Mer', 'Ĵaŭ', 'Ven', 'Sab'],
    months: [
      'Januaro',
      'Februaro',
      'Marto',
      'Aprilo',
      'Majo',
      'Junio',
      'Julio',
      'Aŭgusto',
      'Septembro',
      'Oktobro',
      'Novembro',
      'Decembro',
    ],
    shortMonths: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Maj',
      'Jun',
      'Jul',
      'Aŭg',
      'Sep',
      'Okt',
      'Nov',
      'Dec',
    ],
    date: '%d/%m/%Y',
  },
};
