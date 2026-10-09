# Site performance and accessibility verification

These are browser measurements and automated accessibility checks. They do not replace native
browser zoom or a screen-reader review by a person.

## Repeatable production profile

Run from the repository root after a production build. Keep the user's docs development server
running; serve the built output independently on port 5339. Restart that preview after rebuilding
so its cached file manifest matches the current artifact.

```sh
SITE_BASE_URL=http://127.0.0.1:5339/holochart/ \
SITE_REPORT_PATH=docs/site/wave3/performance.json \
SITE_SAMPLES=5 node docs/site/wave3/measure.mjs
SITE_BASE_URL=http://127.0.0.1:5339/holochart/ node docs/site/wave3/audit.mjs
SITE_LIFECYCLE_REPORT=docs/site/wave3/lifecycle.json \
DOCS_RENDER_SERVER=preview DOCS_PORT=5339 \
pnpm exec playwright test -c apps/docs/scripts/render-check/playwright.config.ts \
wave3.spec.ts --workers=1 --retries=0 --output=/tmp/holochart-wave3-production
```

The mobile profile uses Chromium, a 390 × 844 CSS-pixel viewport, touch/mobile emulation,
4× CPU slowdown, 150 ms simulated network latency, 1.6 Mbit/s download and 750 kbit/s upload.
Each sample gets a fresh context with the cache disabled and service workers blocked. The report
records LCP before interaction, CLS without recent-input shifts, request bytes/counts, JavaScript
and image bytes, and WebGL creation. It refuses a development HTML shell. The script reports
p75 LCP and maximum CLS; targets are 2,500 ms and 0.1 respectively. This is a repeatable laboratory
profile, not a claim about field Core Web Vitals or physical mobile hardware.

Filtering uses the full catalog in a dedicated fresh normal headless Chromium browser, with
an explicit CDP CPU rate of 1 and an unthrottled desktop viewport. Initial navigation settles
network and fonts before typing. The browser's compositor feature status is recorded: on this
host its default GPU compositing is disabled and its normal software compositor is used. It is
not a claim about native GPU rendering. Sixty alternating queries
exercise aliases, common matches, empty results and restoration of the complete inventory.
Latency runs from the input event through two rendering frames; remote automation overhead is
excluded. Thumbnail network fetches are outside this UI-response measurement. The p95 target
is 100 ms. Reference host: Apple M1 Max, 10 CPU cores, 64 GiB memory,
macOS/arm64. Concurrent host load can affect timings; raw samples are retained.

## Frozen Wave 2 comparison

The original SITE-01 evidence consists of screenshots and inventory; it did not record equivalent
production performance timings. The closest repeatable comparison is the frozen Wave 2 build,
measured on 2026-10-09 with Chromium 153.0.8010.12 and three cold samples per route.

| Page               |      p75 LCP | Maximum CLS | Median initial transfer | WebGL contexts |
| ------------------ | -----------: | ----------: | ----------------------: | -------------: |
| Home               |     2,268 ms |     0.00078 |           516,761 bytes |              0 |
| Family directory   |     1,924 ms | **0.14551** |           576,354 bytes |              0 |
| Complete inventory | **3,212 ms** |     0.00027 |           632,106 bytes |              0 |
| Basic family       |     1,236 ms |     0.00028 |           580,454 bytes |              0 |

The original script recorded **382.4 ms filter p95** for the complete 786-entry inventory,
but that desktop phase shared the preceding mobile browser with forced SwiftShader GPU
compositing and no explicit CPU reset. Its normal-desktop profile was not verified, so this
number is **not a comparable normal-compositor desktop baseline**. Equivalent mobile samples remain
valid because their 4× CPU and compositor settings were explicit. Full original samples are in
[wave2-performance-baseline.json](wave2-performance-baseline.json).

