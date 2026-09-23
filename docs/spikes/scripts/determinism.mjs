// Spike E (plan E0.7, ADR-018, risk R4): pixel-diff stability of the visual-test examples under
// Chromium + SwiftShader (the CI config) vs Chromium + ANGLE/Metal (hardware GPU).
//
// Usage (from the repo root, with the sandbox dev server already running on --port):
//   pnpm --filter @mk7s/holochart-sandbox exec vite --port 5197 --strictPort --host 127.0.0.1 &
//   node docs/spikes/scripts/determinism.mjs --port 5197 --runs 5 --out /tmp/spike-e
//
// Options: --port (5197), --runs (5), --out (required: PNGs + results.json go here),
//          --backends swiftshader,metal, --concurrency (2).
//
// Each render opens a fresh browser context + page at `/?example=<id>&test=1`, awaits
// `window.__exampleReady`, and screenshots `#example-root` exactly like tests/visual/visual.spec.ts.
// Comparison reuses tests/visual/compare.ts (Node >= 23 strips its types on import).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import pngjs from 'pngjs';
import { comparePng, DEFAULT_TOLERANCE } from '../../../tests/visual/compare.ts';

const { PNG } = pngjs;

const ROOT = path.resolve(import.meta.dirname, '../../..');
const BASELINES_DIR = path.join(ROOT, 'tests/visual/__baselines__');
const CONTAINER_ID = 'example-root'; // apps/sandbox/src/test-protocol.ts TEST_CONTAINER_ID
const BOOT_TIMEOUT_MS = 30_000;

/** Non-GL flags shared with playwright.config.ts. */
const COMMON_ARGS = [
  '--ignore-gpu-blocklist',
  '--force-color-profile=srgb',
  '--disable-lcd-text',
  '--font-render-hinting=none',
  '--hide-scrollbars',
];
const BACKENDS = {
  // Exactly playwright.config.ts CHROMIUM_ARGS.
  swiftshader: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  metal: ['--use-gl=angle', '--use-angle=metal'],
};
/** playwright.config.ts `use` options. */
const CONTEXT_OPTIONS = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
};

const { values: opts } = parseArgs({
  options: {
    port: { type: 'string', default: '5197' },
    runs: { type: 'string', default: '5' },
    out: { type: 'string' },
    backends: { type: 'string', default: 'swiftshader,metal' },
    concurrency: { type: 'string', default: '2' },
  },
});
if (!opts.out) throw new Error('--out <dir> is required');
const OUT = path.resolve(opts.out);
const BASE_URL = `http://127.0.0.1:${opts.port}`;
const RUNS = Number(opts.runs);
const CONCURRENCY = Number(opts.concurrency);
const backendNames = opts.backends.split(',');

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const writeFile = (file, data) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
};
const pngPath = (backend, id, run) => path.join(OUT, backend, `${id}.run${run}.png`);

async function withPage(browser, fn) {
  const context = await browser.newContext(CONTEXT_OPTIONS);
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

async function rendererInfo(browser) {
  return withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/?test=1`);
    return page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return { renderer: 'no webgl2', vendor: '' };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        vendor: gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
      };
    });
  });
}

async function exampleIds(browser) {
  return withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/?test=1`);
    await page.waitForFunction(() => Array.isArray(window.__exampleIds), undefined, {
      timeout: BOOT_TIMEOUT_MS,
    });
    return page.evaluate(() => [...window.__exampleIds].sort((a, b) => a.localeCompare(b)));
  });
}

/** One render in a fresh context. Returns meta/skipped, the PNG, and timings (ms). */
async function renderOnce(browser, id) {
  return withPage(browser, async (page) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const url = `${BASE_URL}/?example=${encodeURIComponent(id)}&test=1`;
    for (let attempt = 1; ; attempt++) {
      const t0 = performance.now();
      await page.goto(url, { waitUntil: 'load' });
      try {
        await page.waitForFunction(() => window.__exampleReady !== undefined, undefined, {
          timeout: BOOT_TIMEOUT_MS,
        });
        const result = await page.evaluate(() => window.__exampleReady);
        const readyMs = performance.now() - t0;
        if (result.skipped) return { result, readyMs, errors };
        const t1 = performance.now();
        const png = await page.locator(`#${CONTAINER_ID}`).screenshot({ scale: 'css' });
        return { result, png, readyMs, shotMs: performance.now() - t1, errors };
      } catch (error) {
        const reloaded = /Execution context was destroyed|navigation/i.test(String(error));
        if (!reloaded || attempt >= 2) throw error;
      }
    }
  });
}

