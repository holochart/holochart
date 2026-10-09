---
title: Make missing observations visible
description: Preserve null values and compare broken lines with an explicitly connected series without treating missing data as zero.
status: complete
recipe-example: line/gaps
---

<script setup>
import NotebookLinks from '../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Make missing observations visible

## Problem

A sensor has outages and one invalid sample. A continuous line could imply measurements were
recorded through the gaps. Preserve missing values, then decide whether connecting across them
matches the meaning of your data.

## Finished chart and complete source

<Example id="line/gaps" />

The first line breaks at two missing intervals and one invalid reading. The second uses
`connectgaps: true` and is offset upward by eight degrees to make the comparison readable;
it is the same underlying sensor series, not a second sensor. Open **Complete source** for the
browser module or its verified Python counterpart. The Python dictionary represents non-finite
missing values as `None`, avoiding non-standard JSON `NaN` literals.

[Complete browser source (.js)](/gallery/sources/line/gaps.js) ·
[Example details and downloads](/gallery/example/line/gaps)

<NotebookLinks slug="time-series-gaps" variant="line-gaps" />

## Key choices

- The 48 x positions remain present. Missing y readings are `null`; the invalid browser sample
  is `NaN`. Do not replace them with zero or delete their timestamps.
- The default trace breaks at missing values. `connectgaps: true` draws a straight segment
  between existing endpoints; it does not recover or estimate the absent observations.
- `lines+markers` shows where readings actually exist. The comparison line's eight-degree
  offset is a display choice and must not be mistaken for a measured temperature increase.

## Adapt it

Decide how long a gap readers may reasonably bridge, using your domain rather than an arbitrary
visual preference. Split long outages into separate traces when you need a stricter rule.
Distinguish missing readings from real zeroes and from rejected samples in your data pipeline.
The example uses elapsed hours; use actual calendar timestamps for irregular observations.

## Related families

[Time series](/gallery/time-series/), [line guide](/charts/basic/line),
[date axes](./date-axes), [Python data troubleshooting](/python/troubleshooting), and
[the complete example](/gallery/example/line/gaps).
