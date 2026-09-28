/**
 * Punjabi (`pa`), from plotly.js `lib/locales/pa.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Punjabi (`pa`): formats only, UI strings stay English. */
export const pa: LocaleModule = {
  moduleType: 'locale',
  name: 'pa',
  dictionary: {},
  format: {
    days: ['ਐਤਵਾਰ', 'ਸੋਮਵਾਰ', 'ਮੰਗਲਵਾਰ', 'ਬੁੱਧਵਾਰ', 'ਵੀਰਵਾਰ', 'ਸ਼ੁੱਕਰਵਾਰ', 'ਸ਼ਨਿੱਚਰਵਾਰ'],
    shortDays: ['ਐਤ', 'ਸੋਮ', 'ਮੰਗਲ', 'ਬੁੱਧ', 'ਵੀਰ', 'ਸ਼ੁੱਕਰ', 'ਸ਼ਨਿੱਚਰ'],
    months: [
      'ਜਨਵਰੀ',
      'ਫ਼ਰਵਰੀ',
      'ਮਾਰਚ',
      'ਅਪ੍ਰੈਲ',
      'ਮਈ',
      'ਜੂਨ',
      'ਜੁਲਾਈ',
      'ਅਗਸਤ',
      'ਸਤੰਬਰ',
      'ਅਕਤੂਬਰ',
      'ਨਵੰਬਰ',
      'ਦਸੰਬਰ',
    ],
    shortMonths: [
      'ਜਨ',
      'ਫ਼ਰ',
      'ਮਾਰ',
      'ਅਪ੍ਰੈ',
      'ਮਈ',
      'ਜੂਨ',
      'ਜੁਲਾ',
      'ਅਗ',
      'ਸਤੰ',
      'ਅਕ',
      'ਨਵੰ',
      'ਦਸੰ',
    ],
    date: '%d-%m-%Y',
  },
};