/** Runs `tasks` with at most CONCURRENCY in flight. */
async function pool(tasks) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

const summarize = (r) => ({ diffPixels: r.diffPixels, ratio: r.ratio, pass: r.pass });

/**
 * Strict comparison that compare.ts hides: pixels whose RGBA differs at all (pixelmatch uses a
 * 0.1 YIQ threshold and ignores anti-aliased pixels), and the largest channel delta.
 */
function exactDiff(pngA, pngB) {
  const a = PNG.sync.read(pngA);
  const b = PNG.sync.read(pngB);
  if (a.width !== b.width || a.height !== b.height) return { pixels: -1, maxDelta: 255 };
  let pixels = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a.data[i + c] - b.data[i + c]));
    if (d) pixels++;
    maxDelta = Math.max(maxDelta, d);
  }
  return { pixels, maxDelta };
}
const maxExact = (rs) =>
  rs.reduce((m, r) => ({
    pixels: Math.max(m.pixels, r.pixels),
    maxDelta: Math.max(m.maxDelta, r.maxDelta),
  }));
const maxBy = (rs) => rs.reduce((a, b) => (b.diffPixels > a.diffPixels ? b : a));

async function runBackend(name, ids) {
  const browser = await chromium.launch({
    headless: true,
    args: [...BACKENDS[name], ...COMMON_ARGS],
  });
  try {
    const gl = await rendererInfo(browser);
    console.log(`[${name}] ${gl.vendor} | ${gl.renderer} | ${browser.version()}`);
    // Warm-up: one untimed load per example (Vite transforms/dep optimization), also reads meta.
    // A failing example (e.g. one being edited concurrently) is recorded and skipped.
    const warm = await pool(
      ids.map((id) => () => renderOnce(browser, id).catch((e) => ({ error: String(e) }))),
    );
    const examples = {};
    ids.forEach((id, i) => {
      const w = warm[i];
      examples[id] = w.error
        ? { skipped: true, error: w.error, runs: [] }
        : { meta: w.result.meta, skipped: w.result.skipped, runs: [] };
    });
    const active = ids.filter((id) => !examples[id].skipped);
    const tasks = [];
    for (let run = 1; run <= RUNS; run++) {
      for (const id of active) {
        tasks.push(async () => {
          const r = await renderOnce(browser, id);
          writeFile(pngPath(name, id, run), r.png);
          examples[id].runs[run - 1] = { readyMs: r.readyMs, shotMs: r.shotMs, errors: r.errors };
        });
      }
    }
    await pool(tasks);
    return { gl, chromium: browser.version(), examples };
  } finally {
    await browser.close();
  }
}

const results = { runs: RUNS, baseUrl: BASE_URL, commonArgs: COMMON_ARGS, backends: {} };
const ids = await (async () => {
  const b = await chromium.launch({ headless: true });
  try {
    return await exampleIds(b);
  } finally {
    await b.close();
  }
})();
console.log(`examples: ${ids.join(', ')}`);

