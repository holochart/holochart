/**
 * Shaders of the surface primitive (plan E14.3).
 *
 * ## Vertex stage: the surface built on the GPU
 *
 * Nothing per vertex is uploaded: the draw has no attributes, `(nx − 1)(ny − 1) · 6` vertices, and
 * `gl_VertexID` gives the cell, the triangle (two per cell, split along the `(i, j)`–`(i+1, j+1)`
 * diagonal) and the corner. The corner's position comes from float textures: `uHeight` (z, `nx ×
 * ny`), `uCoordX` / `uCoordY` (x and y: `nx × 1` / `ny × 1` vectors, or `nx × ny` matrices), all
 * relative to the primitive's origin (float64 on the CPU, float32 here). The normal is the cross
 * product of central differences of the neighbours (one-sided at edges and gaps) in world units
 * (`uWorldScale`: the data → scene scale per axis), turned into view space by the view matrix.
 * A triangle with a gap (`|v| ≥ 1e37`) at any corner is dropped (all three corners go outside the
 * clip volume). `uOrder` walks the cells from the far side of the grid first (flip i, flip j, swap
 * the major axis), which draws translucent height fields back to front without sorting.
 *
 * ## Fragment stage
 *
 * The mesh primitive's shader (`MESH_FRAGMENT_SHADER` of the lazily loaded mesh chunk: Plotly's
 * lighting model, the colorscale LUT, clipping, picking) with {@link SURFACE_FRAGMENT_HOOKS} spliced
 * in at its `// @mesh-…` lines: `opacityscale` (alpha by the normalized color value), then after
 * lighting the wireframe, the contour lines of `x`, `y` and `z` (anti-aliased, `width` px wide,
 * from the value's screen-space gradient, exact on the drawn surface), the highlight lines of the
 * hovered point, and `hidesurface` (only the lines stay). Lines are unlit, as in Plotly.
 */

export const SURFACE_VERTEX_SHADER = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uHeight;
uniform sampler2D uCoordX;
uniform sampler2D uCoordY;
uniform sampler2D uValue;
uniform ivec2 uGrid;
uniform ivec2 uMatrix;
uniform ivec3 uOrder;
uniform vec3 uWorldScale;
uniform int uColorByZ;

out vec3 vLocal;
out vec3 vViewPos;
out vec3 vNormal;
out vec2 vGrid;
#ifdef HC_INTENSITY
out float vValue;
#endif
#ifdef PICKING
uniform uint uPickBase;
flat out uint vPickId;
#endif

vec3 hcPoint(ivec2 g) {
  float x = texelFetch(uCoordX, uMatrix.x == 1 ? g : ivec2(g.x, 0), 0).r;
  float y = texelFetch(uCoordY, uMatrix.y == 1 ? g : ivec2(g.y, 0), 0).r;
  return vec3(x, y, texelFetch(uHeight, g, 0).r);
}

bool hcHidden(vec3 p) {
  return any(greaterThan(abs(p), vec3(1.0e37)));
}

/** The neighbour at g, or the center point where there is none (one-sided differences). */
vec3 hcNeighbour(ivec2 g, vec3 center) {
  if (any(lessThan(g, ivec2(0))) || any(greaterThanEqual(g, uGrid))) return center;
  vec3 p = hcPoint(g);
  return hcHidden(p) ? center : p;
}