The retained Wave 2 archive was restored outside the workspace and its SHA-256 verified against
`dae4a3d426c6dabb97e36166791d5bfe9495871ac6698b97511c11ccdff09f76`. A new desktop-only measurement
uses the same fresh default headless browser, explicit CPU rate 1, viewport and 60 queries as the
final measurement. That comparable baseline is **150.3 ms p95**, maximum 207.3 ms:
[wave2-desktop-baseline.json](wave2-desktop-baseline.json). It records its own historical artifact
hash; its failed 100 ms budget is preserved rather than rewritten. To repeat after restoring the
archive and serving its `dist` under `/holochart/` on an independent port:

```sh
SITE_DESKTOP_ONLY=1 SITE_BASE_URL=http://127.0.0.1:5344/holochart/ \
SITE_REPORT_PATH=docs/site/wave3/wave2-desktop-baseline.json \
node docs/site/wave3/measure.mjs
```

The directory's largest layout shift came from two action links wrapping onto separate lines in
the fallback font and sharing one line after the page font loaded. Mobile actions now reserve
separate rows, and the family jump links use a fixed two-column layout. Inventory rendering now
starts with 48 cards, exposes an explicit show-more control, and continues filtering all entries.
Facet counts share passes instead of repeating a full search for each option. Unset facets also
reuse the main query result, avoiding six identical search/sort computations while typing.
[wave3-performance-intermediate.json](wave3-performance-intermediate.json) preserves the measured
122.7 ms p95 before that final reuse optimization, using the original shared-browser/forced
SwiftShader profile; its artifact hash differs from the final build. The final corrected profile
uses an isolated desktop browser and records its compositor status. The software-compositor
[diagnosis](filter-diagnosis.json) and [CPU trace](filter-software.cpuprofile) retain the observed
frame-scheduling difference; CPU-throttle leakage was investigated but was not confirmed.

## Accessibility and lifecycle coverage

[wave2-axe-baseline.json](wave2-axe-baseline.json) records the original whole-page axe results.
The baseline had zero critical violations. Serious findings were an unfocusable scrollable
homepage code block and VitePress's nested sidebar toggle controls. Catalog layouts also lacked
main landmarks. The source now provides semantic main landmarks, a named focusable starter block,
and an SSR-compatible sidebar override with one interactive control per toggle. Linked headings
retain ordinary links and a separate toggle button. Space/Enter, expanded state and controlled
panel IDs are checked in the browser. A later audit after live chart rendering also found that
VitePress prose-table CSS gave the renderer's clipped screen-reader tables a scroll region.
A scoped rule restores native table display and visible overflow inside the already clipped
mirror. Captions, rows, data and the renderer's visually hidden wrapper remain intact; visible
virtualized tables are unaffected. Both audit runners wait for those native tables before axe.
They also fail unsupported-ARIA-label checks that axe classifies as incomplete: named preview and
notebook-link groups have valid roles, and source scroll areas retain named tabpanels without
redundant labels on generic `pre` elements. Contrast ambiguity for horizontally clipped code or
short punctuation remains a human review item.

The standalone audit waits for document load, fonts, mounted catalog state and, for live examples,
the actual chart/source content and attached native data tables with a 30-second deadline. It does not wait for network idle on
live templates: Troika's persistent blob worker can remain an in-flight script after a chart is
ready. Failed HTTP assets and console/page errors still fail the audit. Performance measurements
on the four static catalogs retain network-idle settling, without live workers.

The Wave 3 spec checks twelve representative templates with axe-core 4.13.0 (WCAG A/AA plus best
practices), keyboard toggles, result announcements, show-more/reset behavior, visible focus,
reduced motion, 390 px touch targets and 720 px reflow. Inline prose links retain the WCAG inline
text exception; discrete actions and controls are checked for 44 px height on mobile.

