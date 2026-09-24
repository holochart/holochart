/**
 * Which modebar buttons a chart shows (plan E5.8): pure resolution from config, `layout.modebar`
 * and what the figure contains, so it is unit-testable without a DOM or a chart.
 *
 * The default cartesian set follows Plotly v2:
 *
 * ```
 * [toImage] | [zoom2d, pan2d, select2d, lasso2d] | [zoomIn2d, zoomOut2d, autoScale2d, resetScale2d]
 * ```
 *
 * `select2d`/`lasso2d` appear only when a visible trace can select points; the hover and spike
 * buttons only when asked for by name (`config.modeBarButtonsToAdd`, `layout.modebar.add`), and
 * so do the shape-drawing buttons (`drawline`, `drawopenpath`, `drawclosedpath`, `drawcircle`,
 * `drawrect`, `eraseshape`), which join the drag group in the order they were added (Plotly).
 */
import type { Chart, DrawDragmode } from '@mk7s/holochart-runtime';
import { isModebarIcon, modebarIcons, type ModebarIcon } from './icons.ts';

/** Built-in button names this modebar implements (Plotly names). */
export const MODEBAR_BUILTIN_BUTTONS = [
  'toImage',
  'zoom2d',
  'pan2d',
  'select2d',
  'lasso2d',
  'zoomIn2d',
  'zoomOut2d',
  'autoScale2d',
  'resetScale2d',
  'hoverClosestCartesian',
  'hoverCompareCartesian',
  'toggleSpikelines',
  'drawline',
  'drawopenpath',
  'drawclosedpath',
  'drawcircle',
  'drawrect',
  'eraseshape',
] as const;

/** A built-in modebar button name. */
export type ModebarBuiltinName = (typeof MODEBAR_BUILTIN_BUTTONS)[number];

/**
 * How a button behaves: `action` buttons fire once; `dragmode`/`hovermode` buttons select a mode
 * (radio-like, shown pressed while their mode is active); `toggle` buttons flip a state.
 */
export type ModebarButtonKind = 'action' | 'dragmode' | 'hovermode' | 'toggle';

/**
 * A custom button, given as an object in `config.modeBarButtonsToAdd`.
 *
 * @example
 * ```ts
 * createChart(el, fig, {
 *   config: {
 *     modeBarButtonsToAdd: [
 *       { name: 'log', title: 'Log the chart', icon: modebarIcons.dot, click: (chart) => console.log(chart) },
 *     ],
 *   },
 * });
 * ```
 */
export interface ModebarCustomButton {
  /** Identifies the button (`modeBarButtonsToRemove` matches it, case-insensitively). */
  readonly name: string;
  /** Tooltip and accessible name. Default: `name`. */
  readonly title?: string;
  /** Default: a dot. */
  readonly icon?: ModebarIcon;
  /** Called on activation (mouse, touch, Enter or Space). */
  click(chart: Chart, event: MouseEvent): void;
}

/** One resolved button. */
export interface ModebarButton {
  readonly name: string;
  /** Tooltip and accessible name (Plotly's titles for built-ins). */
  readonly title: string;
  readonly icon: ModebarIcon;
  readonly kind: ModebarButtonKind;
  /** Set for built-in buttons. */
  readonly builtin?: ModebarBuiltinName;
  /** Set for custom buttons. */
  readonly custom?: ModebarCustomButton;
  /** The `dragmode` a `dragmode` button selects. */
  readonly dragmode?: 'zoom' | 'pan' | 'select' | 'lasso' | DrawDragmode;
  /** The `hovermode` a `hovermode` button selects. */
  readonly hovermode?: 'closest' | 'x';
}

/** A visually separated run of buttons. */
export type ModebarButtonGroup = readonly ModebarButton[];

/** Inputs of {@link resolveModebarButtons}. */
export interface ModebarResolveInput {
  /** The (full) config: `modeBarButtonsToRemove`, `modeBarButtonsToAdd`. */
  readonly config?:
    | { readonly modeBarButtonsToRemove?: unknown; readonly modeBarButtonsToAdd?: unknown }
    | undefined;
  /** `fullLayout.modebar`: `add` / `remove` name lists. */
  readonly layoutModebar?: { readonly add?: unknown; readonly remove?: unknown } | undefined;
  /** The figure has cartesian axes. */
  readonly hasCartesian: boolean;
  /** Some visible trace's module can select points (`selectPoints`). */
  readonly hasSelectable: boolean;
  /** Every cartesian axis is `fixedrange` (drops zoom/pan and the zoom group, like Plotly). */
  readonly allAxesFixed?: boolean;
  /** Receives warnings about unknown or unsupported names (once per name). Default `console.warn`. */
  readonly warn?: (message: string) => void;
}

