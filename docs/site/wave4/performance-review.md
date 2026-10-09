# Wave 4 performance review

The new cookbook and demo directories meet the recorded mobile targets. The gallery directory
does not; performance remains an open launch gate. Both failures are retained, with no samples
removed and no repeated runs until a passing result appeared.

## Measurements

The final production HTML SHA-256 is
`547adf24dc9dc5c6fdf071291bc693b39d85a049627ab154c1cf0b1466925ff5`.
[performance.json](./performance.json) records five cold samples per route (thirty total), using
the same Chromium 153.0.8010.12 / SwiftShader, 390×844, 4× CPU, 150 ms latency and 200,000 bytes/sec
download profile as Wave 3. Each sample uses a new context with cache disabled, waits for actual
hydration and fonts, and freezes metrics before input. No build, test suite or capture job ran
alongside the measurements.

| Route              |  p75 LCP | Maximum CLS | Mobile LCP ≤ 2,500 ms |
| ------------------ | -------: | ----------: | --------------------- |
| Home               | 2,064 ms |  0.00078044 | Pass                  |
| Family directory   | 3,592 ms |  0.00023443 | **Fail**              |
| Complete inventory | 2,300 ms |  0.00027448 | Pass                  |
| Basic family       | 1,560 ms |  0.00027835 | Pass                  |
| Cookbook           | 1,516 ms |  0.00032982 | Pass                  |
| Demos              | 1,384 ms |  0.00084941 | Pass                  |

All thirty catalog samples create zero WebGL contexts or chart canvases. CLS passes its 0.1
budget on all routes. A separate fresh browser with normal software compositing, CPU rate 1
and sixty input-to-two-frame search updates measures **35 ms p95**, below the 100 ms target.
The normal desktop profile is separate from the forced mobile compositor.

[performance-directory-recheck.json](./performance-directory-recheck.json) retains one bounded
diagnostic repeat on the same artifact and profile: five additional directory samples with
**4,012 ms p75 LCP**, also failing. CLS, zero-context and filtering checks still pass; its sixty
desktop updates measure 35.3 ms p95. This repeat does not replace the initial failed report.

## What the comparison can establish

Wave 3's retained measurement records 1,320 ms p75 directory LCP. Current median directory
transfer is 613,340 bytes versus 611,539 before, an increase of 1,801 bytes (about 0.29%);
initial JavaScript is 283,975 versus 282,593 bytes. Cookbook and demo directories use substantially
smaller independent payloads. The small transfer delta alone does not identify the cause of the
timing difference.

Host load was materially different: the initial Wave 4 run started at 29.1 and ended at 24.7
one-minute load average on the ten-core reference machine; the focused repeat rose from 23.8 to
47.3. Wave 3's retained run started at 14.0 and ended at 16.7. Several unchanged catalog routes
also measured slower. Those observations make host contention a plausible contributor, not a
proven explanation or grounds for declaring a pass. The user's existing applications were left
running; no unrelated process was stopped to improve scores.

Before launch, repeat a paired current/baseline measurement under controlled host load, retaining
both raw reports, and profile the directory's load/render work if the miss persists. Until that
distinguishes a site regression from measurement variability, the mobile directory budget remains
unresolved. Functional, accessibility, route and source checks pass independently of this gate.
