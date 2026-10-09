/**
 * Bundle-size budget policy (plan risk R9, backlog S2.16). Budgets used to be raised case by case,
 * each time "by decision"; the policy makes a raise cost a written cause and gives the full ESM
 * bundle a ceiling no raise may cross. See docs/release/bundle-size.md ("Budget policy").
 *
 * 1. **A budget only changes with a ledger line.** {@link BUDGETS_AT_ADOPTION} is every budget
 *    when the policy began; {@link BUDGET_CHANGES} is the append-only ledger since. An entry's
 *    `limit` in `entries.ts` must be its adopted budget, or the `to` of its latest ledger line.
 * 2. **A ledger line names its cause**: what grew (features, dependencies), by how much, and why
 *    it could not load lazily or be trimmed instead. "By decision" is not a cause.
 * 3. **The full ESM bundle has a hard ceiling**, {@link FULL_ESM_CEILING_KB}: its budget can be
 *    raised up to the ceiling, never past it. At the ceiling, new code goes into a lazy chunk or
 *    an add-on package, or something else gets smaller first.
 *
 * {@link checkBudgetPolicy} enforces 1–3; it runs in `pnpm test` (`policy.test.ts`) and before
 * size-limit in `pnpm size` (`.size-limit.ts`).
 */
import type { SizeEntry } from './entries.ts';

/** Id of the full ESM bundle's entry. */
export const FULL_ESM_ID = 'full';

/**
 * Hard ceiling of the full ESM bundle's initial chunk (min + gzip, without three), in kB. Set in
 * ship wave R3 at the M6 budget (540 kB) plus 20 kB. Changing it takes an ADR, not a ledger line.
 */
export const FULL_ESM_CEILING_KB = 560;

/** One change of a budget. */
export interface BudgetChange {
  /** `SizeEntry.id`. */
  readonly id: string;
  /** The budget before, e.g. `'540 kB'`; `'new'` for an entry added after the policy began. */
  readonly from: string;
  /** The budget after: what `entries.ts` must say; `'removed'` when the entry is gone. */
  readonly to: string;
  /** ISO date of the change. */
  readonly date: string;
  /** What grew, by how much (measured kB before and after), and why it is not lazy or trimmed. */
  readonly cause: string;
}

/** Every budget when the policy was adopted (ship wave R3, 2026-10-03). Never edited again. */
export const BUDGETS_AT_ADOPTION: Readonly<Record<string, string>> = {
  'partial-core-scatter': '157 kB',
  'text-engine-lazy': '49 kB',
  'fill-lazy': '9.4 kB',
  'animation-lazy': '6.4 kB',
  'lod-lazy': '2.3 kB',
  'custom-markers-lazy': '3.9 kB',
  'pattern-lazy': '2.25 kB',
  'style-lazy': '4 kB',
  'a11y-lazy': '5.8 kB',
  'font-regular-lazy': '95 kB',
  'font-bold-lazy': '95 kB',
  'font-italic-lazy': '98 kB',
  'font-bolditalic-lazy': '95 kB',
  'partial-basic': '250 kB',
  'controls-lazy': '16 kB',
  'keyboard-lazy': '5.5 kB',
  'legend-scroll-lazy': '1.8 kB',
  [FULL_ESM_ID]: '540 kB',
  'flow-lazy': '3.6 kB',
  'mesh-lazy': '11.7 kB',
  'lines-markers-3d-lazy': '10.7 kB',
  'extrusion-lazy': '13.5 kB',
  'view3d-lazy': '2.7 kB',
  iife: '690 kB',
  'iife-3d': '115 kB',
};

/**
 * The ledger: one line per budget change since adoption, oldest first. Append only. A line reads
 * like `{ id: 'full', from: '540 kB', to: '548 kB', date: '2026-11-02', cause: 'SVG export
 * (S3.4): the 2D scene walker cannot load lazily because … ; 536.1 → 545.3 kB on CI' }`.
 */
