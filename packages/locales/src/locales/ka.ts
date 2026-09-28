/**
 * Georgian (`ka`), from plotly.js `lib/locales/ka.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Georgian (`ka`): formats only, UI strings stay English. */
export const ka: LocaleModule = {
  moduleType: 'locale',
  name: 'ka',
  dictionary: {},
  format: {
    days: ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'],
    shortDays: ['კვ', 'ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ'],
    months: [
      'იანვარი',
      'თებერვალი',
      'მარტი',
      'აპრილი',
      'მაისი',
      'ივნისი',
      'ივლისი',
      'აგვისტო',
      'სექტემბერი',
      'ოქტომბერი',
      'ნოემბერი',
      'დეკემბერი',
    ],
    shortMonths: [
      'იან',
      'თებ',
      'მარ',
      'აპრ',
      'მაისი',
      'ივნ',
      'ივლ',
      'აგვ',
      'სექ',
      'ოქტ',
      'ნოე',
      'დეკ',
    ],
    date: '%d/%m/%Y',
  },
};
