# @mk7s/holochart-locales

Locale modules for Holochart: UI strings (modebar titles, default trace names, hover labels),
month and day names, number separators and date formats. They are plotly.js's locales, in the
same shape, one module per locale so apps bundle only the ones they use.

> **Status: pre-alpha.** Not published to npm yet; every API will change.

```ts
import { createChart, register } from '@mk7s/holochart';
import { de, fr } from '@mk7s/holochart-locales';

register(de, fr);
createChart(el, { data, config: { locale: 'de' } });
```

Every locale is exported under its name in camel case (`de`, `deCH`, `ptBR`, `zhCN`), and
`allLocales` holds all 76. Script-tag users load `dist/scripts/holochart-locale-<name>.js` (or
`holochart-locales.js` for all of them) after `holochart.iife.min.js`.

Ten locales (`de`, `es`, `fr`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `tr`, `zh-CN`) also translate
Holochart's own strings, which plotly.js does not have: the generated chart summaries and keyboard
announcements that screen readers get, and a few labels. Those translations are machine
translations that no native speaker has reviewed; the other locales fall back to English for them.

See the [Locales guide](https://mk7s.dev/holochart/fundamentals/locales) for what a locale changes,
`layout.separators`, the fallback from `de-CH` to `de`, and right-to-left and CJK text, with its
limits.

## License

MIT (see [LICENSE](LICENSE)). The locale data comes from plotly.js's `lib/locales` (MIT License,
Copyright (c) 2016-2024 Plotly Technologies Inc.); its license is in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Holochart's own strings (`src/holochart/`) are
not from plotly.js.