interface BuiltinSpec {
  readonly title: string;
  readonly icon: ModebarIcon;
  readonly kind: ModebarButtonKind;
  readonly dragmode?: ModebarButton['dragmode'];
  readonly hovermode?: ModebarButton['hovermode'];
}

const BUILTINS: Readonly<Record<ModebarBuiltinName, BuiltinSpec>> = {
  toImage: { title: 'Download plot as a PNG', icon: modebarIcons.camera, kind: 'action' },
  zoom2d: { title: 'Zoom', icon: modebarIcons.magnifier, kind: 'dragmode', dragmode: 'zoom' },
  pan2d: { title: 'Pan', icon: modebarIcons.move, kind: 'dragmode', dragmode: 'pan' },
  select2d: {
    title: 'Box Select',
    icon: modebarIcons.selectBox,
    kind: 'dragmode',
    dragmode: 'select',
  },
  lasso2d: { title: 'Lasso Select', icon: modebarIcons.lasso, kind: 'dragmode', dragmode: 'lasso' },
  zoomIn2d: { title: 'Zoom in', icon: modebarIcons.zoomIn, kind: 'action' },
  zoomOut2d: { title: 'Zoom out', icon: modebarIcons.zoomOut, kind: 'action' },
  autoScale2d: { title: 'Autoscale', icon: modebarIcons.expand, kind: 'action' },
  resetScale2d: { title: 'Reset axes', icon: modebarIcons.home, kind: 'action' },
  hoverClosestCartesian: {
    title: 'Show closest data on hover',
    icon: modebarIcons.tooltip,
    kind: 'hovermode',
    hovermode: 'closest',
  },
  hoverCompareCartesian: {
    title: 'Compare data on hover',
    icon: modebarIcons.tooltips,
    kind: 'hovermode',
    hovermode: 'x',
  },
  toggleSpikelines: { title: 'Toggle Spike Lines', icon: modebarIcons.spikelines, kind: 'toggle' },
  drawline: {
    title: 'Draw line',
    icon: modebarIcons.drawLine,
    kind: 'dragmode',
    dragmode: 'drawline',
  },
  drawopenpath: {
    title: 'Draw open freeform',
    icon: modebarIcons.drawOpenPath,
    kind: 'dragmode',
    dragmode: 'drawopenpath',
  },
  drawclosedpath: {
    title: 'Draw closed freeform',
    icon: modebarIcons.drawClosedPath,
    kind: 'dragmode',
    dragmode: 'drawclosedpath',
  },
  drawcircle: {
    title: 'Draw circle',
    icon: modebarIcons.drawCircle,
    kind: 'dragmode',
    dragmode: 'drawcircle',
  },
  drawrect: {
    title: 'Draw rectangle',
    icon: modebarIcons.drawRect,
    kind: 'dragmode',
    dragmode: 'drawrect',
  },
  eraseshape: { title: 'Erase active shape', icon: modebarIcons.eraseShape, kind: 'action' },
};

/** Build the descriptor of a built-in button. */
export function modebarBuiltinButton(name: ModebarBuiltinName): ModebarButton {
  return { name, builtin: name, ...BUILTINS[name] };
}

/**
 * Lower-cased names and Plotly aliases (`layout.modebar.remove` spellings such as `'zoom'`,
 * `'toimage'`, `'v1hovermode'`) → built-in buttons.
 */
const ALIASES: ReadonlyMap<string, readonly ModebarBuiltinName[]> = (() => {
  const map = new Map<string, readonly ModebarBuiltinName[]>();
  for (const name of MODEBAR_BUILTIN_BUTTONS) map.set(name.toLowerCase(), [name]);
  const extra: Record<string, readonly ModebarBuiltinName[]> = {
    zoom: ['zoom2d'],
    pan: ['pan2d'],
    select: ['select2d'],
    lasso: ['lasso2d'],
    zoomin: ['zoomIn2d'],
    zoomout: ['zoomOut2d'],
    autoscale: ['autoScale2d'],
    resetscale: ['resetScale2d'],
    hoverclosest: ['hoverClosestCartesian'],
    hovercompare: ['hoverCompareCartesian'],
    v1hovermode: ['hoverClosestCartesian', 'hoverCompareCartesian'],
  };
  for (const [alias, names] of Object.entries(extra)) map.set(alias, names);
  return map;
})();