export const BUDGET_CHANGES: readonly BudgetChange[] = [
  {
    id: 'trace-a11y-lazy',
    from: 'new',
    to: '4.6 kB',
    date: '2026-10-03',
    cause:
      'Keyboard stops and 3D descriptions of the trace packages (S2.14), as lazy chunks of the full bundle loaded on first keyboard focus or description: 4.19 kB measured. With ordinary imports the same code added 4.18 kB to the full initial chunk, which had 2.4 kB of room.',
  },
  {
    id: 'partial-geo',
    from: 'new',
    to: '209 kB',
    date: '2026-10-04',
    cause:
      "The geo package (GEO2–GEO8, ADR-026): the geo subplot, scattergeo and choropleth with d3-geo and topojson-client, registered on the runtime: 204.79 kB measured locally, 49.8 kB more than core + scatter. It is its own entry because the full bundle does not import the package; the full bundle stayed at 534.76 kB. Of it, 4.6 kB is what a 3D globe needs up front (its viewport, camera and matrix, and the loaders of its lazy code); the globe's drawing is the 'geo-globe-lazy' row.",
  },
  {
    id: 'geo-globe-lazy',
    from: 'new',
    to: '11.9 kB',
    date: '2026-10-04',
    cause:
      "The 3D globe (GEO8, ADR-028), 'globe3d': sphere meshes, 3D lines, lifted arcs, prisms and their picking, as lazy chunks loaded when a figure has a globe: 11.61 kB measured locally. With ordinary imports the same code added 10 kB to the initial chunk of every map.",
  },
  {
    id: 'geo-projections-lazy',
    from: 'new',
    to: '13.3 kB',
    date: '2026-10-04',
    cause:
      'The 68 Plotly projection types that need d3-geo-projection (ADR-026), as one lazy chunk loaded when a figure names one: 12.98 kB measured locally.',
  },
  {
    id: 'geo-country-names-lazy',
    from: 'new',
    to: '15.8 kB',
    date: '2026-10-04',
    cause:
      "The country-name table of locationmode 'country names' (GEO3, GEO4), ported from country-iso-search, as a lazy chunk loaded on first use: 15.44 kB measured locally.",
  },
  {
    id: 'geo-base-110m-lazy',
    from: 'new',
    to: '32.1 kB',
    date: '2026-10-04',
    cause:
      'Basemap data (ADR-024): Natural Earth 1:110m countries and land as TopoJSON on a 1e4 grid, a lazy chunk loaded by a map at resolution 110: 31.33 kB measured locally.',
  },
  {
    id: 'geo-extras-110m-lazy',
    from: 'new',
    to: '8.95 kB',
    date: '2026-10-04',
    cause:
      'Basemap data (ADR-024): Natural Earth 1:110m lakes, rivers and US states, a lazy chunk loaded when a map shows them: 8.71 kB measured locally.',
  },
  {
    id: 'geo-base-50m-lazy',
    from: 'new',
    to: '182.5 kB',
    date: '2026-10-04',
    cause:
      'Basemap data (ADR-024): Natural Earth 1:50m countries and land as TopoJSON on a 2e4 grid, a lazy chunk loaded by a map at resolution 50: 178.32 kB measured locally. The 1e4 grid of the ADR target would be 148.9 kB but drops three small countries.',
  },
  {
    id: 'geo-extras-50m-lazy',
    from: 'new',
    to: '107.5 kB',
    date: '2026-10-04',
    cause:
      'Basemap data (ADR-024): Natural Earth 1:50m lakes, rivers and the subunits of four countries, a lazy chunk loaded when a map at resolution 50 shows them: 105.03 kB measured locally.',
  },
  {
    id: 'geo-a11y-lazy',
    from: 'new',
    to: '0.9 kB',
    date: '2026-10-04',
    cause:
      'Keyboard stops, view keys and descriptions of scattergeo and choropleth (GEO6), as a lazy chunk loaded on first keyboard focus: 0.82 kB measured locally.',
  },
  {
    id: 'partial-graph',
    from: 'new',
    to: '190 kB',
    date: '2026-10-06',
    cause:
      'The graph package (G1, ADR-029), registered on the runtime (`tracesGraph`): 185.59 kB measured locally. The graph trace with its preset, circular and grid layouts is 176.05 kB when registered alone, 20.99 kB more than core + scatter (155.06 kB); the chord trace (G8) in the same package adds 9.54 kB. It is its own entry because the full bundle does not import the package; the full bundle measured 534.86 kB with it in the workspace. The package has no lazy chunks of its own.',
  },
  {
    id: 'graph-layout-worker',
    from: 'new',
    to: '30.5 kB',
    date: '2026-10-06',
    cause:
      'The graph layout worker (G7), `dist/layout-worker.js` of the graph package: every built-in layout (force, layered, the trees, arc, hive, circular, grid, preset), edge bundling and the message handler, as one minified file without imports that an app can also host itself: 29.52 kB measured locally. A page loads it only when it lays a graph out off the main thread, so it is no part of any entry: the layouts are in the graph entries already, for calc on the main thread, and the worker has to carry its own copy because it shares no chunk with the page.',
  },
  {
    id: 'partial-graph3d',
    from: 'new',
    to: '236 kB',
    date: '2026-10-06',
    cause:
      'The graph3d trace (G6, ADR-029) registered on the runtime with the 3D scene it is drawn in (`tracesGraph3d`): 230.57 kB measured locally, 75.43 kB more than core + scatter (155.14 kB). It is its own entry because `tracesGraph` leaves graph3d out, so that an app with 2D graphs bundles no module of the 3D package (tests/bundle/esm-graph-no-3d.spec.ts); the full bundle does not import the graph package at all. Most of the difference is the scene (its component, camera and controls, axes, picking and camera motion) and the graph model, styles and layouts shared with the 2D trace. The 3D line, marker and mesh primitives and the scene view keys are lazy chunks, as for every 3D trace (9.84 kB, 10.74 kB and 1.56 kB here).',
  },
  {
    id: 'partial-graph',
    from: '190 kB',
    to: '223 kB',
    date: '2026-10-06',
    cause:
      'Every arrangement of the graph trace now runs its layout (G2, G3, G4, G8): 218.54 kB measured locally, 32.95 kB more than with the preset, circular and grid layouts alone (185.59 kB). The layouts are 25.6 kB of it when bundled by themselves: layered 11.8 kB, force 7.3 kB (springs and ForceAtlas2 on one Barnes–Hut tree), the tidy, radial and dendrogram trees 5.0 kB together, arc 1.35 kB and hive 1.3 kB. The rest, about 7 kB, is the trace side: the option containers and their mapping, routed and secondary links, cluster and guide titles, turned labels, the simulate animation and the fold tween. They are not lazy chunks because calc is synchronous (ADR-029): a layout that loaded on demand would need a pending state and a second pass for every figure, and an app that draws no graph does not load the package at all.',
  },
  {
    id: 'graph-a11y-lazy',
    from: 'new',
    to: '3.6 kB',
    date: '2026-10-06',
    cause:
      "Keyboard stops of graph, graph3d and chord (G10), as one lazy chunk of the graph package loaded on first keyboard focus: 3.24 kB measured locally. It replaces the chord trace's own chunk (0.47 kB, not a row) and the node stops that graph and graph3d had in their initial chunks, and adds navigation along links: the links at each node in order around it, tree and rank walks, and their announcements. The descriptions (summary and edge list) are not in it: they stay in the initial chunk as in the other 2D trace packages, where they add 1.39 kB to core + graph and 1.58 kB to core + graph3d.",
  },
  {
    id: 'partial-graph',
    from: '223 kB',
    to: '231 kB',
    date: '2026-10-06',
    cause:
      'What the pointer does to a graph (G5): 226.91 kB measured locally, 8.37 kB more than before (218.54 kB). About 7 kB of it is G5, by module when minified alone: the pointer state of a view, with the glide to the calc a drag leaves and the simulation a drag runs under `force.simulate`, 2.8 kB; what a hover and a path emphasize, with the reading of the `highlight` attributes and `graphPath`, 1.5 kB; adjacency, neighbourhoods and shortest paths (breadth first and Dijkstra), 1.3 kB; the drag gesture and the restyles it writes, 1.3 kB; the force layout that goes on from a picture (`force.start`), 0.7 kB; the rest is in the view, the styles and hover. The other 1.4 kB is the descriptions of G10 (see graph-a11y-lazy). It is not a lazy chunk: the highlight answers the first move of the pointer and calc reads `force.start`, both synchronously; the drag alone (about 4 kB) could be loaded on the first press on a node if this entry has to shrink.',
  },
  {
    id: 'partial-graph',
    from: '231 kB',
    to: '236 kB',
    date: '2026-10-06',
    cause:
      'Large graphs (G7): 233.80 kB measured locally, 6.89 kB more than before (226.91 kB). What grew is what has to answer at once, by module when minified alone: the view side that asks for a layout, draws the positions the worker reports and holds `chart.ready`, 1.55 kB; what a calc waits for, the rule for `worker` and the answers that are kept, 1.36 kB; the level of detail, measured and applied on every zoom, 1.35 kB; the spatial index of the links for hover, 1.05 kB; the rest, about 1.5 kB, is in calc (the stand-in placement, the plan of the bundling), the view, the link geometry patched while a node is dragged and the three attributes. The code a figure only needs when a layout really runs off the main thread or links are bundled is not in it: the client of the layout worker, its fallback handler, the protocol and both bundling methods are a lazy chunk (graph-layout-code-lazy, 8.24 kB). The entry also exports them for apps that call `layoutInWorker` or `bundleLinks` themselves, so the package build makes the lazy chunk from copies of those modules (packages/traces-graph/tsdown.config.ts): with one copy, static in the entry, this row measured 241.43 kB. Still not lazy, and next if the entry has to shrink: the view side of the stream (1.55 kB, by loading it with the first calc that waits) and the drag (about 4 kB).',
  },
  {
    id: 'graph-layout-code-lazy',
    from: 'new',
    to: '8.7 kB',
    date: '2026-10-06',
    cause:
      'The layout code a `graph` trace loads on demand (G7), as one lazy chunk of the graph package: 8.24 kB measured locally. The client of the layout worker (requests, owners, cancelling, the start of the worker and what happens without one), the handler it runs on the main thread in slices when no worker can be started, the protocol that carries graphs and results between threads, and hierarchical and force-directed link bundling. It imports the layouts from the initial chunk, which calc needs anyway. Loaded the first time a layout runs off the main thread (`worker`) or links are bundled (`link.bundle`); a figure with neither, which is the default, never loads it.',
  },
  {
    id: 'keyboard-lazy',
    from: '5.5 kB',
    to: '5.7 kB',
    date: '2026-10-06',
    cause:
      'Two parts of the keyboard contract that the graph trace needed (G4, G10): 5.57 kB measured locally, 0.09 kB more than before (5.48 kB, already within 0.02 kB of the budget). `KeyboardPoint.click` lets Enter on a stop reach the click handling of a cartesian trace that handles clicks itself (a tree node folds from the keyboard), and `KeyboardStops.locate` re-finds the cursor in stops that are built on demand after the stops change (a fold, a legend toggle). Both are in the navigation code itself, which is this chunk, so there is nothing to load later; the budget is set 0.13 kB above the measurement because CI measures about 0.3 % above a local build.',
  },
  {
    id: 'graph-a11y-lazy',
    from: '3.6 kB',
    to: '3.8 kB',
    date: '2026-10-06',
    cause:
      'The graph stops answer the two additions to the keyboard contract (see keyboard-lazy): 3.60 kB measured locally, 0.36 kB more than when the row was added (3.24 kB), exactly at the budget. `locate` for network, tree and rank stops (a folded-away node goes to the node it folded into, a link to its node, a node of a hidden group to the nearest drawn one) and the fold flag with its "Folded." sentence. It is already the lazy chunk; the budget is set above the measurement because CI measures about 0.3 % above a local build.',
  },
  {
    id: 'partial-graph3d',
    from: '236 kB',
    to: '224 kB',
    date: '2026-10-06',
    cause:
      'Lowered after the entry shrank: 220.47 kB measured locally, 14.11 kB less than before (234.58 kB). The registry of custom layouts moved out of `layout/index.ts` into `layout/registry.ts` (G7), and `graph3d` now imports it from there, so a bundle with `graph3d` alone no longer carries the layered, tree, arc and hive layouts of the 2D trace. The budget follows the measurement down so that the room this freed is not spent unnoticed.',
  },
  {
    id: 'iife',
    from: '690 kB',
    to: '693 kB',
    date: '2026-10-06',
    cause:
      'Express gained `graph`, `chord` and `adjacencyMatrix` (G9): 688.37 kB measured locally, about 3.4 kB more than before the graphs epic (684.95 kB), of which the three functions are about 3.0 kB and the rest is the runtime (the second calc pass of a pending layout, the keyboard contract). CI measures about 0.3 % above a local build, which would put this file at 690.4 kB against 690. The script-tag build exposes Express as one namespace and has no lazy chunks, so the functions cannot load later; `adjacencyMatrix` draws there (a heatmap), while `graph` and `chord` figures need a graph script that does not exist yet, so leaving those two out of this build (a second Express entry) is the trim to make if the budget has to come back down.',
  },
  {
    id: 'full',
    from: '540 kB',
    to: '542 kB',
    date: '2026-10-09',
    cause:
      'Calibrate the first alpha against Linux CI: the same full ESM entry measures 538.05 kB locally and 540.009 kB on CI (run 37996311768), exceeding the old budget by 9 bytes. The graph-era Express helpers and shared runtime changes left less room than the estimated 0.3% CI difference; the observed difference is 0.36%. Geo and graph trace implementations remain separate optional entries and heavy rendering remains lazy. This 2 kB adjustment provides 0.37% headroom above the measured CI artifact without changing shipped code or the 560 kB hard ceiling; moving public synchronous Express helpers to async imports would change their API.',
  },
];

