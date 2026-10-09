/**
 * The Natural Earth files the basemap is built from: which release, where they come from, and
 * the hash each one must have. They are downloaded once into `.cache/` (not committed) and
 * verified on every read, so a rebuild is reproducible and a changed upstream file is noticed.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FeatureCollection } from 'geojson';
import type { Resolution } from './config.ts';

/** The Natural Earth release (the `VERSION` file of the pinned tag). */
export const NATURAL_EARTH_VERSION = '5.1.2';

/** The tag of github.com/nvkelso/natural-earth-vector the files are read at. */
export const NATURAL_EARTH_TAG = 'v5.1.2';

const BASE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_TAG}/geojson/`;

/** The source layers, by the name the build knows them under. */
export const LAYERS = {
  countries: 'admin_0_countries',
  lakes: 'lakes',
  rivers: 'rivers_lake_centerlines',
  // The `_lakes` variant has the large lakes cut out of the states, as in Plotly's files.
  subunits: 'admin_1_states_provinces_lakes',
} as const;

export type Layer = keyof typeof LAYERS;

/** SHA-256 of every source file at {@link NATURAL_EARTH_TAG}. */
export const SHA256: Readonly<Record<string, string>> = {
  'ne_110m_admin_0_countries.geojson':
    '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f',
  'ne_110m_admin_1_states_provinces_lakes.geojson':
    '8e048ee20587e124e74de5c6bfeea8132ab2313a8f7f4f97e043617f8f37f7f6',
  'ne_110m_lakes.geojson': 'eb02ecc86c82004fccbf979058bfabbbd6c2d07968c7844d38eb1c9152d2ffc9',
  'ne_110m_rivers_lake_centerlines.geojson':
    '55aa4497405afc07cdc931b7fbe062c4d6693ba2a550c0d24899953f5d507c8d',
  'ne_50m_admin_0_countries.geojson':
    '3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb',
  'ne_50m_admin_1_states_provinces_lakes.geojson':
    'b92c3f709b691240f6320e5cd7fade78cedfa3b91ecff14cecd3de0616c764b9',
  'ne_50m_lakes.geojson': 'd350b75978b26fe839b797c2c529b2fb8f47fb3983c03f4964e36d5df9378a52',
  'ne_50m_rivers_lake_centerlines.geojson':
    'f286e0ce978fde999ca2d7a78c764be08542e19b63cded52b05c12d5173ccc51',
};

/** `tools/geo-data/.cache/<tag>/`: where the downloaded files are kept. */
export const CACHE_DIR = path.resolve(import.meta.dirname, '..', '.cache', NATURAL_EARTH_TAG);

/** The file name of one layer at one resolution, e.g. `ne_110m_lakes.geojson`. */
export function sourceFileName(resolution: Resolution, layer: Layer): string {
  return `ne_${resolution}m_${LAYERS[layer]}.geojson`;
}

/** Whether every source file is in the cache (so a build needs no network). */
export function cacheIsFilled(resolutions: readonly Resolution[]): boolean {
  return resolutions.every((resolution) =>
    (Object.keys(LAYERS) as Layer[]).every((layer) =>
      existsSync(path.join(CACHE_DIR, sourceFileName(resolution, layer))),
    ),
  );
}

/** Options of {@link readSource}. */
export interface ReadSourceOptions {
  /** Fail instead of downloading a file that is not in the cache. */
  offline?: boolean;
}

/**
 * One source file, parsed. Reads it from the cache, downloading it first if it is not there, and
 * throws when its SHA-256 is not the recorded one (a file that fails the check is not cached).
 */
export async function readSource(
  resolution: Resolution,
  layer: Layer,
  options: ReadSourceOptions = {},
): Promise<FeatureCollection> {
  const name = sourceFileName(resolution, layer);
  const file = path.join(CACHE_DIR, name);
  const expected = SHA256[name];
  if (expected === undefined) throw new Error(`geo-data: no SHA-256 recorded for ${name}`);
  let bytes: Buffer;
  let downloaded = false;
  if (existsSync(file)) {
    bytes = await readFile(file);
  } else {
    if (options.offline) throw new Error(`geo-data: ${name} is not in ${CACHE_DIR} (offline)`);
    const response = await fetch(BASE_URL + name);
    if (!response.ok) throw new Error(`geo-data: ${BASE_URL + name} answered ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    downloaded = true;
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `geo-data: ${name} has SHA-256 ${actual}, expected ${expected}. ` +
        (downloaded
          ? 'The upstream file changed; review it before recording the new hash.'
          : `Delete ${file} to download it again.`),
    );
  }
  if (downloaded) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, bytes);
  }
  return JSON.parse(bytes.toString('utf8')) as FeatureCollection;
}
