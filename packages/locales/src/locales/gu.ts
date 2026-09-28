/**
 * Gujarati (`gu`), from plotly.js `lib/locales/gu.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Gujarati (`gu`): formats only, UI strings stay English. */
export const gu: LocaleModule = {
  moduleType: 'locale',
  name: 'gu',
  dictionary: {},
  format: {
    days: ['રવિવાર', 'સોમવાર', 'મંગળવાર', 'બુધવાર', 'ગુરુવાર', 'શુક્રવાર', 'શનિવાર'],
    shortDays: ['રવિ', 'સોમ', 'મંગળ', 'બુધ', 'ગુરુ', 'શુક્ર', 'શનિ'],
    months: [
      'જાન્યુઆરી',
      'ફેબ્રુઆરી',
      'માર્ચ',
      'એપ્રિલ',
      'મે',
      'જૂન',
      'જુલાઈ',
      'ઑગસ્ટ',
      'સપ્ટેમ્બર',
      'ઑક્ટોબર',
      'નવેમ્બર',
      'ડિસેમ્બર',
    ],
    shortMonths: [
      'જાન્યુ',
      'ફેબ્રુ',
      'માર્ચ',
      'એપ્રિલ',
      'મે',
      'જૂન',
      'જુલાઈ',
      'ઑગસ્ટ',
      'સપ્ટે',
      'ઑક્ટો',
      'નવે',
      'ડિસે',
    ],
    date: '%d-%b-%Y',
  },
};
