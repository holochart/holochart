/**
 * Reads the vendored, reduced copy of plotly.js' attribute schema (`plotly-schema.jsonl`, written
 * by `reduce-plotly-schema.ts`). One JSON record per line: the source and license, the containers
 * shared between records, one record per trace type, the layout and the config.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { unpack, type Branch } from './schema-tree.ts';

export const PLOTLY_SCHEMA_FILE = fileURLToPath(new URL('plotly-schema.jsonl', import.meta.url));

/** A line of the vendored file. Trees are packed (see `pack` in `schema-tree.ts`). */
export type PlotlySchemaRecord =
  | {
      record: 'source';
      name: string;
      version: string;
      file: string;
      url: string;
      reducedBy: string;
      /** plotly.js' license text, a paragraph per entry. */
      license: string[];
    }
  | { record: 'defs'; defs: unknown[] }
  | { record: 'trace'; type: string; attributes: unknown; layout?: unknown }
  | { record: 'layout' | 'config'; attributes: unknown };

/** plotly.js' schema, unpacked. */
export interface PlotlySchema {
  /** plotly.js version the schema was taken from. */
  version: string;
  /** Trace type → its attributes, and the layout attributes it adds (`barmode`, …). */
  traces: Record<string, { attributes: Branch; layout: Branch }>;
  layout: Branch;
  config: Branch;
}

export async function readPlotlySchema(file = PLOTLY_SCHEMA_FILE): Promise<PlotlySchema> {
  const records = (await readFile(file, 'utf8'))
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as PlotlySchemaRecord);
  const defs = records.find((r) => r.record === 'defs')?.defs ?? [];
  const out: PlotlySchema = { version: '', traces: {}, layout: {}, config: {} };
  for (const r of records) {
    if (r.record === 'source') out.version = r.version;
    else if (r.record === 'trace') {
      out.traces[r.type] = {
        attributes: unpack(r.attributes, defs),
        layout: unpack(r.layout ?? {}, defs),
      };
    } else if (r.record === 'layout') out.layout = unpack(r.attributes, defs);
    else if (r.record === 'config') out.config = unpack(r.attributes, defs);
  }
  return out;
}
