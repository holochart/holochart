# Data sources

## daily.json

Source: NOAA's Global Historical Climatology Network Daily (GHCN-Daily), station `USW00013960`, Dallas Love Field
("DALLAS FAA AIRPORT, TX US", 32.838° N, 96.836° W, 148 m), retrieved on 2026-10-02 with one public GET request:
`https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00013960.csv`. GHCN-Daily is a
US government work in the public domain. The raw CSV (10 MB) is kept outside the repo; only the derived JSON is
committed.

The file is columnar, one value per day from `start` (1939-08-01) to `end` (2026-09-29), 31,837 days, in the
station's own units; `analysis.mts` converts to °F, inches and mph. `-9999` marks a missing reading.

- `tmax`, `tmin`: daily high and low, tenths of °C.
  One low is treated as missing by `analysis.mts`: 0.0 °C on 2025-06-24, between lows of 25.0 and 23.9 °C, a faulty
  reading.
- `prcp`: daily precipitation, tenths of mm. Rain data has gaps in 1997 (43 days) and 1998 (90 days); the charts
  leave those two years out of rain totals.
- `snow`: daily snowfall, mm. Missing for long stretches (December 1973 to June 1976, late 1997 to January 2004); the
  snow chart leaves those winters out.
- `awnd`, `wdf2`, `wsf2`: average wind speed (tenths of m/s), and the direction (degrees) and speed (tenths of m/s) of
  the fastest 2-minute wind, from `windStart` (1997-04-01) on. Earlier wind data is not in the daily file.
- `thunder`, `fog`: day indexes (0 = `start`) on which the station reported thunder (`WT03`) or fog (`WT01`). The station reported no
  thunder at all in 1940 to 1947 and in 1998; those years are left out of thunder averages.

Love Field is inside the city of Dallas. The official "Dallas/Fort Worth" climate record is kept at DFW Airport,
25 km to the west, so records quoted in the news (for example 113 °F in June 1980) can differ by a degree or two
from the ones on this page.
