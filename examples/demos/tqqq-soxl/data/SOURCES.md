# Data sources

All data was retrieved on 2026-10-01 after the US market close, with plain public GET requests. No logins, API keys or
cookies were used. Raw downloads are kept outside the repo; only the derived JSON files are committed here.

## Prices: daily.json and intraday.json

Source: the Yahoo Finance chart endpoint, which finance.yahoo.com pages call in the browser. It is public and
unauthenticated, but undocumented, so its format may change.

| URL                                                                                                                                 | Used for        |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `https://query1.finance.yahoo.com/v8/finance/chart/{TQQQ,SOXL,QQQ,SOXX}?period1=0&period2=9999999999&interval=1d&events=div,splits` | `daily.json`    |
| `https://query1.finance.yahoo.com/v8/finance/chart/{TQQQ,SOXL}?range=5d&interval=5m`                                                | `intraday.json` |

### daily.json

- `date` is the shared trading calendar from TQQQ's first day (2010-02-11) to 2026-10-01: 4,185 sessions. The four
  calendars are identical where they overlap. Each series starts at index `start` (SOXL starts on 2010-03-11).
- `adjClose` is Yahoo's adjusted close: split- **and** dividend-adjusted, so its returns are total returns with
  distributions reinvested. All long-run returns, drawdowns and statistics on the page use it.
- `ohlcv` (TQQQ and SOXL, from 2024-10-01) holds open, high, low, close and volume, split-adjusted but not
  dividend-adjusted, as price charts show them. Only these recent sessions are kept, to keep the file small.
- Session dates are taken from Yahoo's timestamps in New York time. Prices are rounded to 6 significant digits.
- `splits` and `dividends` are Yahoo's events, dated in New York time. TQQQ has split 8 times (most recently 2:1 on
  2025-11-20), SOXL twice (4:1 in 2015, 15:1 in 2021).
- QQQ (Invesco QQQ Trust) tracks the Nasdaq-100, TQQQ's index. SOXX (iShares Semiconductor ETF) is used as the
  unleveraged reference for SOXL. It is a **proxy**: SOXL tracks the ICE Semiconductor Index today (earlier, the PHLX
  Semiconductor Sector Index), and SOXX's own index history is not identical. Their daily regression slope of
  about 2.96 shows how close the match is.

### intraday.json

- 5-minute bars of the last five sessions (2026-09-25 to 2026-10-01), regular hours only (09:30–16:00 New York time),
  timestamps in New York time. `previousClose` is Yahoo's `chartPreviousClose`, the close before the first bar.

## Holdings: holdings.json

Each issuer publishes its fund's full daily holdings as a CSV file.

| URL                                                              | Fund | As of      |
| ---------------------------------------------------------------- | ---- | ---------- |
| `https://accounts.profunds.com/etfdata/ByFund/TQQQ-psdlyhld.csv` | TQQQ | 2026-09-30 |
| `https://www.direxion.com/holdings/SOXL.csv`                     | SOXL | 2026-10-01 |

- `kind` classifies each row: `stock`, `swap` (total return swaps on the index), `future` (Nasdaq-100 E-mini futures),
  `tbill` (Treasury bills), `cash` (money-market funds), `other` (TQQQ's "Net Other Assets (Liabilities)").
- `exposure` is the index exposure in USD: ProShares' "Exposure Value (Notional + G/L)" for swaps and futures, and
  Direxion's market value of the swap asset leg for SOXL's swaps. For stocks it is the market value.
- `value` is the market value in USD of what the fund owns: stocks, T-bills, money-market funds and other net assets.
- TQQQ's `netAssets` is the sum of all market values ($37.73B). SOXL's is derived from the file's own
  `HoldingsPercent` column: market value / weight ($23.90B). With these, total exposure is 3.00× net assets for both
  funds, which checks the classification.
- SOXL's swap rows don't name the counterparty; the bank is read from the 2-letter code in the row's identifier
  (`ICESEM` + code + `L`): BC Barclays, GS Goldman Sachs, ML BofA Merrill Lynch, JP JPMorgan, BP BNP Paribas,
  NM Nomura, CT Citibank, UB UBS, SG Societe Generale. This mapping is an **inference** from the codes, matching the
  banks ProShares names for TQQQ. TQQQ's file names its counterparties; "Bank of America NA" is shown as
  "BofA Merrill Lynch" so the same bank has one name across both funds.
- Company names are the issuers' descriptions in title case.

## Licensing / attribution

Prices: Yahoo Finance; holdings: ProShares (ProShare Advisors) and Direxion. These are public web pages and files,
used here with attribution for a demo; they are not redistributed as datasets. Nothing on the demo page is investment
advice.
