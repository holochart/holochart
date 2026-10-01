# @mk7s/holochart-traces-finance

The financial trace types of Holochart: `ohlc`, `candlestick`, `waterfall`, `funnel`, `funnelarea`
and `indicator`. Part of [Holochart](https://github.com/holochart/holochart), declarative GPU
charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package.

## Install

```sh
pnpm add @mk7s/holochart-traces-finance@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## What it exports

- **`financeTraces`:** every trace module below, to register at once
- **Trace modules:** `ohlc`, `candlestick`, `waterfall`, `funnel`, `funnelarea`, `indicator`
- **Attribute schemas:** `ohlcAttributes`, `candlestickAttributes`, `waterfallAttributes`,
  `funnelAttributes`, `funnelareaAttributes`, `indicatorAttributes`

## Usage

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { financeTraces } from '@mk7s/holochart-traces-finance';

register(...financeTraces, ...builtinComponents);

createChart(el, {
  data: [
    {
      type: 'candlestick',
      x: ['2026-01-02', '2026-01-05'],
      open: [10, 11],
      high: [12, 13],
      low: [9, 10],
      close: [11, 12],
    },
  ],
});
```

## Docs

- [Chart types](https://mk7s.dev/holochart/charts/): [candlestick](https://mk7s.dev/holochart/charts/financial/candlestick),
  [waterfall](https://mk7s.dev/holochart/charts/financial/waterfall),
  [indicator](https://mk7s.dev/holochart/charts/financial/indicator)
- Attribute reference: [candlestick](https://mk7s.dev/holochart/reference/candlestick),
  [ohlc](https://mk7s.dev/holochart/reference/ohlc),
  [waterfall](https://mk7s.dev/holochart/reference/waterfall)
- [Dates & time series](https://mk7s.dev/holochart/fundamentals/dates-time-series)
- [API reference](https://mk7s.dev/holochart/reference/api/)

## License

MIT (see [LICENSE](LICENSE)).
