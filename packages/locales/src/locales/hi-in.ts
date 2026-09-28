/**
 * Hindi (India) (`hi-IN`), from plotly.js `lib/locales/hi-in.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Hindi (India) (`hi-IN`): formats only, UI strings stay English. */
export const hiIN: LocaleModule = {
  moduleType: 'locale',
  name: 'hi-IN',
  dictionary: {},
  format: {
    days: ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'],
    shortDays: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
    months: [
      'जनवरी',
      ' फरवरी',
      'मार्च',
      'अप्रैल',
      'मई',
      'जून',
      'जुलाई',
      'अगस्त',
      'सितम्बर',
      'अक्टूबर',
      'नवम्बर',
      'दिसम्बर',
    ],
    shortMonths: [
      'जन',
      'फर',
      'मार्च',
      'अप्रै',
      'मई',
      'जून',
      'जुलाई',
      'अग',
      'सित',
      'अक्टू',
      'नव',
      'दिस',
    ],
    date: '%d/%m/%Y',
  },
};
