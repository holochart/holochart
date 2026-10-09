---
title: Link zoom and pan across browser panels
description: Match axis ranges across four subplots so autorange, zoom and pan preserve a common comparison scale.
status: complete
recipe-example: axes/linked-axes
---

# Link zoom and pan across browser panels

## Problem

Four temperature panels start with a common scale, but independent zooming would make their
visual comparison unreliable. Link their axis ranges so a drag in one panel keeps all four
views synchronized.

## Finished chart and complete source

<Example id="axes/linked-axes" />

The four panels show seeded weekly temperatures for Oslo, Madrid, Singapore and Buenos Aires.
Try dragging to zoom in one panel, switching the modebar to pan, and double-clicking to reset.
The interaction is implemented by matched axes **inside one browser chart**. It does not select
records across separate chart instances or broadcast an application event bus. Open **Complete
source** for the complete browser module. No verified exact Python counterpart is offered here.

[Complete browser source (.js)](/gallery/sources/axes/linked-axes.js) ·
[Example details and downloads](/gallery/example/axes/linked-axes)

## Key choices

- An independent two-by-two grid gives each panel its own ticks and named axes. Traces use
  `x`, `x2`, `x3`, `x4` and the corresponding y axes.
- `xaxis2`, `xaxis3` and `xaxis4` each set `matches: 'x'`; the three later y axes set
  `matches: 'y'`. Autorange uses the combined data, and zoom/pan share those ranges.
- All panels measure week number and degrees Celsius, so matching both axes makes sense.
  Do not match axes with unlike units merely to make their shapes look similar.
- Domain-relative annotations name each city inside its panel. A custom hover template also
  names the city and formats the temperature to one decimal place.

## Adapt it

Match only x for aligned time windows when each panel has a different y measure. Matching
ranges is different from [coupled small multiples](./small-multiples), which reuse axes by row
or column. For cross-filtering across separate charts, define an application selection model,
subscribe to events and dispose those subscriptions; this recipe implements only shared range
navigation, so it provides no cross-filtering claim.

## Related families

[Time series](/gallery/time-series/), [relationships](/gallery/relationships/),
[subplot axes](/fundamentals/layout-axes-subplots), and
[the complete example](/gallery/example/axes/linked-axes).
