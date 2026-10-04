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