void main() {
  int tri = gl_VertexID / 3;
  int corner = gl_VertexID - tri * 3;
  int cell = tri / 2;
  int half_ = tri - cell * 2;
  ivec2 cells = uGrid - 1;
  ivec2 c = uOrder.z == 1 ? ivec2(cell / cells.y, cell - (cell / cells.y) * cells.y)
                          : ivec2(cell - (cell / cells.x) * cells.x, cell / cells.x);
  if (uOrder.x == 1) c.x = cells.x - 1 - c.x;
  if (uOrder.y == 1) c.y = cells.y - 1 - c.y;
  ivec2 k1 = c + (half_ == 0 ? ivec2(1, 0) : ivec2(1, 1));
  ivec2 k2 = c + (half_ == 0 ? ivec2(1, 1) : ivec2(0, 1));
  vec3 p0 = hcPoint(c);
  vec3 p1 = hcPoint(k1);
  vec3 p2 = hcPoint(k2);
  if (hcHidden(p0) || hcHidden(p1) || hcHidden(p2)) {
    // A gap: the whole triangle (every corner computes the same) leaves the clip volume.
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  ivec2 g = corner == 0 ? c : corner == 1 ? k1 : k2;
  vec3 p = corner == 0 ? p0 : corner == 1 ? p1 : p2;
  vec3 dx = (hcNeighbour(g + ivec2(1, 0), p) - hcNeighbour(g - ivec2(1, 0), p)) * uWorldScale;
  vec3 dy = (hcNeighbour(g + ivec2(0, 1), p) - hcNeighbour(g - ivec2(0, 1), p)) * uWorldScale;
  vec3 n = cross(dx, dy);
  vNormal = dot(n, n) > 0.0 ? mat3(viewMatrix) * normalize(n) : vec3(0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vLocal = p;
  vViewPos = mv.xyz;
  vGrid = vec2(g);
#ifdef HC_INTENSITY
  vValue = uColorByZ == 1 ? p.z : texelFetch(uValue, g, 0).r;
#endif
  gl_Position = projectionMatrix * mv;
#ifdef PICKING
  vPickId = uPickBase + uint(g.y * uGrid.x + g.x);
#endif
}
`;

/** GLSL spliced into the mesh fragment shader (see the module comment). */
export const SURFACE_FRAGMENT_HOOKS = {
  fragmentDecl: /* glsl */ `
in vec2 vGrid;
uniform sampler2D uAlphaLut;
uniform float uAlphaScale;
uniform vec4 uIso[3];
uniform vec4 uIsoColor[3];
uniform vec3 uIsoTint;
uniform vec3 uHiLevel;
uniform vec3 uHiWidth;
uniform vec4 uHiColor[3];
uniform vec4 uWire;
uniform vec4 uWireColor;
uniform float uHideSurface;

/** Coverage of a line at 'level' of 'v', 'w' px wide ('fw': v's change per px). */
float hcLine(float v, float level, float w, float fw) {
  float d = abs(v - level) / max(fw, 1.0e-30);
  return clamp(0.5 * w + 0.5 - d, 0.0, 1.0);
}

/** Coverage of the nearest of the levels iso = (start, size, count, width px). */
float hcIso(float v, vec4 iso, float fw) {
  if (iso.w <= 0.0) return 0.0;
  float k = clamp(floor((v - iso.x) / iso.y + 0.5), 0.0, iso.z - 1.0);
  return hcLine(v, iso.x + k * iso.y, iso.w, fw);
}
`,
  color: /* glsl */ `
  vec4 hcBase = color;
#ifdef HC_INTENSITY
  if (uAlphaScale > 0.5) {
    float ta = clamp((vValue - uCRange.x) / (uCRange.y - uCRange.x), 0.0, 1.0);
    color.a *= texture(uAlphaLut, vec2((ta * 255.0 + 0.5) / 256.0, 0.5)).r;
  }
#endif
`,
  lit: /* glsl */ `
  {
    // Change per px (gradient length): lines keep their width at any slope and angle.
    vec3 dlx = dFdx(vLocal);
    vec3 dly = dFdy(vLocal);
    vec3 fw = sqrt(dlx * dlx + dly * dly);
    vec2 dgx = dFdx(vGrid);
    vec2 dgy = dFdy(vGrid);
    vec2 fg = sqrt(dgx * dgx + dgy * dgy);
    // Lines over the surface: wireframe, contours, highlights (later ones on top).
    float cover = 0.0;
    vec4 lineColor = vec4(0.0);
    if (uWire.w > 0.0) {
      vec2 d = abs(fract(vGrid / uWire.xy - 0.5) - 0.5) * uWire.xy / max(fg, vec2(1.0e-30));
      float cw = clamp(0.5 * uWire.z + 0.5 - min(d.x, d.y), 0.0, 1.0);
      if (cw > 0.0) {
        lineColor = uWireColor;
        cover = cw;
      }
    }
    for (int a = 0; a < 3; a++) {
      float ca = hcIso(vLocal[a], uIso[a], fw[a]);
      if (ca > 0.0) {
        lineColor = mix(vec4(hcBase.rgb, 1.0), uIsoColor[a], uIsoTint[a]);
        cover = max(cover, ca);
      }
    }
    for (int a = 0; a < 3; a++) {
      if (uHiWidth[a] <= 0.0) continue;
      float ch = hcLine(vLocal[a], uHiLevel[a], uHiWidth[a], fw[a]);
      if (ch > 0.0) {
        lineColor = uHiColor[a];
        cover = max(cover, ch);
      }
    }
    float la = cover * lineColor.a;
    if (uHideSurface > 0.5) {
      if (la <= 0.0) discard;
      color = vec4(lineColor.rgb, la * uOpacity);
    } else {
      color.rgb = mix(color.rgb, lineColor.rgb, la);
      color.a = mix(color.a, uOpacity, la);
    }
  }
`,
} as const;