Static catalogs must create zero WebGL contexts. Sixteen deliberate preview cycles must create
and release sixteen chart contexts, with a maximum of one chart context plus one shared font
rasterizer context. The detached Troika/webgl-sdf-generator context is a persistent, bounded
cache; its count must not grow across previews. Real context-loss events and `isContextLost()`
are observed through weak references without altering disposal APIs. WebGL-disabled detail, chart-guide and JavaScript/HTML quick-start embeds must retain static
images, source downloads and recovery help. Production checks with JavaScript disabled verify
all twelve representative templates retain meaningful headings, thumbnails, download links and
an ordinary-link navigation fallback. Sources and live
chart code remain lazy; catalog thumbnails reserve their dimensions.

Automated checks cannot establish the contrast of pixels inside a chart canvas, actual speech
output, operating-system assistive technology behavior, physical touch ergonomics, or native
browser zoom. Those remain explicit human review items.

## Final production evidence

The final production artifact has home HTML SHA-256
`b687f6b1bca48b0241b1353b5fde9739ca35b7a5406c11d3e7f564369ad157ad`.
The following reports retain their own artifact hashes and raw results:

- [browser-checks.json](browser-checks.json): 19 passed, no retries, skips or flakes. Includes
  supported ARIA labels, actual rendered native tables, keyboard behavior, facet exclusion,
  no-JavaScript and WebGL-unavailable recovery.
- [accessibility.json](accessibility.json): 24 whole-page template/viewports at 1440 and 390 px,
  zero violations and zero unsupported-ARIA incomplete findings. Eleven color-contrast incomplete
  rule states contain 141 node snapshots: horizontally clipped code, short punctuation and one
  code overlap. These are explicitly retained for human contrast review.
- [lifecycle.json](lifecycle.json): sixteen chart contexts created and disposed, zero active chart
  contexts after closing, one bounded shared font context and a maximum of two total contexts.
- [integration-checks.json](integration-checks.json): final 21 foundation, gallery and content
  checks passed against this artifact. [broad-render-checks.json](broad-render-checks.json) preserves
  the earlier 81-check run, including 49 chart pages and 13 gallery pages, with its original hash.
  Chart rendering code and content are unchanged; later fixes affect native-table CSS, supported ARIA
  labels and repeated facet filtering.
- [viewports.json](viewports.json): 30 final desktop, tablet and mobile captures with zero page
  overflow or browser errors; screenshots sit beside this report.
- [route-continuity.json](route-continuity.json): all 4,746 previous routes and 374 chart anchors
  preserved. Notebook and canonical source checks are recorded in the integration report and
  [notebooks/](notebooks/).

## Final measured budgets

[performance.json](performance.json) records five cold mobile samples per page (20 total),
followed by 60 desktop queries in an isolated browser. All configured budgets passed.

| Page               | p75 mobile LCP | Maximum CLS | Median initial transfer | Initial JavaScript |
| ------------------ | -------------: | ----------: | ----------------------: | -----------------: |
| Home               |         924 ms |   0.0005721 |           541,305 bytes |      187,109 bytes |
| Family directory   |       1,320 ms |   0.0002344 |           611,539 bytes |      282,593 bytes |
| Complete inventory |       1,536 ms |   0.0002745 |           620,206 bytes |      278,592 bytes |
| Basic family       |       1,336 ms |   0.0002783 |           605,150 bytes |      282,439 bytes |

Every cold catalog sample created **zero WebGL contexts**. The mobile targets are LCP ≤2,500 ms
and CLS ≤0.1. Transfer counts include initial HTML, scripts, styles, fonts and images from the
local production preview; raw request and image-byte totals are retained in each sample.

The complete 786-entry inventory has **34.2 ms filter p95**, maximum 34.3 ms, against the 100 ms
budget. Compared with the restored Wave 2 desktop p95 of 150.3 ms, p95 fell by about 77%.
Both use the same reference host, viewport, default headless compositor, explicit CPU rate 1 and
60-query workload. [wave3-performance-forced-compositor.json](wave3-performance-forced-compositor.json)
preserves the earlier final-artifact result with forced emulated GPU compositing (116.7 ms p95).
That diagnostic profile is distinct from the normal-compositor budget measurement. Host load
averages and all raw samples remain in the reports; these are lab results, not field guarantees.
