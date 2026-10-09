# SITE-26 environment evaluation — 2026-10-09

The public [environment guide](../../../apps/docs/python/environments.md) now evaluates local
Jupyter, VS Code, Colab and Binder separately. No hosted launcher was added. Colab and Binder
have **no actual remote run, startup measurement, or host-specific compatibility proof**.
VS Code remains unverified after a bounded local attempt. These statuses describe evidence and
artifact gates; they do not declare the hosts incompatible.

## Evidence and availability

The existing [Wave 3 host proof](../wave3/notebooks/README.md) remains unchanged: 14 learning
notebooks plus 24 exact gallery sources pass in both JupyterLab 4.6.4 and Notebook 7.6.3,
with their actual widget managers, exact source/code hashes, expected output counts and control
updates. Those 76 checks establish the durable local fallback, not remote support.

The inspected [release state](../../../apps/docs/.vitepress/release-state.ts) independently marks
npm and PyPI unpublished. Python's public source reference is `null`; a developer checkout must
contain `packages/holochart-py`. The earlier [source install verification](../install-verification.md)
records the public-main check. A repository URL alone cannot supply these local notebook/bridge
changes to a remote host. Nothing was pushed or published during this evaluation.

The [Python widget](../../../packages/holochart-py/src/holochart/widget.py) loads its bundled ESM,
and the [frontend](../../../packages/holochart-py/frontend/widget.js) mounts/updates charts in the
output DOM. Therefore client frontend WebGL2 is required independently of server Python GPU
selection. This is an implementation-based inference, not a hosted GPU benchmark. The examples
use deterministic data in their cells and need no remote datasets, Drive credentials or API keys.

## Independent host evaluation

| Host                 | Manager / graphics                                                                                                        | Artifact and data path                                                                                                   | Startup / actual test                                                                                | Remaining gate                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Local Lab / Notebook | Actual chart rendering and controls verified; browser WebGL2 exercised.                                                   | Development wheel, exact tested pins and all local sample data.                                                          | Existing 76 real-host checks; startup duration not benchmarked.                                      | Existing development checkout prerequisite remains.                                          |
| VS Code desktop      | Jupyter/Python extensions provide a candidate manager/kernel path; editor WebGL2 not observed.                            | Download notebook; choose local kernel with built wheel. Data stays local.                                               | Inspected installed versions and attempted isolated frontend; no chart proof or startup measurement. | Observable editor run, expected charts and control/rerun checks.                             |
| Google Colab         | Official custom widget setup exists; exact bridge/anywidget/frontend unverified. Browser GPU capability remains separate. | Upload notebook plus separately supplied built wheel until a public artifact exists. Included data needs no Drive mount. | Documentation evaluation only; no session or account used.                                           | Hash-addressed artifact, host-compatible setup, repeated actual output/update tests.         |
| Binder               | Pinned Jupyter/anywidget image is plausible; browser graphics and manager are unverified in that image.                   | Public immutable notebook revision and wheel/build inputs required; local samples avoid credentials.                     | Documentation evaluation only; no image build/launch. Cold/warm times unknown.                       | Public inputs, successful image build, repeated real launch and measured startup conditions. |

Primary source basis, checked on the evaluation date:

- [VS Code notebooks](https://code.visualstudio.com/docs/datascience/jupyter-notebooks): selected
  kernels, Python/Jupyter extensions, and Restricted Mode execution/rich-output constraints.
- [Microsoft widget architecture](https://github.com/microsoft/vscode-jupyter/wiki/Component:-IPyWidgets):
  kernel/frontend message plumbing and script loading. This wiki is older architectural guidance;
  it does not prove the inspected editor version renders Holochart.
- [Colab custom widget implementation](https://github.com/googlecolab/colabtools/blob/main/google/colab/output/_widgets.py):
  the supported custom-manager entry point. Generic manager availability does not establish this
  bridge's support. [Colab FAQ](https://research.google.com/colaboratory/faq.html) describes runtime
  lifecycle, notebook upload and the separation between shared notebook content and VM libraries.
- [Binder setup](https://mybinder.readthedocs.io/en/latest/introduction.html): public repository plus
  environment configuration. [Binder usage guidance](https://mybinder.readthedocs.io/en/latest/about/user-guidelines.html#performance-and-speed)
  separates image build, pull and session start, and explains temporary sessions. These are service
  properties, not measured Holochart startup times.

## Bounded editor attempt

The machine already had VS Code **1.140.0**, commit
`07f806f999227108933c2e30515b26eecc1fda74`, arm64; Python extension **2026.8.0**,
Jupyter extension **2025.9.1** and renderer **1.3.0**. Versions were read from the installed
official app CLI and extension metadata. They are inspected versions, not a compatibility claim.

The attempt copied the generated `first-chart.ipynb` into a temporary test workspace, removed
execution counts/outputs, and selected a generic Python kernelspec. A separate user-data and
extensions directory used symlinks to existing Microsoft extensions and the existing wheel-installed
Python 3.14.8 environment. No extension, app, infrastructure or account was installed/created.
The user's existing workspace and settings were not edited.

The copied public notebook contained six code cells; its pre-copy file SHA-256 was
`d0b1753619183563b232066fdf00344f9301835ad1f68086056cc9737bd3816f`.
This identifies the attempted input, not an execution result.

The first temporary profile path exceeded macOS's Unix socket path limit. VS Code emitted
`listen EINVAL: invalid argument` for its main socket. Moving the test profile to a shorter
temporary path allowed the isolated editor process to launch. Native UI automation still resolved
the pre-existing Welcome process/window; it could not observe or control the isolated notebook.
The attempt stopped before notebook execution. No widget output, WebGL capability, chart update,
startup duration or screenshot was claimed. Only the created test process was terminated, and its
temporary workspace/profile/symlinks were removed. A manual kernel/render checklist remains in
the public guide for a future observable run.

## Setup and launcher gates

The [verified requirements](../../../examples/notebooks/requirements-verified.txt) pin the local
tested Python libraries, including Jupyter host applications. They are not a transitive lock or
a tested Colab managed-runtime replacement. Keep the bridge installation separate from that file.
Colab needs a host-compatible setup; Binder needs an immutable image recipe with a bridge wheel
or all documented source build prerequisites. Neither candidate setup is advertised as runnable.

A future launcher must identify its notebook revision, wheel/version/hash and setup; record the
actual runtime, manager and browser; show the expected charts after a fresh run; exercise controls
and same-kernel rerun cleanup; repeat the run; and record cold/warm startup conditions separately.
Only then can it receive a launcher button naming that verified host. Registry publication and a
public notebook revision are external prerequisites, not implied by the local verification.

| SITE-26 item                                                                          | Result                                                                                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Evaluate Colab, Binder and editor setup independently across the requested dimensions | Complete: evidence, candidate setup and explicit unknowns recorded above and in the public guide.               |
| Add buttons only after repeatable successful runs with pinned setup                   | Gate enforced: no buttons added; remote runs/artifacts remain pending.                                          |
| Preserve downloads and local instructions                                             | Complete: existing 14 downloads, source setup, tested pins and troubleshooting remain linked.                   |
| Every displayed launcher opens and renders its intended notebook                      | No launchers displayed. Actual hosted-launcher acceptance remains pending external artifact/verification gates. |

## Documentation validation

`pnpm exec prettier --check apps/docs/python/environments.md docs/site/wave4/environments.md`
passes. `pnpm --filter @mk7s/holochart-docs lint:pages` reports 177 pages, zero errors and zero
warnings. ESLint has no Markdown configuration and ignores these two files; it is not counted as
Markdown validation. The parent task owns the integrated production build.