/** Fewest characters a cause can have and still say what grew. */
export const MIN_CAUSE_LENGTH = 40;

const BUDGET = /^(\d+(?:\.\d+)?) kB$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NO_CAUSE = /^\W*(?:raised\s+)?by\s+(?:owner\s+)?decision\W*$/i;

/** A budget such as `'9.4 kB'` in kB, or NaN. */
export function budgetKB(budget: string | undefined): number {
  const m = budget === undefined ? null : BUDGET.exec(budget);
  return m ? Number(m[1]) : NaN;
}

/**
 * The violations of the policy (see the module comment) by `entries`, given the ledger and the
 * adopted budgets; empty when the budgets are in order. Each is one sentence saying what to do.
 */
export function checkBudgetPolicy(
  entries: readonly Pick<SizeEntry, 'id' | 'limit'>[],
  changes: readonly BudgetChange[] = BUDGET_CHANGES,
  adopted: Readonly<Record<string, string>> = BUDGETS_AT_ADOPTION,
  ceilingKB: number = FULL_ESM_CEILING_KB,
): string[] {
  const out: string[] = [];
  const current = new Map<string, string>(Object.entries(adopted));
  for (const [i, change] of changes.entries()) {
    const where = `Ledger line ${i + 1} (${change.id})`;
    const before = current.get(change.id) ?? 'new';
    if (change.from !== before) {
      out.push(`${where}: "from" is ${change.from}, but the budget before it was ${before}.`);
    }
    const removed = change.to === 'removed';
    if (!removed && Number.isNaN(budgetKB(change.to))) {
      out.push(`${where}: "to" must be a budget like '540 kB', not '${change.to}'.`);
    }
    if (!ISO_DATE.test(change.date)) out.push(`${where}: "date" must be an ISO date.`);
    const cause = change.cause.trim();
    if (cause.length < MIN_CAUSE_LENGTH || NO_CAUSE.test(cause)) {
      out.push(
        `${where}: name the cause (what grew, by how much, why it is not lazy or trimmed), ` +
          `in at least ${MIN_CAUSE_LENGTH} characters.`,
      );
    }
    if (removed) current.delete(change.id);
    else current.set(change.id, change.to);
  }
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.limit === undefined) continue;
    ids.add(entry.id);
    const expected = current.get(entry.id);
    if (expected === undefined) {
      out.push(
        `${entry.id}: a new budget (${entry.limit}) needs a ledger line in ` +
          `tests/bundle/size/policy.ts (from: 'new') that names what it measures and why.`,
      );
    } else if (expected !== entry.limit) {
      out.push(
        `${entry.id}: the budget is ${entry.limit}, but the ledger says ${expected}. A budget ` +
          `changes with a line in BUDGET_CHANGES (tests/bundle/size/policy.ts) naming its cause.`,
      );
    }
    if (entry.id === FULL_ESM_ID && !(budgetKB(entry.limit) <= ceilingKB)) {
      out.push(
        `${entry.id}: the budget (${entry.limit}) is over the full ESM bundle's hard ceiling of ` +
          `${ceilingKB} kB. Move code into a lazy chunk or an add-on, or trim; do not raise it.`,
      );
    }
  }
  for (const id of current.keys()) {
    if (!ids.has(id)) {
      out.push(`${id}: the ledger has a budget for it, but entries.ts has no such budgeted entry.`);
    }
  }
  return out;
}

/** Throw when the budgets break the policy (`.size-limit.ts` calls this before measuring). */
export function assertBudgetPolicy(entries: readonly Pick<SizeEntry, 'id' | 'limit'>[]): void {
  const violations = checkBudgetPolicy(entries);
  if (violations.length > 0) {
    throw new Error(
      `Bundle-size budget policy (docs/release/bundle-size.md):\n- ${violations.join('\n- ')}`,
    );
  }
}
