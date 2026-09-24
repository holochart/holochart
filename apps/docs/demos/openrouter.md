---
title: OpenRouter token growth
description: Is OpenRouter's weekly token volume growing exponentially? A Holochart recreation of mk7s/exporouter, plus a year of usage by author, model, task and provider.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import {
  DOUBLING,
  expFn,
  FIRST_WEEK,
  fmtDate,
  fmtT,
  FULL,
  G1,
  G2,
  LAST_FULL_WEEK,
  MULTIPLE,
  N,
  PROJ,
  R2,
  WEEKLY,
  addWeeks,
  CURRENT,
} from '@mk7s/holochart-examples/demos/openrouter/analysis.mts';
import StatTiles from './components/StatTiles.vue';
import OpenRouterTables from './components/OpenRouterTables.vue';
import IndustrySources from './components/IndustrySources.vue';

const pct1 = (v) => (v * 100).toFixed(1);
const stats = [
  {
    value: `+${pct1(WEEKLY)}%`,
    label: 'average growth per week',
    aside: `≈ ${((1 + WEEKLY) ** 52).toFixed(0)}× a year if sustained`,
  },
  {
    value: `${DOUBLING.toFixed(1)} wks`,
    label: 'doubling time',
    aside: `about every ${((DOUBLING * 7) / 30.44).toFixed(1)} months`,
  },
  { value: R2.exp.toFixed(3), label: 'R², exponential fit', aside: `linear fit: ${R2.lin.toFixed(3)}` },
  {
    value: `${MULTIPLE.toFixed(1)}×`,
    label: `growth, ${fmtDate(FIRST_WEEK)} → ${fmtDate(LAST_FULL_WEEK)}`,
    aside: `${fmtT(FULL[0].tokensT)} → ${fmtT(FULL[N - 1].tokensT)} per week`,
  },
];
const projected = fmtT(expFn(N + PROJ - 1));
const projectedBy = fmtDate(addWeeks(LAST_FULL_WEEK, PROJ));
</script>

<p class="hc-eyebrow">OpenRouter · tokens processed per week · Feb 2 – Sep 22, 2026</p>

# Is OpenRouter's token usage growing exponentially?

<p class="hc-verdict">
  <strong>Yes, and slightly faster than exponential.</strong> Weekly tokens grew
  <strong>{{ MULTIPLE.toFixed(1) }}×</strong> in {{ N - 1 }} weeks. A constant
  {{ pct1(WEEKLY) }}% weekly growth rate (an exponential curve) fits with R²
  {{ R2.exp.toFixed(2) }}, against {{ R2.lin.toFixed(2) }} for a straight line. The rate has also
  gone up: {{ pct1(G1) }}%/week from February to mid-May, then {{ pct1(G2) }}%/week since.
</p>

<StatTiles :items="stats" />

This page recreates mk7s/exporouter with Holochart, then looks at the same growth from other
angles. Every chart below is a Holochart example that runs live in your
browser and doubles as a visual regression test. The original draws its main chart as an
orbitable 3D scene; Holochart's 3D scenes arrive in [M6](/roadmap), so here it is 2D.

## Weekly tokens

Hover a bar for the week's detail and top models. Click a fit in the legend to hide it, and switch
the y axis to a log scale, where an exponential is a straight line.

<Example id="demos/openrouter/weekly-tokens" bare :height="480" />

<p class="hc-demo-caption">
  If the trend holds, the fit points to <strong>{{ projected }}</strong>/week by
  {{ projectedBy }}. OpenRouter's own forecast for the current week (two days in) is
  {{ fmtT(CURRENT.forecastT) }}, compared with {{ fmtT(expFn(N)) }} from the fit.
</p>

## Is the growth rate holding up?

Rolling 4-week compound growth, per week. A pure exponential would hover around the dashed line;
bars trending above it mean faster than exponential.

<Example id="demos/openrouter/growth-rate" bare :height="300" />

## How this was measured

- Source: the _Top Models_ weekly chart on OpenRouter's rankings page, summed across every model
  (the top 9 plus "Others"), so each bar is total text-model tokens (prompt plus completion) for a
  Monday-start week.
- The fits use the {{ N }} complete weeks, {{ fmtDate(FIRST_WEEK) }} to
  {{ fmtDate(LAST_FULL_WEEK) }}. The week of {{ fmtDate(CURRENT.week) }} only covers 2 days, so
  it's drawn but left out of the fits.
- Exponential fit: least squares on `ln(tokens)` against the week index, giving
  `tokens ≈ A·e^kt`. The linear and quadratic fits use raw tokens. R² is measured in raw token space
  for all three, so they compare fairly.
- AIC penalises the quadratic's extra parameter. It and the exponential come out close, and both
  are far ahead of linear: the curve bends upward. The rolling rate above shows the bend getting
  steeper, not flattening.

### Model comparison

<OpenRouterTables table="fits" />

<details class="hc-details">
<summary>Data table, all weeks</summary>
<OpenRouterTables table="weeks" />
</details>

## Who is growing

The same platform over a full year, by model author. Only each week's top 9 models can be
attributed to an author; the rest of the platform is shown as _other models_ (35–80% of a week's
tokens). Switch to shares to see the leaderboard churn.

<Example id="demos/openrouter/authors-area" bare :height="440" />

### Last week, by author

The latest complete week, in the same author colors. Anthropic, Google and MiniMax had no model in
that week's top 9, so their tokens are part of _other models_.

<div class="hc-demo-narrow">
  <Example id="demos/openrouter/authors-donut" bare :height="360" />
</div>

### Requests grow too, but slower

OpenRouter's market-share chart counts requests rather than tokens, one small chart per author on
its own scale. Gaps are weeks in which an author was not in the top 9.

<Example id="demos/openrouter/requests-by-author" bare :height="400" />

## Bigger requests, not just more of them

Over the year, weekly tokens grew about 24× and weekly requests about 5×, so the average request
grew from about 5,000 to 24,000 tokens (prompt plus completion), in line with agents that re-send
long contexts at every step.

<Example id="demos/openrouter/tokens-per-request" bare :height="300" />

## Models and tasks

Every text model OpenRouter lists, by prompt price and context window. Bubbles are the models that
made a weekly top 9, sized by their tokens in their latest such week; grey dots are the rest of the
catalog. Most of the volume sits on cheap models with 1M-token windows.

<Example id="demos/openrouter/models-bubble" bare :height="480" />

What the tokens are spent on, over the 30 days before Sep 23: agent workflows and coding lead.

<Example id="demos/openrouter/categories" bare :height="440" />

## Beyond OpenRouter

Token volumes that providers have announced, converted to tokens per day. The series measure
different things (all of Google's products, API traffic only, China's national total), so compare
their slopes, not their levels. OpenRouter is the thick red line.

<Example id="demos/openrouter/industry" bare :height="480" />

<IndustrySources />

## Sources

<p class="hc-demo-source">
  OpenRouter data: <a href="https://openrouter.ai/rankings" target="_blank" rel="noopener">openrouter.ai/rankings</a>
  (Top Models, Market Share and task charts) and the public models API, retrieved Sep 23, 2026
  (usage data through Sep 22). It covers traffic routed through OpenRouter only. Industry figures:
  the providers' own posts and earnings materials, or press reports of them, listed above.
  Chart sources: <a href="https://github.com/holochart/holochart/tree/main/examples/demos/openrouter" target="_blank" rel="noopener">examples/demos/openrouter</a>.
</p>
