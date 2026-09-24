# Data sources

All data was retrieved on 2026-09-23 (US time; OpenRouter's cache stamps read 2026-09-24 ~03:50 UTC) with plain public
GET requests. No logins, API keys or cookies were used. Raw downloads are kept outside the repo; only the derived JSON
files are committed here.

## OpenRouter

OpenRouter publishes these numbers on <https://openrouter.ai/rankings>. The server-rendered HTML of that page does
**not** contain the chart series. It has only skeleton SVGs and the leaderboard tables. The charts load their data in
the browser from OpenRouter's public, unauthenticated frontend endpoints. The URLs below are the ones the page itself
calls. These endpoints are undocumented, so their format may change.

| URL                                                                               | Used for                                                                                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://openrouter.ai/api/frontend/v1/rankings/model-rankings-chart`             | `weekly-models.json`, `authors.json` (tokens), the `weeklyTokensT` join in `models.json`, and the 30-day total used in `categories.json`     |
| `https://openrouter.ai/api/frontend/v1/rankings/modality-chart?routeSegment=text` | `authors.json` → `requestShare` (`marketShareData`)                                                                                          |
| `https://openrouter.ai/api/frontend/v1/rankings/task-spend`                       | `categories.json` (the `tokens` view)                                                                                                        |
| `https://openrouter.ai/api/frontend/v1/rankings/apps`                             | `apps.json` (the `week` view)                                                                                                                |
| `https://openrouter.ai/api/v1/models`                                             | `models.json`, plus the id and name mapping in `weekly-models.json`                                                                          |
| `https://openrouter.ai/rankings` (HTML)                                           | Section structure, the author market-share text table (used to cross-check `requestShare`), and task display names from the page's JS bundle |

### weekly-models.json

- Each chart row is `{x: 'YYYY-MM-DD' (Monday, UTC), ys: {permaslug: tokens}}`. A row holds the top 9 models of that
  week plus `Others`. `tokensT` is the sum of all `ys` divided by 1e12, rounded to 3 decimals, so it is the
  whole-platform weekly total.
- The chart covers 53 weeks, from 2025-09-22 to 2026-09-21. The first week is marked `truncated`, because the chart
  is a trailing one-year window that starts mid-week. The last week is marked `partial`.
- `forecastT` reproduces the page's forecast bar. The code comes from the page's JS bundle. It works out how much of
  the week has elapsed at `cachedAt`, weighting each weekday by OpenRouter's constants
  `[.1431, .1483, .1525, .1515, .1484, .1257, .1305]` (Mon..Sun) plus a fraction of the current day by UTC hour. It
  then extrapolates the partial total. Unless the partial week already exceeds the previous week, the extra amount is
  capped at 1.1× the previous week.
- Model ids: the chart uses dated "permaslugs" such as `anthropic/claude-4.5-sonnet-20250929`. Each one is joined to
  `canonical_slug` in `/api/v1/models` and replaced with that model's public `id` (here `anthropic/claude-sonnet-4.5`).
  A `:free` suffix is kept. Retired or stealth models that are not in the models API keep their permaslug without the
  date suffix. The raw permaslug is kept on every entry, and `modelNames` maps each id to a display name.
- **Check against `exporouter.json`:** all 34 weeks, 2026-02-02 to 2026-09-21, are present. The 33 complete weeks
  match to 0.001T. The only difference is the partial week 2026-09-21: exporouter has 50.525T (forecast 139.845T),
  while this file has 64.225T (forecast 138.764T), because the live week kept accumulating between the two snapshots.
  exporouter's ids are the permaslugs with the date removed, so some differ from the ids used here.

### authors.json

- `weeks[].tokensT`: tokens from `weekly-models.json`, grouped by the id prefix before `/`. The top 8 authors by
  53-week total are kept. Everything else goes into `others`: the chart's `Others` series plus authors outside the
  top 8. Only a week's top 9 models are attributed, so `others` is large (roughly 35–45%). `openrouter` means
  OpenRouter's cloaked or stealth models.
- `requestShare`: OpenRouter's own "Market Share" chart. It is measured by **requests**, not tokens, and every request
  is attributed to an author. Weekly request counts are divided by 1e9. The top 8 authors by 52-week total are kept,
  and the rest are summed into `others`. The week of 2026-09-14 matches the page's text table: deepseek 25.4%,
  google 18.6%, openai 17.0%.

### models.json

- Only models whose `output_modalities` is exactly `["text"]` are included. `promptPerM` and `completionPerM` are
  the API's USD-per-token prices × 1e6. `created` is the Unix `created` time as a UTC date.
- Excluded: `:free` variants (20), `:batch` variants (72), zero-priced models (`stealth/space-bunny-alpha`,
  `openrouter/free`), variable-priced routers with a price of -1 (`openrouter/fusion`, `openrouter/pareto-code`,
  `openrouter/bodybuilder`), and 15 models that output images or audio.
- `weeklyTokensT` / `weeklyTokensWeek`: the model's tokens in the most recent complete week in which it appeared in
  the Top Models chart. `weeklyFreeTokensT` gives the same for its `:free` variant. Models that were never in a
  weekly top 9 have neither field.

### categories.json

- The `tokens` view of `task-spend` gives each task's **share** of tokens over a trailing 30-day window.
  `share` holds these values unchanged, and they sum to 1. Task display names come from the page's JS bundle.
- `tokensT` is an **estimate**: `share` × (the sum of the 4 complete weeks starting 2026-08-24..2026-09-14 × 30/28).
  The multiplier is written in the file's `note`.

### apps.json

- The `week` view of `/rankings/apps` gives a trailing 7-day window ending at the most recent complete day, so it is
  not a Monday week. OpenRouter lists 20 public apps. Some ranks are missing, and the file keeps OpenRouter's ranks
  as given. `total_tokens` is divided by 1e12 and `total_requests` by 1e6.

### Licensing / attribution

OpenRouter's rankings data is displayed publicly on openrouter.ai. It measures traffic routed through OpenRouter only,
not the whole market. Attribute it as "Source: OpenRouter (openrouter.ai/rankings)". We found no explicit open-data
licence, so use it for this demo with attribution and do not redistribute it as a dataset. App names and URLs are
OpenRouter's public listings.

## Industry token volume (industry.json)

These figures were collected with web search and page fetches on 2026-09-23. Every value appears on the page cited
beside it; nothing was estimated. Where a company's own page could not be fetched (HTTP 403), the figure is cited
from a reputable news report of that page.

- Each series keeps its provider's own unit.
- `perDayT` converts each value to trillion tokens per day: a month is 30.4375 days, a week is 7 days, and
  billion/min × 1440 / 1000 gives trillion/day.
- Any other conversion, such as a period total turned into a monthly average, is marked "CONVERTED" in the point's
  `note`.
- Microsoft's FY24 values were back-calculated from its "5X" and "7X" growth claims, so they are left out.
- Also left out: a prediction-market page (octagonai.co) and a secondary report of "90T+/week in mid-2026"
  (cryptobriefing), because both are low-confidence.
- Scopes differ. Google's total covers all its products; the API series are narrower; China's series is a national
  total. Compare growth rates, not absolute levels. Figures are "over" or "about" values as announced.

- **Google (all products)** (trillion tokens per month, 5 points): <https://blog.google/innovation-and-ai/sundar-pichai-io-2026/>, <https://blog.google/company-news/inside-google/message-ceo/alphabet-earnings-q2-2025/>, <https://blog.google/innovation-and-ai/infrastructure-and-cloud/google-cloud/gemini-enterprise-sundar-pichai/>
- **Google (customer API)** (billion tokens per minute, 5 points): <https://blog.google/company-news/inside-google/message-ceo/alphabet-earnings-q3-2025/>, <https://blog.google/company-news/inside-google/message-ceo/alphabet-earnings-q4-2025/>, <https://blog.google/innovation-and-ai/infrastructure-and-cloud/google-cloud/cloud-next-2026-sundar-pichai/>, <https://blog.google/innovation-and-ai/sundar-pichai-io-2026/>, <https://blog.google/company-news/inside-google/message-ceo/alphabet-earnings-q2-2026/>
- **OpenAI (API)** (billion tokens per minute, 2 points): <https://techcrunch.com/2025/10/06/sam-altman-says-chatgpt-has-hit-800m-weekly-active-users/>, <https://www.constellationr.com/insights/news/openai-raises-122-billion-touts-2-billion-revenue-month>
- **Microsoft (Azure AI Foundry)** (trillion tokens per month, 3 points): <https://www.microsoft.com/en-us/investor/events/fy-2025/earnings-fy-2025-q4>, <https://www.microsoft.com/en-us/investor/events/fy-2025/earnings-fy-2025-q3>
- **OpenRouter (platform)** (trillion tokens per week, 7 points): <https://cryptobriefing.com/openrouter-9000x-token-usage-growth/>, <https://the-decoder.com/openrouters-staggering-token-chart-is-the-ai-bubble-debate-in-a-single-image/>, <https://a16z.com/state-of-ai/>, <https://siliconangle.com/2026/05/26/openrouter-raises-113m-bring-order-enterprise-ai-inference-routing/>, <https://techcrunch.com/2026/05/26/openrouter-more-than-doubles-valuation-to-1-3b-in-a-year/>
- **ByteDance (Doubao / Volcano Engine)** (trillion tokens per day, 8 points): <https://www.caixinglobal.com/2024-05-16/bytedance-enters-ai-arena-with-doubao-offering-ultra-low-cost-and-versatile-applications-102196732.html>, <https://www.silicon.co.uk/e-innovation/artificial-intelligence/doubao-bytedance-ai-628108>, <https://finance.yahoo.com/news/bytedances-doubao-doubles-token-6-093000023.html>, <https://en.tmtpost.com/post/7645516>, <https://news.aibase.com/news/23814>, <https://global.chinadaily.com.cn/a/202604/02/WS69ce3326a310d6866eb41733.html>, <https://finance.biggo.com/news/f7f43ea9-735a-4fe2-81b7-ca5758ef3dad>
- **China (national total)** (trillion tokens per day, 6 points): <https://www.ecns.cn/cns-wire/2026-03-24/detail-ihfaytev9463369.shtml>, <https://www.globaltimes.cn/page/202604/1360106.shtml>, <https://technode.com/2025/08/19/china-reports-surge-in-token-consumption-as-ai-applications-expand/>, <https://technode.com/2026/08/28/chinas-daily-ai-token-usage-tops-500-trillion-as-compute-demand-grows/>
- **Fireworks AI** (trillion tokens per day, 3 points): <https://fireworks.ai/blog/series-c>, <https://io-fund.com/ai-stocks/ai-token-demand-shattering-forecasts>, <https://fireworks.ai/blog/series-d-announcement>

Company figures come from their own blogs, earnings materials and press coverage. Only short numeric facts are used,
with the source attributed. No article text is reproduced.