/**
 * Plotly button names (lower-cased) this modebar does not implement yet (3D, geo, map, drawing,
 * …). Removing them is silently fine (figures written for Plotly often do); adding them warns.
 */
const UNSUPPORTED = new Set(
  [
    'sendDataToCloud',
    'editInChartStudio',
    'zoom3d',
    'pan3d',
    'orbitRotation',
    'tableRotation',
    'resetCameraDefault3d',
    'resetCameraLastSave3d',
    'hoverClosest3d',
    'zoomInGeo',
    'zoomOutGeo',
    'resetGeo',
    'hoverClosestGeo',
    'hoverClosestGl2d',
    'hoverClosestPie',
    'toggleHover',
    'resetViews',
    'resetViewMapbox',
    'resetViewMap',
    'zoomInMapbox',
    'zoomOutMapbox',
    'zoomInMap',
    'zoomOutMap',
    'resetSankeyGroup',
    'togglehover',
    'resetview',
    'resetviews',
  ].map((n) => n.toLowerCase()),
);

/** Shape-drawing buttons: added by name only, into the drag group (Plotly's `DRAW_MODES`). */
const DRAW_BUTTONS: ReadonlySet<ModebarBuiltinName> = new Set([
  'drawline',
  'drawopenpath',
  'drawclosedpath',
  'drawcircle',
  'drawrect',
  'eraseshape',
]);

/** Buttons that may only be added by name, in the order of their trailing group. */
const OPT_IN: readonly ModebarBuiltinName[] = [
  'hoverClosestCartesian',
  'hoverCompareCartesian',
  'toggleSpikelines',
];

const DRAG_GROUP: readonly ModebarBuiltinName[] = ['zoom2d', 'pan2d', 'select2d', 'lasso2d'];
const ZOOM_GROUP: readonly ModebarBuiltinName[] = [
  'zoomIn2d',
  'zoomOut2d',
  'autoScale2d',
  'resetScale2d',
];

const defaultWarn = (message: string): void => console.warn(message);
/** Names already warned about, per warn function (so tests with their own `warn` start fresh). */
const warnedBy = new WeakMap<(message: string) => void, Set<string>>();

function warnOnce(warn: (message: string) => void, key: string, message: string): void {
  let seen = warnedBy.get(warn);
  if (!seen) warnedBy.set(warn, (seen = new Set()));
  if (seen.has(key)) return;
  seen.add(key);
  warn(message);
}

/** A name list given as an array or a single string (Plotly's `layout.modebar.add` is arrayOk). */
function listOf(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value.flat();
  return typeof value === 'string' ? [value] : [];
}

