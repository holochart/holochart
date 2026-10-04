import { describe, expect, it } from 'vitest';
import { SIZE_ENTRIES } from './entries.ts';
import {
  BUDGET_CHANGES,
  BUDGETS_AT_ADOPTION,
  FULL_ESM_CEILING_KB,
  FULL_ESM_ID,
  budgetKB,
  checkBudgetPolicy,
  type BudgetChange,
} from './policy.ts';

const entries = [
  { id: 'full', limit: '540 kB' },
  { id: 'lazy', limit: '9.4 kB' },
  { id: 'unbudgeted' },
];
const adopted = { full: '540 kB', lazy: '9.4 kB' };
const cause = 'SVG export (S3.4): the scene walker is needed up front; 536.1 → 545.3 kB on CI';
const change = (c: Partial<BudgetChange>): BudgetChange => ({
  id: 'full',
  from: '540 kB',
  to: '548 kB',
  date: '2026-11-02',
  cause,
  ...c,
});

describe('bundle-size budget policy (S2.16)', () => {
  it('holds for the budgets in entries.ts and the ledger', () => {
    expect(checkBudgetPolicy(SIZE_ENTRIES)).toEqual([]);
  });

  it('keeps the adopted budgets and the ceiling as they were set', () => {
    // The snapshot the ledger starts from: changing it would rewrite history.
    expect(Object.keys(BUDGETS_AT_ADOPTION)).toHaveLength(25);
    expect(BUDGETS_AT_ADOPTION[FULL_ESM_ID]).toBe('540 kB');
    expect(FULL_ESM_CEILING_KB).toBe(560);
    for (const c of BUDGET_CHANGES) expect(budgetKB(c.to)).not.toBeNaN();
  });

  it('accepts budgets as adopted, and unbudgeted entries', () => {
    expect(checkBudgetPolicy(entries, [], adopted)).toEqual([]);
  });

  it('refuses a budget that changed without a ledger line', () => {
    const raised = [{ id: 'full', limit: '548 kB' }, entries[1]!];
    const [violation, ...rest] = checkBudgetPolicy(raised, [], adopted);
    expect(rest).toEqual([]);
    expect(violation).toContain('the budget is 548 kB, but the ledger says 540 kB');
    // Lowering a budget is a change too.
    expect(
      checkBudgetPolicy([{ id: 'full', limit: '530 kB' }, entries[1]!], [], adopted),
    ).toHaveLength(1);
  });

  it('accepts a raise with a ledger line that names its cause', () => {
    const raised = [{ id: 'full', limit: '548 kB' }, entries[1]!];
    expect(checkBudgetPolicy(raised, [change({})], adopted)).toEqual([]);
    // Two raises chain: each starts where the last one ended.
    const twice = [change({}), change({ from: '548 kB', to: '552 kB' })];
    expect(
      checkBudgetPolicy([{ id: 'full', limit: '552 kB' }, entries[1]!], twice, adopted),
    ).toEqual([]);
  });

  it('refuses a ledger line without a cause', () => {
    const raised = [{ id: 'full', limit: '548 kB' }, entries[1]!];
    for (const text of ['', 'bigger', 'By decision.', 'raised by owner decision']) {
      const violations = checkBudgetPolicy(raised, [change({ cause: text })], adopted);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('name the cause');
    }
  });

  it('refuses ledger lines that do not chain, or are malformed', () => {
    const raised = [{ id: 'full', limit: '548 kB' }, entries[1]!];
    const wrongFrom = checkBudgetPolicy(raised, [change({ from: '500 kB' })], adopted);
    expect(wrongFrom).toEqual([
      'Ledger line 1 (full): "from" is 500 kB, but the budget before it was 540 kB.',
    ]);
    const malformed = checkBudgetPolicy(raised, [change({ to: '548', date: 'today' })], adopted);
    expect(malformed.join('\n')).toMatch(/"to" must be a budget.*\n.*"date" must be an ISO date/);
  });

  it('holds the full ESM bundle under its hard ceiling, whatever the ledger says', () => {
    const over = [{ id: 'full', limit: '565 kB' }, entries[1]!];
    const violations = checkBudgetPolicy(over, [change({ to: '565 kB' })], adopted, 560);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("over the full ESM bundle's hard ceiling of 560 kB");
    const at = [{ id: 'full', limit: '560 kB' }, entries[1]!];
    expect(checkBudgetPolicy(at, [change({ to: '560 kB' })], adopted, 560)).toEqual([]);
  });

  it('wants a ledger line for a new budgeted entry, and none for a removed one to linger', () => {
    const added = [...entries, { id: 'svg-lazy', limit: '12 kB' }];
    expect(checkBudgetPolicy(added, [], adopted)[0]).toContain('needs a ledger line');
    const line = change({ id: 'svg-lazy', from: 'new', to: '12 kB' });
    expect(checkBudgetPolicy(added, [line], adopted)).toEqual([]);
    expect(checkBudgetPolicy([entries[0]!], [], adopted)[0]).toContain('no such budgeted entry');
    const gone = change({ id: 'lazy', from: '9.4 kB', to: 'removed' });
    expect(checkBudgetPolicy([entries[0]!], [gone], adopted)).toEqual([]);
  });
});
