/**
 * The lazily loaded half of pattern fills (plan E8.10; the entry points are in `pattern.ts`, which
 * imports this module with a dynamic `import()` on first use, so charts without patterns never
 * load it): Plotly's pattern attributes resolved per item, the pattern shader code, injected at
 * the `// @pattern-…` hooks of the rect, arc and fill shaders, and the per-instance attribute
 * writer of the rect and arc primitives.
 *
 * The shape math is mirrored on the CPU in `pattern-coverage.ts` — keep the two in sync.
 *
 * Hooks: `// @pattern-decl` (declarations), `// @pattern-vary` (vertex: pass the pattern on) and
 * `vec4 name = expr; // @pattern-fill` (fragment: the fill color, replaced by the pattern's where
 * the item has one). A fragment shader may `#define HC_PATTERN_POINT` to the pattern coordinate
 * (CSS px, y down; the default is the fragment's position from the viewport's top-left corner,
 * which needs `SCREEN_GLSL`) and `HC_PATTERN_OPACITY` to a factor of the pattern's alpha.
 */
import { DynamicDrawUsage, InstancedBufferAttribute, type Mesh, type ShaderMaterial } from 'three';
import type { RGBA } from '../types.ts';
import type { PatternAttributes, PatternFill } from './pattern.ts';

/** Pattern attributes (per instance, or per vertex for fills), 4 floats each. */
export const PATTERN_ATTRIBUTES = ['iPatStyle', 'iPatFg', 'iPatBg'] as const;

const VERTEX: Record<string, string> = {
  decl: `in vec4 iPatStyle;
in vec4 iPatFg;
in vec4 iPatBg;
flat out vec4 vPatStyle;
flat out vec4 vPatFg;
flat out vec4 vPatBg;`,
  vary: `vPatStyle = iPatStyle;
  vPatFg = iPatFg;
  vPatBg = iPatBg;`,
};

// Mirrors pattern-coverage.ts.
const FRAGMENT: Record<string, string> = {
  decl: `flat in vec4 vPatStyle;
flat in vec4 vPatFg;
flat in vec4 vPatBg;
float hcPatBand(float d, float hw, float aa) {
  return clamp((min(d + 0.5 * aa, hw) - max(d - 0.5 * aa, -hw)) / aa, 0.0, 1.0);
}
float hcPatLines(float u, float o, float s, float w, float aa) {
  float d = mod(u - o, s);
  return min(hcPatBand(d, 0.5 * w, aa) + hcPatBand(s - d, 0.5 * w, aa), 1.0);
}
float hcPatCoverage(vec2 p, int k, float size, float solidity, float aa) {
  if (!(size > 0.0)) return 0.0;
  float s = clamp(solidity, 0.0, 1.0);
  if (k >= 1 && k <= 6) {
    float w = k == 3 || k == 6 ? size * (1.0 - sqrt(1.0 - s)) : s * size;
    bool diagonal = k <= 3;
    float a = k == 2 || k == 5 ? 0.0 : diagonal
      ? hcPatLines((p.x + p.y) * 0.70710678, 0.0, size, w, aa)
      : hcPatLines(p.y, 0.5 * size, size, w, aa);
    float b = k == 1 || k == 4 ? 0.0 : diagonal
      ? hcPatLines((p.x - p.y) * 0.70710678, 0.0, size, w, aa)
      : hcPatLines(p.x, 0.5 * size, size, w, aa);
    return max(a, b);
  }
  if (k == 7) {
    float r = s < 0.78539816
      ? sqrt(s * size * size / 3.14159265)
      : mix(0.5 * size, 0.70710678 * size, (s - 0.78539816) / 0.21460184);
    float re = max(r, 0.5 * aa);
    float d = length(mod(p, size) - 0.5 * size);
    return clamp((re - d) / aa + 0.5, 0.0, 1.0) * (r * r) / (re * re);
  }
  return 0.0;
}
vec4 hcPatFill(vec4 fill) {
  int k = int(vPatStyle.x + 0.5);
  if (k < 1) return fill;
#ifdef HC_PATTERN_POINT
  vec2 p = HC_PATTERN_POINT;
#else
  vec2 f = (gl_FragCoord.xy - uViewport.xy) / uPixelRatio;
  vec2 p = vec2(f.x, uResolution.y - f.y);
#endif
  float fa = vPatFg.a * hcPatCoverage(p, k, vPatStyle.y, vPatStyle.z, hcAAWidth());
  float a = fa + vPatBg.a * (1.0 - fa);
  vec3 rgb = (vPatFg.rgb * fa + vPatBg.rgb * vPatBg.a * (1.0 - fa)) / max(a, 1e-6);
#ifdef HC_PATTERN_OPACITY
  a *= HC_PATTERN_OPACITY;
#endif
  return vec4(rgb, a);
}`,
};

const injected = new Map<string, string>();

/** `source` (a rect, arc or fill shader) with the pattern code in at its hooks. */
export function patternShader(source: string, fragment: boolean): string {
  let out = injected.get(source);
  if (out === undefined) {
    const parts = fragment ? FRAGMENT : VERTEX;
    out = source.replace(/^([ \t]*)(.*)\/\/ @pattern-([a-z]+).*$/gm, (line, indent, code, hook) =>
      hook === 'fill'
        ? indent + (code as string).replace(/=\s*(.+);/, '= hcPatFill($1);')
        : parts[hook as string] === undefined
          ? line
          : (indent as string) + parts[hook as string],
    );
    injected.set(source, out);
  }
  return out;
}

