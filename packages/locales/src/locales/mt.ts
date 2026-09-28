/**
 * Maltese (`mt`), from plotly.js `lib/locales/mt.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Maltese (`mt`): formats only, UI strings stay English. */
export const mt: LocaleModule = {
  moduleType: 'locale',
  name: 'mt',
  dictionary: {},
  format: {
    days: ['Il-Ħadd', 'It-Tnejn', 'It-Tlieta', 'L-Erbgħa', 'Il-Ħamis', 'Il-Ġimgħa', 'Is-Sibt'],
    shortDays: ['Ħad', 'Tne', 'Tli', 'Erb', 'Ħam', 'Ġim', 'Sib'],
    months: [
      'Jannar',
      'Frar',
      'Marzu',
      'April',
      'Mejju',
      'Ġunju',
      'Lulju',
      'Awissu',
      'Settembru',
      'Ottubru',
      'Novembru',
      'Diċembru',
    ],
    shortMonths: [
      'Jan',
      'Fra',
      'Mar',
      'Apr',
      'Mej',
      'Ġun',
      'Lul',
      'Awi',
      'Set',
      'Ott',
      'Nov',
      'Diċ',
    ],
    date: '%d/%m/%Y',
  },
};
