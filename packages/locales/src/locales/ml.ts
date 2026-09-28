/**
 * Malayalam (`ml`), from plotly.js `lib/locales/ml.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Malayalam (`ml`): formats only, UI strings stay English. */
export const ml: LocaleModule = {
  moduleType: 'locale',
  name: 'ml',
  dictionary: {},
  format: {
    days: ['ഞായര്‍', 'തിങ്കള്‍', 'ചൊവ്വ', 'ബുധന്‍', 'വ്യാഴം', 'വെള്ളി', 'ശനി'],
    shortDays: ['ഞായ', 'തിങ്ക', 'ചൊവ്വ', 'ബുധ', 'വ്യാഴം', 'വെള്ളി', 'ശനി'],
    months: [
      'ജനുവരി',
      'ഫെബ്രുവരി',
      'മാര്‍ച്ച്',
      'ഏപ്രില്‍',
      'മേയ്',
      'ജൂണ്‍',
      'ജൂലൈ',
      'ആഗസ്റ്റ്',
      'സെപ്റ്റംബര്‍',
      'ഒക്ടോബര്‍',
      'നവംബര്‍',
      'ഡിസംബര്‍',
    ],
    shortMonths: [
      'ജനു',
      'ഫെബ്',
      'മാര്‍',
      'ഏപ്രി',
      'മേയ്',
      'ജൂണ്‍',
      'ജൂലാ',
      'ആഗ',
      'സെപ്',
      'ഒക്ടോ',
      'നവം',
      'ഡിസ',
    ],
    date: '%d/%m/%Y',
  },
};
