/**
 * Attribute-string paths (`'marker.line.color'`, `'annotations[2].text'`, `'xaxis.range[0]'`),
 * as used by `restyle`, `relayout`, the update planner and validation issues.
 *
 * Paths are parsed once and cached, because the same few strings are hit on every interaction
 * frame (e.g. `'xaxis.range'` during a drag).
 */

/** One step of a parsed path: an object key or an array index. */
export type PathSegment = string | number;

const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const CACHE_LIMIT = 2048;
const cache = new Map<string, readonly PathSegment[]>();

function pathError(path: string, why: string): Error {
  return new Error(`Invalid attribute path '${path}': ${why}`);
}

/**
 * Parse an attribute string into segments.
 *
 * @example
 * ```ts
 * parsePath('annotations[2].text'); // ['annotations', 2, 'text']
 * parsePath('xaxis.range[0]');      // ['xaxis', 'range', 0]
 * ```
 * @throws If the path is empty or malformed, or names `__proto__`/`prototype`/`constructor`
 * (which would let a figure spec pollute prototypes through `setIn`).
 */
export function parsePath(path: string): readonly PathSegment[] {
  const hit = cache.get(path);
  if (hit) return hit;

  const out: PathSegment[] = [];
  let i = 0;
  let expectKey = true;
  while (i < path.length) {
    const ch = path[i];
    if (ch === '[') {
      const end = path.indexOf(']', i);
      if (end < 0) throw pathError(path, 'unclosed "["');
      const body = path.slice(i + 1, end);
      if (!/^(0|[1-9]\d*)$/.test(body)) throw pathError(path, `index "${body}" is not an integer`);
      if (out.length === 0) throw pathError(path, 'cannot start with an index');
      out.push(Number(body));
      i = end + 1;
      expectKey = false;
    } else if (ch === '.') {
      if (expectKey) throw pathError(path, 'empty segment');
      i++;
      expectKey = true;
    } else {
      if (!expectKey) throw pathError(path, 'missing "." after index');
      let end = i;
      while (end < path.length && path[end] !== '.' && path[end] !== '[') end++;
      const key = path.slice(i, end);
      if (FORBIDDEN.has(key)) throw pathError(path, `"${key}" is not allowed`);
      out.push(key);
      i = end;
      expectKey = false;
    }
  }
  if (expectKey) throw pathError(path, path.length === 0 ? 'empty path' : 'trailing "."');

  if (cache.size >= CACHE_LIMIT) cache.clear();
  const frozen = Object.freeze(out);
  cache.set(path, frozen);
  return frozen;
}

/** Format segments back into an attribute string (inverse of {@link parsePath}). */
export function stringifyPath(segments: readonly PathSegment[]): string {
  let s = '';
  for (const seg of segments) {
    if (typeof seg === 'number') s += `[${seg}]`;
    else s += s.length === 0 ? seg : `.${seg}`;
  }
  return s;
}

function toSegments(path: string | readonly PathSegment[]): readonly PathSegment[] {
  return typeof path === 'string' ? parsePath(path) : path;
}

function isContainer(value: unknown): value is Record<PathSegment, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Read the value at `path`, or `undefined` if any step is missing.
 * Only own properties are followed, so `getIn({}, 'toString')` is `undefined`.
 */
export function getIn(obj: unknown, path: string | readonly PathSegment[]): unknown {
  let cur: unknown = obj;
  for (const seg of toSegments(path)) {
    if (!isContainer(cur) || !Object.hasOwn(cur, seg)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/**
 * Write `value` at `path`, creating intermediate containers (an array when the next segment is an
 * index, an object otherwise). Writing `undefined` removes an object key; array slots are set to
 * `undefined` rather than spliced so sibling indices stay stable. Mutates and returns `obj`.
 *
 * @throws If an intermediate step exists but is not an object/array (e.g. setting
 * `'marker.color'` when `marker` is a string), since silently replacing it would lose data.
 */
export function setIn<T extends object>(
  obj: T,
  path: string | readonly PathSegment[],
  value: unknown,
): T {
  const segs = toSegments(path);
  if (segs.length === 0) return obj;
  let cur: Record<PathSegment, unknown> = obj as Record<PathSegment, unknown>;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i] as PathSegment;
    let next = Object.hasOwn(cur, seg) ? cur[seg] : undefined;
    if (next === undefined || next === null) {
      if (value === undefined) return obj; // nothing to delete
      next = typeof segs[i + 1] === 'number' ? [] : {};
      cur[seg] = next;
    } else if (!isContainer(next)) {
      throw new Error(
        `Cannot set '${stringifyPath(segs)}': '${stringifyPath(segs.slice(0, i + 1))}' is not an object`,
      );
    }
    cur = next as Record<PathSegment, unknown>;
  }
  const last = segs[segs.length - 1] as PathSegment;
  if (value === undefined && !Array.isArray(cur)) delete cur[last];
  else cur[last] = value;
  return obj;
}
