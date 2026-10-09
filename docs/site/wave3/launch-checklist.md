# Redesign release checklist

The working tree implements Waves 1–3 on `codex`. This checklist distinguishes local verification
from a deployed release. No package publication or website deployment has been performed.

## Local review

- [x] Keep existing example IDs, guide URLs and `#example-…` anchors. Compare the built output
      with [the previous route map](./wave2-routes.json) using `node docs/site/wave3/check-routes.mjs`.
- [x] Show the actual source-install requirement beside browser and Python onboarding. Do not
      advertise `pip install holochart-py` or registry installation until publication is verified.
- [x] Ship 14 clean notebooks and 24 exact Python gallery sources across six supported families.
      Both real notebook hosts have [source-matched rendering evidence](./notebooks/README.md).
- [x] Keep generated reference pages, language-aware source downloads and static previews
      under the configured base. Production checks exercise downloads and canonical tags.
- [x] Publish [the launch coverage matrix](./chart-coverage.md): 47 guides, 15 featured guides
      with five or more distinct variations, and three reviewed beginner tasks per family.
- [x] Review the final [production measurements and accessibility results](./README.md) and
      [30 viewport captures](./viewports.json). Automated budgets pass; human contrast, speech and
      native zoom review remains pending below.
- [ ] Run five observed first-use sessions and resolve the highest-friction steps.
- [ ] Complete human screen-reader and native 200% browser-zoom checks.

## First-use sessions

Recruit five people spanning Python/Jupyter and JavaScript users. Time prerequisite installation
separately. Give each person an analytical task such as comparing groups, plotting a trend with
gaps, or examining a distribution. Observe without directing navigation.

Record their chosen environment, prerequisite/build time, time to locate a suitable example,
time to render its starter after setup, first obstacle, recovery path and final output. The target
is four of five people finding the example within 30 seconds and rendering within five minutes
after prerequisites are installed. Automated tests are not substitutes for these sessions.

| Participant | Environment | Setup time | Find example | Render after setup | Obstacle and resolution | Result       |
| ----------- | ----------- | ---------- | ------------ | ------------------ | ----------------------- | ------------ |
| 1           | Pending     | —          | —            | —                  | —                       | Not observed |
| 2           | Pending     | —          | —            | —                  | —                       | Not observed |
| 3           | Pending     | —          | —            | —                  | —                       | Not observed |
| 4           | Pending     | —          | —            | —                  | —                       | Not observed |
| 5           | Pending     | —          | —            | —                  | —                       | Not observed |

## Editorial responsibility

These responsibilities attach to repository maintenance roles. A reviewer accepting a change
owns the corresponding compatibility or content claim; no individual assignment is invented.

| Area                                     | Responsible role          | Required review evidence                                                                |
| ---------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| Python compatibility and host support    | Python bridge maintainer  | Source identity, fresh kernels, actual widget-manager output, exact tested versions     |
| Featured examples and guide variations   | Chart/examples maintainer | Complete independent source, meaningful task, verified output, data provenance          |
| Families, subtypes and beginner ordering | Documentation maintainer  | Explicit taxonomy IDs, stable routes, coverage matrix, reviewed learning level          |
| Install instructions and release state   | Release maintainer        | Actual available artifact/revision, correct package names, clean source setup           |
| Layout, navigation and accessibility     | Site maintainer           | Production viewports, keyboard behavior, accessibility audit, lifecycle and performance |

Contributor procedures live in `apps/docs/README.md` and `examples/notebooks/README.md`.
Changing canonical source invalidates its verification: regenerate, execute and render the new
artifact before restoring a tested badge. Keep kernel, browser and hosting evidence separate.

## Deployment and rollback

The previous **local** Wave 2 production output is retained at
`apps/docs/.vitepress/rollback/wave2-2026-10-09.tar.gz` (ignored by Git), SHA-256
`dae4a3d426c6dabb97e36166791d5bfe9495871ac6698b97511c11ccdff09f76`.
The archive contains the complete `dist/` directory; extract into a temporary directory to review
or recover it. [The frozen map](./wave2-routes.json) records its HTML paths and chart anchors.
This local artifact is not a snapshot of a deployed Cloudflare release.

Before publishing, the release maintainer must retain the actual current deploy identifier and
artifact through the existing hosting workflow. Deploy only after the remaining review gates
are met and publishing is authorized. After deployment:

- [ ] Check the real `/holochart/` URL, clean detail URLs, query filters and legacy gallery hashes.
- [ ] Fetch notebook/Python/browser downloads and thumbnails from the hosting domain.
- [ ] Verify configured headers, caching, MIME types, redirects, 404 behavior and canonical URLs.
- [ ] Confirm a notebook can use the documented install artifact; recheck registry availability.
- [ ] Record the deployed revision/identifier and rollback procedure for that exact deployment.

Hosting behavior and package publication remain unverified until these checks are actually run.

Restart the production preview after each rebuild. Its static-file index is captured at startup;
serving a replaced `dist/` from the old preview process can mix cached HTML with new hashed assets.
Verification scripts reject missing same-origin assets and unhydrated catalog pages rather than
counting that broken snapshot as successful performance or accessibility evidence.
