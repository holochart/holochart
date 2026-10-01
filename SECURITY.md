# Security policy

## Reporting a vulnerability

Please report security problems **privately** through GitHub private vulnerability reporting:
open the repository's **Security** tab and choose **Report a vulnerability**, or go directly to
<https://github.com/holochart/holochart/security/advisories/new>.

Do not open a public issue, discussion, or pull request for a security problem.

A useful report includes:

- the affected package(s) and version, and the build you use (ESM via a bundler, or the
  script-tag IIFE build);
- a minimal figure (`{ data, layout, config }`) or code that reproduces the problem;
- the browser and OS you tested with;
- the impact you expect (for example script execution, navigation to an unexpected URL, or a
  denial of service).

## Supported versions

Holochart is pre-1.0. Only the newest minor release line receives fixes (see the
[versioning policy](docs/release/versioning.md)); a fix ships as a patch release on that line.

| Version             | Supported |
| ------------------- | --------- |
| 0.x, latest minor   | Yes       |
| 0.x, earlier minors | No        |

## What to expect

- **Acknowledgement** within about 3 business days.
- **Initial assessment** (whether we can reproduce it, and how severe it is) within about 7 days.
- **Coordinated disclosure:** we develop the fix privately, release it, and then publish a GitHub
  security advisory. We offer credit in the advisory unless you prefer to stay anonymous. Please
  keep the details private until the advisory is published.

## Scope

Holochart is a client-side library, so most relevant issues concern figures that come from an
untrusted source (user-supplied JSON, data from a third-party API, and so on). In scope, for
example:

- **Rich text in figures.** Titles, labels, annotations, `text`, `hovertext` and `hovertemplate`
  accept Plotly's pseudo-HTML subset (`<b>`, `<i>`, `<br>`, `<span style>`, `<a href>`, ...).
  Holochart parses it into a whitelisted tree and never builds HTML from it: unknown tags stay
  literal text, DOM hover labels are built from text nodes, and only a fixed set of `style`
  properties is applied. A way to get markup or script executed from figure text is a
  vulnerability.
- **Links in text.** `<a href>` keeps only `http:`, `https:`, `mailto:` and relative URLs
  (checked before and after percent-decoding); links open with `noopener`. A bypass of this
  filter (for example a `javascript:` URL that survives it) is a vulnerability.
- **Image sources.** The `image` trace keeps `source` only when it is a data URI.
- **Denial of service** from a small figure that hangs or crashes the page well beyond what its
  size suggests.
- **The IIFE build** (`<script>` tag) and the published packages themselves, for example
  unexpected network requests or globals.

Out of scope:

- `config` and other developer-supplied options are treated as trusted. For example, a custom
  modebar button's `icon.svg` is inserted as markup and its `click` handler runs as code; do not
  build `config` from untrusted input.
- Large figures that are slow or memory-hungry in proportion to their size.
- Problems in third-party dependencies with no demonstrated impact on Holochart (report those
  upstream), and issues in the browser, GPU driver or WebGL implementation.
- The documentation site and examples, unless they affect the published packages.