function isCustomButton(value: unknown): value is ModebarCustomButton {
  if (value === null || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  return typeof rec['name'] === 'string' && typeof rec['click'] === 'function';
}

function customButton(button: ModebarCustomButton): ModebarButton {
  const title =
    typeof button.title === 'string' && button.title !== '' ? button.title : button.name;
  const icon = isModebarIcon(button.icon) ? button.icon : modebarIcons.dot;
  return { name: button.name, title, icon, kind: 'action', custom: button };
}

/**
 * Resolve the modebar's buttons: ordered groups, empty groups dropped.
 *
 * - Removal (`config.modeBarButtonsToRemove`, `layout.modebar.remove`) accepts built-in names and
 *   Plotly aliases case-insensitively (`'zoom'`, `'toimage'`, `'resetscale'`, …) and custom button
 *   names.
 * - Names to add (`config.modeBarButtonsToAdd` strings, `layout.modebar.add`): the hover and spike
 *   buttons form a trailing group; `select2d`/`lasso2d` join the drag group even without
 *   selectable traces. Cartesian buttons are ignored on figures without cartesian axes.
 * - Custom button objects from `config.modeBarButtonsToAdd` form their own last group.
 * - Unknown names are ignored, with one warning per name.
 */
export function resolveModebarButtons(input: ModebarResolveInput): ModebarButtonGroup[] {
  const warn = input.warn ?? defaultWarn;
  const removed = new Set<ModebarBuiltinName>();
  const removedOther = new Set<string>();
  for (const raw of [
    ...listOf(input.config?.modeBarButtonsToRemove),
    ...listOf(input.layoutModebar?.remove),
  ]) {
    if (typeof raw !== 'string') continue;
    const lower = raw.toLowerCase();
    const hit = ALIASES.get(lower);
    if (hit) for (const name of hit) removed.add(name);
    else if (!UNSUPPORTED.has(lower)) removedOther.add(lower);
  }

  const added = new Set<ModebarBuiltinName>();
  const customs: ModebarCustomButton[] = [];
  for (const raw of [
    ...listOf(input.config?.modeBarButtonsToAdd),
    ...listOf(input.layoutModebar?.add),
  ]) {
    if (typeof raw === 'string') {
      const lower = raw.toLowerCase();
      const hit = ALIASES.get(lower);
      if (hit) for (const name of hit) added.add(name);
      else if (UNSUPPORTED.has(lower)) {
        warnOnce(warn, `add:${lower}`, `[holochart] modebar button '${raw}' is not supported yet.`);
      } else {
        warnOnce(warn, `add:${lower}`, `[holochart] unknown modebar button '${raw}' ignored.`);
      }
    } else if (isCustomButton(raw)) {
      customs.push(raw);
    } else {
      warnOnce(
        warn,
        'add:invalid',
        '[holochart] modeBarButtonsToAdd: custom buttons need a string `name` and a `click` function.',
      );
    }
  }

  const customNames = new Set(customs.map((c) => c.name.toLowerCase()));
  for (const name of removedOther) {
    if (!customNames.has(name)) {
      warnOnce(warn, `remove:${name}`, `[holochart] unknown modebar button '${name}' to remove.`);
    }
  }

  const keep = (names: readonly ModebarBuiltinName[]): ModebarButton[] =>
    names.filter((n) => !removed.has(n)).map(modebarBuiltinButton);

  const groups: ModebarButton[][] = [keep(['toImage'])];
  if (input.hasCartesian) {
    const fixed = input.allAxesFixed === true;
    groups.push(
      keep([
        ...DRAG_GROUP.filter((n) => {
          if (n === 'select2d' || n === 'lasso2d') return input.hasSelectable || added.has(n);
          return !fixed;
        }),
        ...[...added].filter((n) => DRAW_BUTTONS.has(n)),
      ]),
      keep(fixed ? [] : ZOOM_GROUP),
      keep(OPT_IN.filter((n) => added.has(n))),
    );
  }

  const seen = new Set<string>();
  const custom: ModebarButton[] = [];
  for (const c of customs) {
    const lower = c.name.toLowerCase();
    if (removedOther.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    custom.push(customButton(c));
  }
  groups.push(custom);
  return groups.filter((g) => g.length > 0);
}

/** The state that decides which mode and toggle buttons are pressed. */
export interface ModebarActiveState {
  /** `fullLayout.dragmode`. */
  readonly dragmode?: unknown;
  /** `fullLayout.hovermode`. */
  readonly hovermode?: unknown;
  /** Spike lines are on (some cartesian axis has `showspikes: true`). */
  readonly spikelines?: boolean;
}

/**
 * Whether `button` is pressed (active), or `undefined` for buttons without a pressed state
 * (plain actions and custom buttons). The compare button is active for every "points at the same
 * x/y" hovermode, unified or not.
 */
export function modebarButtonActive(
  button: ModebarButton,
  state: ModebarActiveState,
): boolean | undefined {
  switch (button.kind) {
    case 'dragmode':
      return state.dragmode === button.dragmode;
    case 'hovermode':
      if (button.hovermode === 'closest') return state.hovermode === 'closest';
      return (
        state.hovermode === 'x' ||
        state.hovermode === 'y' ||
        state.hovermode === 'x unified' ||
        state.hovermode === 'y unified'
      );
    case 'toggle':
      return state.spikelines === true;
    default:
      return undefined;
  }
}

/**
 * A string identifying a button set (names in group order), to skip DOM rebuilds when nothing
 * changed. Custom buttons are prefixed so a custom `'zoom2d'` differs from the built-in one.
 */
export function modebarButtonsKey(groups: readonly ModebarButtonGroup[]): string {
  return groups
    .map((g) => g.map((b) => (b.custom ? `custom:${b.name}` : b.name)).join(','))
    .join('|');
}
