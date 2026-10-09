---
title: Rank categories with horizontal bars
description: Sort a single category-value table, place the largest bar at the top, and label percentages directly.
status: complete
recipe-example: recipes/ranked-bars
---

# Rank categories with horizontal bars

## Problem

Readers need to find the largest traffic sources quickly, including categories with long names.
A ranked horizontal bar chart creates an obvious reading order and leaves room for the labels.
These eight percentages are an illustrative fixed dataset, not live analytics.

## Finished chart and complete source

<Example id="recipes/ranked-bars" />

Open **Complete source** to copy or download the browser module. It includes the category-value
pairs, sorting step, highlighted category, labels, hover formatting and cleanup. No verified
exact Python counterpart is offered for this example.

[Complete browser source (.js)](/gallery/sources/recipes/ranked-bars.js) ·
[Example details and downloads](/gallery/example/recipes/ranked-bars)

## Key choices

- Copy and sort the pairs together with `[...SHARE].sort((a, b) => a[1] - b[1])`. Sorting labels
  and values separately would silently associate the wrong number with a category.
- With `orientation: 'h'`, categories are on y. The default category direction runs upward,
  so ascending values put the largest category at the top.
- `texttemplate: '%{x:.1f}%'` and `textposition: 'outside'` label each bar directly. The x range
  extends to 44, beyond the largest value of 38.2, leaving space for those labels.
- A per-bar color array highlights `Social networks`. The highlight is based on the category
  name after sorting, rather than on an index that changes with the data.

## Adapt it

Choose a stable tie rule when equal values occur, and state whether percentages use all traffic
or a filtered subset. Keep a zero baseline for these absolute bars. If you only show the top
five, explain where the remaining share went; direct labels do not replace a denominator.
For before/after differences, consider a dumbbell chart rather than ranking two separate lists.

## Related families

[Basic comparisons](/gallery/basic/), [horizontal bars](/charts/basic/horizontal-bar),
[dumbbell examples](/gallery/basic/?subtype=dumbbell), and
[the complete example](/gallery/example/recipes/ranked-bars).
