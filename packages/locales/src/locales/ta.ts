/**
 * Tamil (`ta`), from plotly.js `lib/locales/ta.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Tamil (`ta`): formats only, UI strings stay English. */
export const ta: LocaleModule = {
  moduleType: 'locale',
  name: 'ta',
  dictionary: {},
  format: {
    days: [
      'ஞாயிற்றுக்கிழமை',
      'திங்கட்கிழமை',
      'செவ்வாய்க்கிழமை',
      'புதன்கிழமை',
      'வியாழக்கிழமை',
      'வெள்ளிக்கிழமை',
      'சனிக்கிழமை',
    ],
    shortDays: ['ஞாயிறு', 'திங்கள்', 'செவ்வாய்', 'புதன்', 'வியாழன்', 'வெள்ளி', 'சனி'],
    months: [
      'தை',
      'மாசி',
      'பங்குனி',
      'சித்திரை',
      'வைகாசி',
      'ஆனி',
      'ஆடி',
      'ஆவணி',
      'புரட்டாசி',
      'ஐப்பசி',
      'கார்த்திகை',
      'மார்கழி',
    ],
    shortMonths: [
      'தை',
      'மாசி',
      'பங்',
      'சித்',
      'வைகா',
      'ஆனி',
      'ஆடி',
      'ஆவ',
      'புர',
      'ஐப்',
      'கார்',
      'மார்',
    ],
    date: '%d/%m/%Y',
  },
};
