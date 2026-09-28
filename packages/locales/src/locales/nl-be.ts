/**
 * Dutch (Belgium) (`nl-BE`), from plotly.js `lib/locales/nl-be.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Dutch (Belgium) (`nl-BE`): formats only, UI strings stay English. */
export const nlBE: LocaleModule = {
  moduleType: 'locale',
  name: 'nl-BE',
  dictionary: {},
  format: {
    days: ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'],
    shortDays: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
    months: [
      'januari',
      'februari',
      'maart',
      'april',
      'mei',
      'juni',
      'juli',
      'augustus',
      'september',
      'oktober',
      'november',
      'december',
    ],
    shortMonths: [
      'jan',
      'feb',
      'mrt',
      'apr',
      'mei',
      'jun',
      'jul',
      'aug',
      'sep',
      'okt',
      'nov',
      'dec',
    ],
    date: '%d/%m/%Y',
  },
};
