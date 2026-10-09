# Canonical notebook learning examples

Fourteen `.py` files contain complete percent-marked notebook cells and explicit sample data. The
samples do not import repository helpers or download datasets. Dependencies and the related
web guide are in `manifest.json`. The Python bridge is still development-checkout-only; follow
`apps/docs/getting-started/installation.md` before running them.

The manifest adds learning goals, tutorial time, prerequisites, synthetic-data provenance and
related guides to the generated notebooks/web cells. Those editorial Markdown cells do not alter
the canonical executable cells. Downloaded notebooks have no stored outputs. Actual notebook-host
screenshots are static website previews, separate from the live widgets.

## Generate and verify

From the repository root, generate notebooks, download copies and matching web cells:

```sh
python3 examples/notebooks/generate.py
python3 examples/notebooks/generate.py --check
```

Generation uses Python's standard library. `.py` files are authoritative; edit those rather
than the `.ipynb`, public copies or generated web cells. Notebooks contain no saved outputs or
private paths. Their metadata names the user-facing `holochart` kernel; verification can select
a separately registered isolated kernel with `--kernel`.

After installing the bridge, Jupyter's kernel tools and the declared sample dependencies into
one environment, execute every notebook from a fresh kernel:

```sh
python examples/notebooks/verify.py --kernel holochart --date 2026-10-09
pnpm exec prettier --write examples/notebooks/manifest.json examples/notebooks/verification.json
python3 examples/notebooks/generate.py
```

The verifier requires `nbclient` and `nbformat` (included by JupyterLab); pandas and NumPy are
needed by the examples that declare them. For an isolated kernel prefix, set `JUPYTER_PATH` to
that prefix's `share/jupyter` directory. It checks exact widget MIME output counts and the
in-notebook replacement/control assertions without saving executed outputs. The recorded
`driverEnvironment` describes the verifier interpreter; choose a kernel registered from that
same interpreter for a matching environment.

The collection and expected widget counts come from `manifest.json` (`expectedWidgetOutputs`).
Add a canonical source and manifest entry before regenerating and verifying a new learning task.

`verification.json` records source SHA-256 hashes and kernel execution evidence. This does not
prove browser-host rendering. Explicit `verification.browserVerified` stays false until the
corresponding notebook is rendered and exercised with a real notebook widget manager; host
versions and scope live in `apps/docs/python/environments.md` and the parent website evidence.
Generation refuses a changed source with a stale browser-verification hash. The kernel verifier
clears that browser claim after source changes; repeat the real-host checks before enabling it.
Gallery variants use the exact initial figures named by `galleryExamples`, not every notebook
that happens to contain the same trace type.

## Exact gallery counterparts

Twenty-four gallery counterparts span comparison, time series, distributions, relationships,
scientific charts and 3D. Their complete single-figure Python sources are generated under
`variants/` and copied to the website. Each source imports the public bridge, includes its data,
displays exactly one widget and closes its previous named widget on repeated execution. A linked
learning notebook can include related figures; the copied gallery source renders only its named
figure. `galleryVariants` records the exact individual source, expected output count, figure
identity, dependency files and verification evidence.

The checked-in `gallery-captures.json` freezes each browser example's initial public figure
argument, with its source/helper hashes. Capture executes only the deterministic example setup
against a recording API; it is **not a browser rendering test**. It preserves seeded values,
turns typed arrays into lists and nonfinite observations into missing values. Python literals in
the canonical learning sources must match those normalized figures exactly.

```sh
node examples/notebooks/capture-gallery.mjs --check
python3 examples/notebooks/identity.py
python3 examples/notebooks/generate.py --check
python3 -m unittest discover -s examples/notebooks -p 'test_*.py'
```

For an intentional browser-data change, rerun the capture without `--check`, update the matching
canonical Python literal, and run `identity.py --refresh`. Refresh clears changed-source claims.
Then generate, verify kernels and repeat actual notebook-host checks before activating the
variant's `verification.browserVerified`. `verify.py` executes all 14 learning notebooks and all
24 individual sources in fresh kernels; its report records both source and semantic figure hashes.
It does not turn kernel execution into browser evidence.

To recheck selected learning notebooks and their individual variants:

```sh
python examples/notebooks/verify.py --kernel holochart --only time-series-gaps data-troubleshooting
```

Unselected sources must still match their recorded kernel evidence; changed sources cannot be
silently skipped. The requirements file pins exercised Python libraries, not the unpublished
bridge, interpreter, operating system or browser. Install the bridge from the matching development
checkout and consult the website's environment matrix for exact host evidence and limits.

## Prepare real notebook-host checks

After installing the built bridge wheel and tested notebook dependencies, register an isolated
kernel and prepare host copies in a directory outside the repository:

```sh
notebook_run_root=$(mktemp -d "${TMPDIR:-/tmp}/holochart-notebooks.XXXXXX")
python -m ipykernel install --prefix "$notebook_run_root/kernel" --name holochart-verify
python3 examples/notebooks/prepare-host-check.py --root "$notebook_run_root" --kernel holochart-verify
export JUPYTER_PATH="$notebook_run_root/kernel/share/jupyter"
```

Preparation writes `inputs.json` and separate `<slug>-lab.ipynb` / `<slug>-notebooks.ipynb` files
under the run directory's `notebooks/`. It preserves canonical executable cells, selects the
verification kernel, clears saved outputs and appends the driver's completion print. The
published notebooks and existing proof metadata remain untouched. Each input records canonical
source SHA, executable-code SHA, expected canvas count and whether it is a learning notebook or
an individual gallery source.

Start local JupyterLab and Notebook servers rooted at that `notebooks/` directory. The host driver
uses `HOLOCHART_NOTEBOOK_ORIGIN`, `HOLOCHART_NOTEBOOK_TOKEN`, `HOLOCHART_NOTEBOOK_KERNEL`,
`HOLOCHART_NOTEBOOK_INPUTS`, `HOLOCHART_NOTEBOOK_OUTPUT` and `HOLOCHART_NOTEBOOK_DATE`.
Pass all keys from `inputs.json` as positional slugs to `notebook-host-check.mjs`, once for each
host. The Python CI workflow contains the complete two-server startup, readiness check, browser
driver invocations, teardown and report upload; it checks all 38 artifacts in each real host.

Fresh kernel checks can also write an isolated report without changing historical metadata:

```sh
python examples/notebooks/verify.py --kernel holochart-verify --output "$notebook_run_root/kernel.json"
```

The Python 3.14 CI job installs the built wheel into a clean venv, runs all 38 fresh kernels,
and exercises actual JupyterLab/Notebook widget managers with Chromium. Older Python matrix
entries exercise bridge/package compatibility. A new CI run uploads its own evidence and does
not automatically replace the checked-in environment claims or screenshots.

The plain HTML quick start separately derives its chart code from
`apps/docs/public/quickstarts/browser.ts` with:

```sh
node apps/docs/scripts/gen-quickstarts.ts
node apps/docs/scripts/gen-quickstarts.ts --check
```
