# Data sources

All data was retrieved on 2026-10-04 (a Sunday; the last session in the downloads is Friday 2026-10-02) with plain
public GET requests. No logins, API keys or cookies were used. Raw downloads are kept outside the repo; `import-data.py`
turns them into the two JSON files committed here:

```bash
python3 import-data.py <raw-dir>
pnpm exec prettier --write examples/demos/index-funds/data/*.json
```

## The four years

The demo covers the close of **2022-09-30** to the close of **2026-09-30**, split at the close of **2024-09-30**: two
halves of 501 sessions, 24 months and 8 quarters each. The two October 2026 sessions in the downloads are dropped so
both halves are whole months. `market.json` also keeps the year before (from 2021-10-01), so drawdowns can be measured
from the 2021–22 highs and rolling windows are full on the first day.

## Prices: market.json

Source: the Yahoo Finance chart endpoint, which finance.yahoo.com pages call in the browser. It is public and
unauthenticated, but undocumented, so its format may change.

```
https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?period1=1622505600&period2=1791072000&interval=1d&events=div,splits
```

| Group        | Tickers                                                             |
| ------------ | ------------------------------------------------------------------- |
| `funds`      | SPY, QQQ, DIA, IWM, VTI                                             |
| `styles`     | RSP (equal weight), MDY (mid caps), VUG (growth), VTV (value)       |
| `sectors`    | XLK, XLC, XLY, XLF, XLV, XLI, XLP, XLE, XLU, XLB, XLRE              |
| `assets`     | VXUS, VEA, VWO, BND, TLT, GLD, BIL                                  |
| `stocks`     | NVDA, AAPL, MSFT, AMZN, GOOGL, META, TSLA, AVGO                     |
| `indicators` | ^VIX (as `VIX`), ^TNX (10-year yield, `TNX`), ^IRX (13-week, `IRX`) |

- `date` is the shared trading calendar, 1,254 sessions from 2021-10-01 to 2026-09-30. `base` (251) and `split` (752)
  are the indexes of 2022-09-30 and 2024-09-30. Every ETF and stock has a price on every session; the importer fails
  otherwise.
- `adjClose` is Yahoo's adjusted close: split- **and** dividend-adjusted, so its returns are total returns with
  distributions reinvested. Every return, drawdown and statistic on the page uses it. Rounded to 6 significant digits.
- `ohlcv` (SPY, QQQ, DIA, IWM, from 2022-09-30) holds open, high, low, close and volume as traded: split-adjusted but
  not dividend-adjusted, as price charts show them. `dividends` lists those four funds' cash distributions in the
  window as `[ex-date, amount per share]`.
- `indicators` are index closes, not prices: the VIX in percent a year, the two yields in percent. A session an index
  did not report repeats its last value.
- Session dates are taken from Yahoo's timestamps in New York time.

## Holdings: holdings.json

State Street publishes each SPDR fund's full daily holdings as a workbook:

```
https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-{ticker}.xlsx
```

for `spy`, `dia` and the eleven sector funds, all as of 2026-10-01.

- `SPY.holdings` is the S&P 500 (504 share lines of about 500 companies) and `DIA.holdings` the Dow's 30, largest
  first. `weight` is the percent of the fund's stock portfolio: the file's weight, rescaled so the stocks sum to 100
  (the cash line and a contingent value right weighing 0.000003% are dropped).
- The SPY workbook does not carry sectors. `sector` is the Select Sector SPDR fund that holds the stock: the eleven
  sector funds partition the S&P 500, so each stock is in exactly one. All 504 lines matched.
- Company names are the workbook's descriptions in title case with share-class and legal suffixes removed
  ("ALPHABET INC CL A" becomes "Alphabet (A)"); a handful are spelled by hand in `import-data.py`.
- The weights are from the day after the four years end, so they show where the four years left the index, not what
  it held along the way.

## Events

The dated events in `analysis.mts` (`EVENTS`) are limited to widely reported turning points whose dates the price data
itself confirms: the October 2022 low, the March 2023 bank failures, the October 2023 low, the August 2024 sell-off,
the November 2024 election, and the April 2025 tariff announcement and pause. The March 2026 low is described from the
data alone, without a cause.

## Licensing / attribution

Prices: Yahoo Finance. Holdings: State Street Global Advisors (SPDR). These are public web pages and files, used here
with attribution for a demo; they are not redistributed as datasets. Nothing on the demo page is investment advice.
