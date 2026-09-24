/**
 * Interaction settings (plan E6.1–E6.4, E5.7): the layout attributes hover, zoom and selection read,
 * and the built-in `fx` component that declares the ones core's layout schema does not have yet.
 *
 * `hovermode` and `dragmode` are core layout attributes. `hoverdistance`, `spikedistance`,
 * `clickmode`, `selectdirection` and `hoverlabel` are declared here as the `fx` component's
 * `layoutSchema`, so they get validation, template defaults and edit types like any other layout
 * attribute. Charts register the component into their registry on creation (see `ensureFx`).
 *
 * Attributes that belong inside other containers — trace `hoverinfo` /
 * `hovertext` / `hovertemplate` / `hoverlabel` / `hoveron` / `selectedpoints`, config
 * `hoverRenderer` — are read from the defaulted object when its schema has them and from the input
 * otherwise, until they move into core's axis / common trace / config schemas.
 */
import {
  attr,
  getIn,
  type FullConfig,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import type { ComponentModule } from '../contracts.ts';
import type { ChartRegistry } from '../registry.ts';

/** `hovermode` values (Plotly semantics). */
export type Hovermode = false | 'closest' | 'x' | 'y' | 'x unified' | 'y unified';

/** The shape-drawing `dragmode`s (E5.5): a drag on a cartesian subplot draws a new shape. */
export type DrawDragmode =
  'drawline' | 'drawopenpath' | 'drawclosedpath' | 'drawcircle' | 'drawrect';

/**
 * `dragmode` values. `orbit` / `turntable` are for 3D scenes and act like `false` in 2D. The draw
 * modes ({@link DrawDragmode}) hand the gesture to component views (`ComponentView.drawShape`).
 */
export type Dragmode =
  false | 'zoom' | 'pan' | 'select' | 'lasso' | 'orbit' | 'turntable' | DrawDragmode;

/** The shape-drawing `dragmode`s, in Plotly's modebar order. */
export const DRAW_DRAGMODES: readonly DrawDragmode[] = [
  'drawline',
  'drawopenpath',
  'drawclosedpath',
  'drawcircle',
  'drawrect',
];

/** Whether `mode` is a shape-drawing `dragmode`. */
export function isDrawDragmode(mode: unknown): mode is DrawDragmode {
  return DRAW_DRAGMODES.includes(mode as DrawDragmode);
}

/** What `config.doubleClick` does on the plot area. */
export type DoubleClickAction = false | 'reset' | 'autosize' | 'reset+autosize';

function fontObject(description: string) {
  return attr.object(
    {
      family: attr.string({ noBlank: true, strict: true, description: 'CSS font-family list.' }),
      size: attr.number({ min: 1, description: 'Font size in CSS pixels.' }),
      color: attr.color({ description: 'Text color.' }),
    },
    { description, editType: 'none' },
  );
}

/** Layout attributes of the `fx` component (hover labels, hover distance, click and select modes). */
export const fxLayoutAttributes = {
  hoverdistance: attr.number({
    min: -1,
    dflt: 20,
    editType: 'none',
    description:
      'Maximum distance (px) from the pointer to a point for it to be hovered. `-1` means no limit; `0` turns hover off for area-like traces only.',
  }),
  spikedistance: attr.number({
    min: -1,
    dflt: -1,
    editType: 'none',
    description: 'Maximum distance (px) for spikelines (E3.10). `-1` means no limit.',
  }),
  clickmode: attr.flaglist({
    flags: ['event', 'select'],
    extras: ['none'],
    dflt: 'event',
    editType: 'none',
    description:
      '`event` emits `click` with the points under the pointer; `select` also selects them (shift adds to the selection).',
  }),
  selectdirection: attr.enumerated({
    values: ['h', 'v', 'd', 'any'],
    dflt: 'any',
    editType: 'none',
    description:
      'Box selection direction: horizontal only (`h`), vertical only (`v`), whichever the drag started in (`d`), or free (`any`).',
  }),
  hoverlabel: attr.object(
    {
      bgcolor: attr.color({ description: 'Label background. Defaults to the point color.' }),
      bordercolor: attr.color({
        description: 'Label border. Defaults to a color contrasting with the background.',
      }),
      font: fontObject('Label font. Defaults to `layout.font` at 13 px.'),
      grouptitlefont: fontObject('Title font of unified labels (`x unified`, `y unified`).'),
      align: attr.enumerated({
        values: ['left', 'right', 'auto'],
        dflt: 'auto',
        description: 'Text alignment inside labels.',
      }),
      namelength: attr.integer({
        min: -1,
        dflt: 15,
        description: 'Characters of the trace name shown (`-1`: all, `0`: none).',
      }),
      showarrow: attr.boolean({ dflt: true, description: 'Draw the arrow pointing at the point.' }),
    },
    { editType: 'none', description: 'Default hover label style (traces override it).' },
  ),
} as const;

/** The built-in `fx` component: declares the interaction layout attributes (no drawing). */
export const fxComponent: ComponentModule = {
  name: 'fx',
  layoutSchema: fxLayoutAttributes,
};

/** Register {@link fxComponent} into `registry` unless a component named `fx` is already there. */
export function ensureFx(registry: ChartRegistry): void {
  if (!registry.getComponent('fx')) registry.register(fxComponent);
}

/** Interaction settings resolved from the defaulted figure. */
export interface FxSettings {
  readonly hovermode: Hovermode;
  /** Px; `Infinity` for `hoverdistance: -1`. */
  readonly hoverdistance: number;
  readonly dragmode: Dragmode;
  readonly clickEvent: boolean;
  readonly clickSelect: boolean;
  readonly selectdirection: 'h' | 'v' | 'd' | 'any';
  /** `config.scrollZoom` allows cartesian subplots. */
  readonly scrollZoom: boolean;
  readonly doubleClick: DoubleClickAction;
  readonly doubleClickDelay: number;
  /** No interaction at all (`config.staticPlot`). */
  readonly staticPlot: boolean;
}

function enumOf<T>(value: unknown, allowed: readonly T[], dflt: T): T {
  return allowed.includes(value as T) ? (value as T) : dflt;
}

const HOVERMODES: readonly Hovermode[] = [false, 'closest', 'x', 'y', 'x unified', 'y unified'];
const DRAGMODES: readonly Dragmode[] = [
  false,
  'zoom',
  'pan',
  'select',
  'lasso',
  'orbit',
  'turntable',
  ...DRAW_DRAGMODES,
];

/** Whether a `scrollZoom` config value enables wheel zoom on cartesian subplots. */
export function scrollZoomCartesian(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return value.split('+').includes('cartesian');
}

/**
 * Resolve the interaction settings. `layoutIn` backs up attributes missing from `fullLayout`
 * (a registry without the `fx` component).
 */
export function resolveFxSettings(
  fullLayout: FullLayout | undefined,
  fullConfig: FullConfig | undefined,
  layoutIn: Readonly<Record<string, unknown>> = {},
): FxSettings {
  const pick = (key: string): unknown =>
    fullLayout && key in fullLayout ? fullLayout[key] : layoutIn[key];
  const distance = Number(pick('hoverdistance') ?? 20);
  const clickmode = String(pick('clickmode') ?? 'event').split('+');
  const config = (fullConfig ?? {}) as Record<string, unknown>;
  return {
    hovermode: enumOf(pick('hovermode') ?? 'closest', HOVERMODES, 'closest'),
    hoverdistance: distance < 0 || !Number.isFinite(distance) ? Infinity : distance,
    dragmode: enumOf(pick('dragmode') ?? 'zoom', DRAGMODES, 'zoom'),
    clickEvent: clickmode.includes('event'),
    clickSelect: clickmode.includes('select'),
    selectdirection: enumOf(pick('selectdirection'), ['h', 'v', 'd', 'any'] as const, 'any'),
    scrollZoom: scrollZoomCartesian(config['scrollZoom']),
    doubleClick: enumOf(
      config['doubleClick'] ?? 'reset+autosize',
      [false, 'reset', 'autosize', 'reset+autosize'] as const,
      'reset+autosize',
    ),
    doubleClickDelay: Number(config['doubleClickDelay'] ?? 300),
    staticPlot: config['staticPlot'] === true,
  };
}

/**
 * A trace attribute from the defaulted trace, falling back to the input trace when the trace's
 * schema does not declare it (yet).
 */
export function traceAttr(fullTrace: FullTrace, input: unknown, path: string): unknown {
  const v = getIn(fullTrace, path);
  if (v !== undefined) return v;
  return input !== null && typeof input === 'object' ? getIn(input, path) : undefined;
}

/** Per-point value of a possibly array-valued (`arrayOk`) attribute. */
export function perPoint(value: unknown, index: number): unknown {
  if (Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView))) {
    return (value as ArrayLike<unknown>)[index];
  }
  return value;
}