for (const name of backendNames) {
  const t0 = performance.now();
  const r = await runBackend(name, ids);
  r.args = BACKENDS[name];
  r.wallSeconds = (performance.now() - t0) / 1000;
  results.backends[name] = r;
  for (const [id, ex] of Object.entries(r.examples)) {
    if (ex.skipped) continue;
    const tolerance = ex.meta.testTolerance ?? DEFAULT_TOLERANCE;
    ex.tolerance = tolerance;
    const pngs = ex.runs.map((_, i) => readFileSync(pngPath(name, id, i + 1)));
    const vsRun1 = pngs.slice(1).map((p) => comparePng(p, pngs[0], tolerance));
    const baselineFile = path.join(BASELINES_DIR, `${id}.png`);
    const vsBaseline = existsSync(baselineFile)
      ? pngs.map((p) => comparePng(p, readFileSync(baselineFile), tolerance))
      : [];
    ex.runToRunMax = vsRun1.length ? summarize(maxBy(vsRun1)) : null;
    ex.runToRunExact =
      pngs.length > 1 ? maxExact(pngs.slice(1).map((p) => exactDiff(p, pngs[0]))) : null;
    ex.distinctRunImages = new Set(pngs.map((p) => p.toString('base64'))).size;
    ex.vsBaseline = vsBaseline.map(summarize);
    ex.vsBaselineMax = vsBaseline.length ? summarize(maxBy(vsBaseline)) : null;
    ex.vsBaselineExact = vsBaseline.length
      ? maxExact(pngs.map((p) => exactDiff(p, readFileSync(baselineFile))))
      : null;
    ex.medianReadyMs = median(ex.runs.map((x) => x.readyMs));
    ex.minReadyMs = Math.min(...ex.runs.map((x) => x.readyMs));
    ex.medianShotMs = median(ex.runs.map((x) => x.shotMs));
    if (vsBaseline.length && vsBaseline[0].diffPng) {
      writeFile(path.join(OUT, 'diff', name, `${id}.vs-baseline.png`), vsBaseline[0].diffPng);
    }
  }
}

// Cross-backend: every run of backend B vs run 1 of backend A.
if (results.backends.swiftshader && results.backends.metal) {
  results.cross = {};
  for (const [id, ex] of Object.entries(results.backends.swiftshader.examples)) {
    if (ex.skipped) continue;
    const ref = readFileSync(pngPath('swiftshader', id, 1));
    const cmp = results.backends.metal.examples[id].runs.map((_, i) =>
      comparePng(readFileSync(pngPath('metal', id, i + 1)), ref, ex.tolerance),
    );
    const exact = maxExact(
      results.backends.metal.examples[id].runs.map((_, i) =>
        exactDiff(readFileSync(pngPath('metal', id, i + 1)), ref),
      ),
    );
    results.cross[id] = {
      metalVsSwiftshaderMax: summarize(maxBy(cmp)),
      metalVsSwiftshaderExact: exact,
      tolerance: ex.tolerance,
    };
    if (cmp[0].diffPng) {
      writeFile(path.join(OUT, 'diff', `${id}.metal-vs-swiftshader.png`), cmp[0].diffPng);
    }
  }
}

writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));

// Summary.
const fmt = (s) => (s ? `${s.diffPixels} (${(s.ratio * 100).toFixed(4)}%)` : '-');
const fmtX = (x) => (x ? `${x.pixels}px/Δ${x.maxDelta}` : '-');
for (const [name, r] of Object.entries(results.backends)) {
  console.log(`\n== ${name}: ${r.gl.renderer} (wall ${r.wallSeconds.toFixed(1)} s)`);
  console.log(
    'id | run-to-run max (exact) | vs baseline max (exact) | pass | tol | ready ms median/min',
  );
  for (const [id, ex] of Object.entries(r.examples)) {
    if (ex.skipped) {
      console.log(`${id} | skipped`);
      continue;
    }
    console.log(
      `${id} | ${fmt(ex.runToRunMax)} (${fmtX(ex.runToRunExact)}) | ` +
        `${fmt(ex.vsBaselineMax)} (${fmtX(ex.vsBaselineExact)}) | ` +
        `${ex.vsBaselineMax?.pass ? 'pass' : 'FAIL'} | ${ex.tolerance} | ` +
        `${ex.medianReadyMs.toFixed(0)}/${ex.minReadyMs.toFixed(0)}`,
    );
  }
}
if (results.cross) {
  console.log('\n== metal vs swiftshader (max over metal runs, vs swiftshader run 1)');
  for (const [id, c] of Object.entries(results.cross)) {
    console.log(
      `${id} | ${fmt(c.metalVsSwiftshaderMax)} (${fmtX(c.metalVsSwiftshaderExact)}) | ` +
        `${c.metalVsSwiftshaderMax.pass ? 'pass' : 'FAIL'} tol ${c.tolerance}`,
    );
  }
}
console.log(`\nresults: ${path.join(OUT, 'results.json')}`);