/** `PATTERN_SHAPES` (a copy: this chunk imports nothing from the main one). */
const SHAPES = ['', '/', '\\', 'x', '-', '|', '+', '.'];
const WHITE: RGBA = [1, 1, 1, 1];
const DARK: RGBA = [68 / 255, 68 / 255, 68 / 255, 1];

/** Per-item pattern buffers (4 floats per item each), as uploaded to {@link PATTERN_ATTRIBUTES}. */
export interface ResolvedPattern {
  /** Shape code (`PATTERN_SHAPES` index, 0: none), tile size (CSS px), solidity, unused. */
  style: Float32Array;
  /** Foreground color, sRGB RGBA, straight alpha, `fgopacity` and opacity in. */
  fg: Float32Array;
  /** Background color, with the opacity in. */
  bg: Float32Array;
}

/**
 * Plotly's `Color.contrast`: white over dark colors, `#444` over light ones (translucent colors
 * are composited over `background` first: white in Plotly).
 */
export function contrastOf(c: RGBA, background: RGBA = WHITE): RGBA {
  const ch = (k: number): number => (c[k]! * c[3] + background[k]! * (1 - c[3])) * 255;
  return (ch(0) * 299 + ch(1) * 587 + ch(2) * 114) / 1000 < 128 ? WHITE : DARK;
}

function isArray(v: unknown): v is ArrayLike<unknown> {
  return typeof v === 'object' && v !== null && 'length' in v;
}

/** Resolve `fill` for `count` items (see `PatternFill`). */
export function resolvePattern(fill: PatternFill, count: number): ResolvedPattern {
  const style = new Float32Array(count * 4);
  const fg = new Float32Array(count * 4);
  const bg = new Float32Array(count * 4);
  const perItem = Array.isArray(fill.pattern);
  const { color, opacity = 1, legend } = fill;
  const behind = typeof fill.background === 'string' ? fill.parse(fill.background) : null;
  for (let i = 0; i < count; i++) {
    const k = fill.index ? (fill.index[i] ?? -1) : i;
    if (k < 0) continue;
    const p = (perItem ? (fill.pattern as PatternAttributes[])[k] : fill.pattern) as
      PatternAttributes | undefined;
    if (!p) continue;
    // Per-item patterns (legend glyphs, pie slices) show their first entry.
    const j = perItem ? 0 : k;
    const at = (key: string): unknown => {
      const v = p[key];
      return isArray(v) ? v[j] : v;
    };
    const num = (key: string, dflt: number, legendArray: number): number => {
      if (legend && isArray(p[key])) return legendArray;
      const v = at(key);
      return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
    };
    const rgba = (key: string): RGBA | null | undefined => {
      const v = at(key);
      return typeof v === 'string' ? fill.parse(v) : null;
    };
    const code = SHAPES.indexOf(at('shape') as string);
    if (code < 1) continue;
    const o = i * 4;
    const c = k * 4;
    const overlay = p['fillmode'] === 'overlay';
    const size = num('size', 8, 8);
    style[o] = code;
    style[o + 1] = legend ? Math.min(size, 10) * 0.8 : size;
    style[o + 2] = num('solidity', 0.3, 0.5);
    const own: RGBA = [
      color[c] ?? 0.5,
      color[c + 1] ?? 0.5,
      color[c + 2] ?? 0.5,
      color[c + 3] ?? 1,
    ];
    const b = rgba('bgcolor') ?? (overlay ? own : [0, 0, 0, 0]);
    const f = rgba('fgcolor') ?? (overlay ? contrastOf(b, behind ?? WHITE) : own);
    const op = typeof opacity === 'number' ? opacity : (opacity[k] ?? 1);
    const fgopacity = p['fgopacity'];
    fg.set(f, o);
    fg[o + 3] = f[3] * (typeof fgopacity === 'number' ? fgopacity : overlay ? 0.5 : 1) * op;
    bg.set(b, o);
    bg[o + 3] = b[3] * op;
  }
  return { style, fg, bg };
}

/**
 * Upload `fill` resolved for the `count` instances of an instanced rect or arc mesh (its `iFill`
 * attribute gives the capacity) and switch it to the pattern shaders.
 */
export function writeInstancePattern(
  mesh: Mesh,
  shaders: readonly [vertex: string, fragment: string],
  fill: PatternFill,
  count: number,
): void {
  const geometry = mesh.geometry;
  const capacity = geometry.getAttribute('iFill').count;
  const r = resolvePattern(fill, count);
  const inputs = [r.style, r.fg, r.bg];
  PATTERN_ATTRIBUTES.forEach((name, k) => {
    let a = geometry.getAttribute(name) as InstancedBufferAttribute | undefined;
    if (!a || a.count < capacity) {
      a = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, a);
    }
    (a.array as Float32Array).set(inputs[k]!);
    a.clearUpdateRanges();
    a.addUpdateRange(0, count * 4);
    a.needsUpdate = true;
  });
  const material = mesh.material as ShaderMaterial;
  const vertex = patternShader(shaders[0], false);
  if (material.vertexShader === vertex) return;
  material.vertexShader = vertex;
  material.fragmentShader = patternShader(shaders[1], true);
  material.needsUpdate = true;
}
