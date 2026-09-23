/**
 * size-limit config (plan E21.1). Entries and budgets live in tests/bundle/size/entries.ts;
 * `pnpm size` builds the packages, bundles each entry (tests/bundle/size/bundle.ts), then runs
 * size-limit on the results. Sizes are minified + gzipped; see docs/release/bundle-size.md.
 */
import { SIZE_ENTRIES, measuredFile } from './tests/bundle/size/entries.ts';

export default SIZE_ENTRIES.map((entry) => ({
  name: entry.name,
  path: measuredFile(entry),
  gzip: true,
  ...(entry.limit ? { limit: entry.limit } : {}),
}));
