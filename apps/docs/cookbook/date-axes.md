---
title: Format dates at several zoom levels
description: Use UTC timestamps, date axes, period labels and zoom-dependent tick formats for daily order data.
status: complete
recipe-example: timeseries/date-formatting
---

# Format dates at several zoom levels

## Problem

You have many daily observations. Full dates on every tick are crowded at the overview scale;
month-only labels become ambiguous after zooming in. Let the tick format follow the tick spacing,
while hover preserves the exact date and units.

## Finished chart and complete source

<Example id="timeseries/date-formatting" />

The source generates 548 synthetic daily order counts starting at 1 July 2024. Dates are UTC
milliseconds from `Date.UTC`, with weekdays read using `getUTCDay`. Open **Complete source** for
the runnable browser module, including its seeded generator and date-formatting configuration.
No verified exact Python counterpart is offered for this example.

[Complete browser source (.js)](/gallery/sources/timeseries/date-formatting.js) ·
[Example details and downloads](/gallery/example/timeseries/date-formatting)

## Key choices

- `xaxis.type: 'date'` gives timestamps calendar semantics. UTC arithmetic avoids local
  daylight-saving changes in this example's one-day sampling interval.
- `tickformatstops` uses hour labels below a day, day/month labels below a month, month/year
  labels below a year, and year labels above that. Stop ranges are tick spacings, not data ranges.
- `ticklabelmode: 'period'` centers month labels in the period they describe; it does not
  aggregate the underlying daily values into monthly totals.
- The hover template formats `%{x|%A, %d %B %Y}` and adds the order count. The y tick format
  inserts grouping separators without changing the numeric values.

## Adapt it

Choose a consistent timezone policy before combining data sources. Parse dates explicitly,
sort them, and decide how duplicate timestamps and missing days should be handled. Calendar
months have variable lengths: use calendar month settings such as `M1` rather than a fixed
30-day duration for monthly ticks. The numeric x values in the [mixed chart](./mixed-line-bar)
represent week numbers and need conversion before using this date recipe.

## Related families

[Time series](/gallery/time-series/), [dates and time series](/fundamentals/dates-time-series),
[missing data](./missing-data), and
[the complete example](/gallery/example/timeseries/date-formatting).
