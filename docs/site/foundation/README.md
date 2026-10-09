# Wave 1 layout evidence

The twelve screenshots here capture the production site at the same routes and viewports as
the [original baseline](../baseline/). `viewports.json` records measured layout and browser errors.
Regenerate this directory with the [capture command](../README.md); preserve the baseline.

| Measurement                                  | Original baseline           | Wave 1                      |
| -------------------------------------------- | --------------------------- | --------------------------- |
| Complete gallery cards visible at 1440 × 900 | 0                           | 8                           |
| Gallery columns at 1440 / 820 / 390 px       | See baseline screenshots    | 4 / 2 / 1                   |
| Document width at an 820 px viewport         | 921 px on all four surfaces | 820 px on all four surfaces |

Capture covers the homepage, gallery, scatter chart guide and notebook guide at desktop
(1440 × 900), tablet (820 × 1180) and mobile (390 × 844). All captures check titles, visible image
loading, document overflow and uncaught page errors. Human first-use timing, native browser zoom,
full accessibility testing and notebook-host integration remain later-wave work.

The foundation browser suite additionally covers the primary hubs, legacy gallery query/hash
links, family changes, Back/Forward, dialog focus return, modified clicks, navigation to a chart
guide and back, mobile menus, and preview/source split behavior. It also checks 1200 px and
720 px layouts. Same-page gallery history retains the mounted component; queued native dialog
close events cannot erase a newly restored selection.
