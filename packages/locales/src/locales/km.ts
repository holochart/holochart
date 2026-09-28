/**
 * Khmer (`km`), from plotly.js `lib/locales/km.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Khmer (`km`): formats only, UI strings stay English. */
export const km: LocaleModule = {
  moduleType: 'locale',
  name: 'km',
  dictionary: {},
  format: {
    days: [
      'ថ្ងៃ​អាទិត្យ',
      'ថ្ងៃ​ចន្ទ',
      'ថ្ងៃ​អង្គារ',
      'ថ្ងៃ​ពុធ',
      'ថ្ងៃ​ព្រហស្បត្តិ៍',
      'ថ្ងៃ​សុក្រ',
      'ថ្ងៃ​សៅរ៍',
    ],
    shortDays: ['អា', 'ចន្ទ', 'អង្គ', 'ពុធ', 'ព្រហ', 'សុ', 'សៅរ៍'],
    months: [
      'ខែ​មករា',
      'ខែ​កុម្ភៈ',
      'ខែ​មិនា',
      'ខែ​មេសា',
      'ខែ​ឧសភា',
      'ខែ​មិថុនា',
      'ខែ​កក្កដា',
      'ខែ​សីហា',
      'ខែ​កញ្ញា',
      'ខែ​តុលា',
      'ខែ​វិច្ឆិកា',
      'ខែ​ធ្នូ',
    ],
    shortMonths: [
      'មក',
      'កុ',
      'មិនា',
      'មេ',
      'ឧស',
      'មិថុ',
      'កក្ក',
      'សី',
      'កញ្ញា',
      'តុលា',
      'វិច្ឆិ',
      'ធ្នូ',
    ],
    date: '%d/%m/%Y',
  },
};
