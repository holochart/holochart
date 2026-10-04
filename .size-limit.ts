/**
 * size-limit config (plan E21.1). Entries and budgets live in tests/bundle/size/entries.ts;
 * `pnpm size` builds the packages, bundles each entry (tests/bundle/size/bundle.ts), then runs
 * size-limit on the results. Sizes are minified + gzipped; see docs/release/bundle-size.md.
 *
 * Budget policy (plan R9, tests/bundle/size/policy.ts), checked here before anything is measured:
 * - A budget changes only together with a line in the ledger (`BUDGET_CHANGES`) that names its
 *   cause: what grew, by how much, and why it is not lazy or trimmed. "By decision" is no cause.
 * - The full ESM bundle has a hard ceiling (`FULL_ESM_CEILING_KB`, 560 kB) that no raise crosses.
 * Over budget? First try to make the code lazy or smaller; raise the budget last.
 */
import { SIZE_ENTRIES, measuredFile } from './tests/bundle/size/entries.ts';
import { assertBudgetPolicy } from './tests/bundle/size/policy.ts';

assertBudgetPolicy(SIZE_ENTRIES);

export default SIZE_ENTRIES.map((entry) => ({
  name: entry.name,
  path: measuredFile(entry),
  gzip: true,
  ...(entry.limit ? { limit: entry.limit } : {}),
}));
