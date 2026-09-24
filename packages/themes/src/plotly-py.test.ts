import { describe, expect, it } from 'vitest';
import plotly from './__fixtures__/plotly-py/plotly.json' with { type: 'json' };
import plotlywhite from './__fixtures__/plotly-py/plotly_white.json' with { type: 'json' };
import plotlydark from './__fixtures__/plotly-py/plotly_dark.json' with { type: 'json' };
import simplewhite from './__fixtures__/plotly-py/simple_white.json' with { type: 'json' };
import ggplot2 from './__fixtures__/plotly-py/ggplot2.json' with { type: 'json' };
import seaborn from './__fixtures__/plotly-py/seaborn.json' with { type: 'json' };
import presentation from './__fixtures__/plotly-py/presentation.json' with { type: 'json' };
import xgridoff from './__fixtures__/plotly-py/xgridoff.json' with { type: 'json' };
import ygridoff from './__fixtures__/plotly-py/ygridoff.json' with { type: 'json' };
import gridon from './__fixtures__/plotly-py/gridon.json' with { type: 'json' };
import { THEMES } from './index.ts';

/**
 * The plotly.py-derived themes against plotly.py's own template files (`__fixtures__/plotly-py/`,
 * see its README). Colors compare by value (`#fff` = `rgb(255,255,255)`), arrays (colorways,
 * colorscales) as a whole.
 *
 * Known, intended differences:
 * - plotly.py sets `autotypenumbers: 'strict'` on the layout; Holochart has no layout-level
 *   `autotypenumbers`, so the themes set the same value on both axes.
 * - Layout blocks for features Holochart doesn't have yet (polar, ternary, geo, maps, 3D scenes,
 *   update menus, sliders) and trace types it doesn't register yet are skipped.
 */
const NAMES = [
  'plotly',
  'plotly_white',
  'plotly_dark',
  'simple_white',
  'ggplot2',
  'seaborn',
  'presentation',
  'xgridoff',
  'ygridoff',
  'gridon',
] as const;
const SKIP_LAYOUT =
  /^(polar|ternary|geo|mapbox|map|scene|updatemenudefaults|sliderdefaults|smith|autotypenumbers)(\.|$)/;
const PER_AXIS = /^[xy]axis\.autotypenumbers$/;
const TYPES = new Set(['scatter', 'bar', 'pie', 'table', 'histogram']);

type Tpl = { layout?: object; data?: Record<string, object[]> };

const FIXTURES: Record<string, unknown> = {
  plotly: plotly,
  plotly_white: plotlywhite,
  plotly_dark: plotlydark,
  simple_white: simplewhite,
  ggplot2: ggplot2,
  seaborn: seaborn,
  presentation: presentation,
  xgridoff: xgridoff,
  ygridoff: ygridoff,
  gridon: gridon,
};

function load(name: string): Tpl {
  return FIXTURES[name] as Tpl;
}

function norm(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(norm);
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgb(${r},${g},${b})`;
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(s.replace(/\s+/g, ''));
  if (rgb) {
    const p = rgb[1]!.split(',').map(Number);
    if (p.length === 4 && p[3] === 1) p.pop();
    return p.length === 4 ? `rgba(${p.join(',')})` : `rgb(${p.join(',')})`;
  }
  if (s === 'white') return 'rgb(255,255,255)';
  if (s === 'black') return 'rgb(0,0,0)';
  return v;
}

function flat(v: unknown, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (Array.isArray(v)) out.set(prefix, JSON.stringify(norm(v)));
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) flat(x, prefix ? `${prefix}.${k}` : k, out);
  } else out.set(prefix, JSON.stringify(norm(v)));
  return out;
}

function differences(name: (typeof NAMES)[number]): string[] {
  const ref = load(name);
  const ours = (THEMES as Record<string, Tpl>)[name]!;
  const diffs: string[] = [];
  const a = flat(ref.layout ?? {});
  const b = flat(ours.layout ?? {});
  for (const [k, v] of a) {
    if (SKIP_LAYOUT.test(k)) continue;
    if (b.get(k) !== v) diffs.push(`layout.${k}: ours ${b.get(k) ?? 'missing'}, plotly.py ${v}`);
  }
  for (const [k, v] of b) {
    if (!a.has(k) && !SKIP_LAYOUT.test(k) && !PER_AXIS.test(k))
      diffs.push(`layout.${k}: extra ${v}`);
  }
  for (const [type, items] of Object.entries(ref.data ?? {})) {
    if (!TYPES.has(type)) continue;
    items.forEach((item, i) => {
      const x = flat(item);
      const y = flat(ours.data?.[type]?.[i] ?? {});
      for (const [k, v] of x) {
        if (y.get(k) !== v)
          diffs.push(`data.${type}[${i}].${k}: ours ${y.get(k) ?? 'missing'}, plotly.py ${v}`);
      }
    });
  }
  return diffs;
}

describe('plotly.py themes match plotly.py', () => {
  it.each(NAMES)('%s', (name) => {
    expect(differences(name)).toEqual([]);
  });

  it('sets plotly.py’s layout-level autotypenumbers on both axes instead', () => {
    for (const name of NAMES) {
      const ref = load(name).layout as { autotypenumbers?: string } | undefined;
      if (ref?.autotypenumbers === undefined) continue;
      const layout = (THEMES as Record<string, Tpl>)[name]!.layout as Record<
        string,
        { autotypenumbers?: string }
      >;
      expect(layout['xaxis']?.autotypenumbers).toBe(ref.autotypenumbers);
      expect(layout['yaxis']?.autotypenumbers).toBe(ref.autotypenumbers);
    }
  });
});
