/**
 * The figure engine shared by the Express functions, following plotly.py's
 * `px._core.make_figure`: rows are grouped by the grouping columns (color, dash, symbol, pattern,
 * animation frame, facet row, facet column, line group), each group becomes one trace per trace
 * spec (the main trace and any marginals), and the groups' values pick the traces' styles, names,
 * legend entries, hover lines, subplots and frames.
 */
import { deepMerge } from '@mk7s/holochart-core';
import { isMissing, plainValue } from '../data/table.ts';
import type { ExpressFigure } from '../options.ts';
import type { Args, ColumnKey } from './args.ts';
import { animationControls, fixAnimationRanges } from './animation.ts';
import type { Config, GroupData, Grouper, TraceSpec } from './config.ts';
import { configureAxes, layoutGrid, type GridPlan } from './grid.ts';
import { decoratedLabel, groupValue, valueText } from './labels.ts';

type ValMap = Map<string, unknown> | 'identity';

interface Mapping {
  readonly grouper: Grouper;
  readonly column: string | undefined;
  readonly showInTraceName: boolean;
  readonly facet?: 'row' | 'col';
  readonly valMap: ValMap;
  readonly sequence: readonly unknown[];
}

const STYLE_OPTION: Record<string, { map: string; column: ColumnKey }> = {
  color: { map: 'colorDiscreteMap', column: 'color' },
  dash: { map: 'lineDashMap', column: 'lineDash' },
  symbol: { map: 'symbolMap', column: 'symbol' },
  pattern: { map: 'patternShapeMap', column: 'pattern' },
};

function makeMapping(args: Args, grouper: Grouper, continuousColor: boolean): Mapping {
  switch (grouper.variable) {
    case 'animationFrame':
    case 'lineGroup':
      return {
        grouper,
        column: args.cols[grouper.variable],
        showInTraceName: false,
        valMap: new Map(),
        sequence: [''],
      };
    case 'facetRow':
    case 'facetCol':
      return {
        grouper,
        column: args.cols[grouper.variable],
        showInTraceName: false,
        facet: grouper.variable === 'facetRow' ? 'row' : 'col',
        valMap: new Map(),
        sequence: [],
      };
    default: {
      const { map, column } = STYLE_OPTION[grouper.variable] as { map: string; column: ColumnKey };
      const given = args.options[map] as Record<string, string> | 'identity' | undefined;
      const sequence =
        grouper.variable === 'color'
          ? args.colorway
          : grouper.variable === 'dash'
            ? args.dashSequence
            : grouper.variable === 'symbol'
              ? args.symbolSequence
              : args.patternSequence;
      return {
        grouper,
        // A numeric color is a colorscale, not a grouping (px's `color_is_continuous`).
        column: grouper.variable === 'color' && continuousColor ? undefined : args.cols[column],
        showInTraceName: true,
        valMap: given === 'identity' ? 'identity' : new Map(Object.entries(given ?? {})),
        sequence,
      };
    }
  }
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) {
    const next = node[key];
    if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
      node = next as Record<string, unknown>;
    } else {
      const created: Record<string, unknown> = {};
      node[key] = created;
      node = created;
    }
  }
  node[keys[keys.length - 1] as string] = value;
}

const HISTOGRAMS = new Set(['histogram', 'histogram2d', 'histogram2dcontour']);

/** Trace attributes from a group's rows (px's `make_trace_kwargs`), with the hover template. */
function traceKwargs(
  args: Args,
  config: Config,
  spec: TraceSpec,
  group: GroupData,
  mappingLabels: Map<string, string>,
): Record<string, unknown> {
  const { table, cols } = args;
  const rows = group.rows;
  const patch = structuredClone(spec.patch) as Record<string, unknown>;
  const valuesOf = (column: string): unknown[] => {
    const all = table.column(column);
    return rows.map((i) => plainValue(all[i]));
  };
  let header = '';
  const customColumns = [...(args.lists.customData ?? [])];
  for (const role of spec.attrs) {
    // Undefined for roles that are not one column (dimensions, custom / hover data, marginals).
    const column = cols[role as ColumnKey];
    switch (role) {
      case 'marginalX':
      case 'marginalY':
        if (spec.type === 'histogram')
          mappingLabels.set('count', role === 'marginalX' ? '%{y}' : '%{x}');
        continue;
      case 'dimensions': {
        const names = args.lists.dimensions ?? [];
        patch['dimensions'] = names.map((name) => ({
          label: args.label(name),
          values: valuesOf(name),
          ...(spec.type === 'splom' ? { axis: { matches: true } } : {}),
        }));
        continue;
      }
      case 'customData':
        continue;
      case 'hoverData': {
        if (HISTOGRAMS.has(spec.type)) continue;
        const skip = new Set([cols.x, cols.y, cols.z, cols.base]);
        for (const name of args.lists.hoverData ?? []) {
          if (skip.has(name)) continue;
          let position = customColumns.indexOf(name);
          if (position < 0) {
            position = customColumns.length;
            customColumns.push(name);
          }
          mappingLabels.set(args.label(name), `%{customdata[${position}]}`);
        }
        continue;
      }
      default:
        break;
    }
    const label = decoratedLabel(args, config, column, role);
    const letter = role === 'x' || role === 'y' ? role : undefined;
    const computed = letter ? group.values?.[letter] : undefined;
    if (column === undefined && letter && computed) {
      // A computed axis without a column (an ECDF's cumulative values).
      patch[letter] = [...computed];
      mappingLabels.set(config.valueLabels?.[letter] ?? letter, `%{${letter}}`);
      continue;
    }
    if (column === undefined) {
      // A histogram's aggregated axis: px still lists it (`count=%{y}`).
      if (
        (spec.type === 'histogram' && (role === 'x' || role === 'y')) ||
        ((spec.type === 'histogram2d' || spec.type === 'histogram2dcontour') && role === 'z')
      ) {
        mappingLabels.set(label, `%{${role}}`);
      }
      continue;
    }
    const values = computed ? [...computed] : valuesOf(column);
    switch (role) {
      case 'size': {
        const marker = (patch['marker'] ??= {}) as Record<string, unknown>;
        marker['size'] = values;
        marker['sizemode'] = 'area';
        marker['sizeref'] = config.sizeref;
        mappingLabels.set(label, '%{marker.size}');
        break;
      }
      case 'hoverName':
        if (HISTOGRAMS.has(spec.type)) break;
        patch['hovertext'] = values;
        if (header === '') header = '<b>%{hovertext}</b><br><br>';
        break;
      case 'color': {
        if (config.continuousColor === 'pie') {
          const marker = (patch['marker'] ??= {}) as Record<string, unknown>;
          if (args.table.type(column) === 'numeric') {
            marker['colors'] = values;
            marker['coloraxis'] = 'coloraxis';
            mappingLabels.set(label, '%{color}');
          } else {
            // Discrete: the map's colors, then the sequence, per slice (px, per trace).
            const given = args.options['colorDiscreteMap'];
            const map = new Map<string, unknown>(
              given === 'identity' ? [] : Object.entries((given ?? {}) as Record<string, string>),
            );
            marker['colors'] = values.map((v) => {
              if (given === 'identity') return v;
              const key = valueText(v);
              if (!map.has(key)) map.set(key, args.colorway[map.size % args.colorway.length]);
              return map.get(key);
            });
          }
          break;
        }
        const target = config.continuousColor === 'line' ? 'line' : 'marker';
        const container = (patch[target] ??= {}) as Record<string, unknown>;
        container['color'] = values;
        if (config.inlineColorscale) {
          Object.assign(container, colorscaleAttributes(args), {
            showscale: true,
            colorbar: { title: { text: label } },
          });
        } else container['coloraxis'] = 'coloraxis';
        if (spec.type !== 'parcoords' && spec.type !== 'parcats') {
          mappingLabels.set(label, `%{${target}.color}`);
        }
        break;
      }
      case 'animationGroup':
        patch['ids'] = values;
        break;
      case 'errorX':
      case 'errorXMinus':
      case 'errorY':
      case 'errorYMinus': {
        const key = role.startsWith('errorX') ? 'error_x' : 'error_y';
        const bar = (patch[key] ??= {}) as Record<string, unknown>;
        bar[role.endsWith('Minus') ? 'arrayminus' : 'array'] = values;
        break;
      }
      case 'names':
        patch['labels'] = values;
        mappingLabels.set(label, '%{label}');
        break;
      case 'values':
        patch['values'] = values;
        mappingLabels.set(label, '%{value}');
        break;
      case 'text':
        patch['text'] = values;
        mappingLabels.set(label, '%{text}');
        break;
      default:
        patch[role] = values;
        mappingLabels.set(label, `%{${role}}`);
    }
  }
  if (customColumns.length > 0 && !HISTOGRAMS.has(spec.type)) {
    const columns = customColumns.map((c) => table.column(c));
    patch['customdata'] = rows.map((i) => columns.map((col) => plainValue(col[i])));
  }

  if (spec.type !== 'parcoords' && spec.type !== 'parcats' && spec.type !== 'splom') {
    // `hoverData` as an object: hide (`false`) or format (`':.2f'`) lines, by column.
    const lines: string[] = [];
    for (const [label, value] of mappingLabels) {
      const column = invertLabel(args, label);
      const how = column === undefined ? undefined : args.hoverFormats.get(column);
      if (how === false) continue;
      lines.push(`${label}=${typeof how === 'string' ? value.replace('}', `${how}}`) : value}`);
    }
    patch['hovertemplate'] = `${header}${lines.join('<br>')}<extra></extra>`;
  }
  return patch;
}

/** `colorscale`, and `cmin` / `cmax` / `cmid` from `rangeColor` / `colorContinuousMidpoint`. */
export function colorscaleAttributes(args: Args): Record<string, unknown> {
  const out: Record<string, unknown> = { colorscale: args.continuousScale };
  const mid = args.options['colorContinuousMidpoint'];
  if (mid !== undefined) out['cmid'] = mid;
  const range = args.options['rangeColor'] as readonly [number, number] | undefined;
  if (range) {
    out['cmin'] = range[0];
    out['cmax'] = range[1];
  }
  return out;
}

/** The column whose label is `label` (px's `invert_label`). */
function invertLabel(args: Args, label: string): string | undefined {
  const labels = (args.options['labels'] ?? {}) as Record<string, string>;
  for (const [column, text] of Object.entries(labels)) if (text === label) return column;
  return args.table.has(label) ? label : undefined;
}

/** Key of a group value in the style and facet maps: its text (map options have string keys). */
function mapKey(v: unknown): string {
  return valueText(v);
}

/**
 * Build the figure: group the rows, build the traces of every group and frame, lay out the
 * subplots (facets and marginals), configure the axes and the animation controls.
 */
export function buildFigure(args: Args, config: Config): ExpressFigure {
  const { table, options } = args;
  const continuous =
    config.continuousColor !== undefined &&
    args.cols.color !== undefined &&
    table.type(args.cols.color) === 'numeric';
  const mappings = config.groupers.map((g) => makeMapping(args, g, continuous));

  // Orders: `categoryOrders` first (all listed values), then first appearance (px).
  const orders = new Map<string, unknown[]>();
  for (const [column, listed] of Object.entries(
    (options['categoryOrders'] ?? {}) as Record<string, readonly unknown[]>,
  )) {
    orders.set(column, listed.map(groupValue));
  }
  const groupColumns = [...new Set(mappings.map((m) => m.column).filter((c) => c !== undefined))];
  for (const column of groupColumns) {
    const seen = new Set(orders.get(column) ?? []);
    const order = [...seen];
    for (const v of table.column(column)) {
      const g = groupValue(v);
      if (isMissing(g) || seen.has(g)) continue;
      seen.add(g);
      order.push(g);
    }
    orders.set(column, order);
  }

  // Style and facet maps: listed values take their entries first, then the sequence.
  let ncols = 1;
  let nrows = 1;
  const colLabels: string[] = [];
  const rowLabels: string[] = [];
  for (const m of mappings) {
    if (m.column === undefined) {
      if (m.valMap !== 'identity' && m.sequence.length > 0) m.valMap.set('', m.sequence[0]);
      continue;
    }
    const sorted = orders.get(m.column) ?? [];
    if (m.facet === 'col') {
      sorted.forEach((v) => colLabels.push(`${args.label(m.column as string)}=${valueText(v)}`));
      ncols = sorted.length;
    } else if (m.facet === 'row') {
      sorted.forEach((v) => rowLabels.push(`${args.label(m.column as string)}=${valueText(v)}`));
      nrows = sorted.length;
    }
    if (m.valMap === 'identity') continue;
    for (const v of sorted) {
      const key = mapKey(v);
      if (m.valMap.has(key)) continue;
      m.valMap.set(
        key,
        m.facet ? m.valMap.size + 1 : m.sequence[m.valMap.size % m.sequence.length],
      );
    }
  }

  // Groups, sorted by each grouping column's order.
  const columns = mappings.map((m) =>
    m.column === undefined ? undefined : table.column(m.column),
  );
  const rank = mappings.map((m) => {
    const order = m.column === undefined ? [] : (orders.get(m.column) ?? []);
    return new Map(order.map((v, i) => [JSON.stringify([v]), i]));
  });
  const groups = new Map<string, { values: unknown[]; rows: number[] }>();
  for (let i = 0; i < table.length; i++) {
    const values: unknown[] = [];
    let missing = false;
    for (const col of columns) {
      if (col === undefined) {
        values.push('');
        continue;
      }
      const g = groupValue(col[i]);
      if (isMissing(g)) {
        missing = true;
        break;
      }
      values.push(g);
    }
    // Rows with a missing grouping value are dropped, as pandas' group_by drops null keys.
    if (missing) continue;
    const key = JSON.stringify(values);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { values, rows: [] }));
    group.rows.push(i);
  }
  const sortKey = (values: readonly unknown[]) =>
    values.map((v, k) => rank[k]?.get(JSON.stringify([v])) ?? -1);
  const sortedGroups = [...groups.values()].sort((a, b) => {
    const ka = sortKey(a.values);
    const kb = sortKey(b.values);
    for (let k = 0; k < ka.length; k++) {
      const d = (ka[k] as number) - (kb[k] as number);
      if (d !== 0) return d;
    }
    return 0;
  });

  // Frames: every frame gets the same traces (empty where a group has no rows in that frame),
  // so frame traces line up with the figure's by index.
  const frameIndex = mappings.findIndex((m) => m.grouper.variable === 'animationFrame');
  const frameColumn = frameIndex >= 0 ? mappings[frameIndex]?.column : undefined;
  interface Slot {
    values: unknown[];
    rowsByFrame: Map<string, number[]>;
  }
  const slots: Slot[] = [];
  const slotByKey = new Map<string, Slot>();
  const frameValues: unknown[] = [];
  const frameSeen = new Set<string>();
  for (const group of sortedGroups) {
    const frameValue = frameColumn === undefined ? '' : group.values[frameIndex];
    const frameKey = JSON.stringify([frameValue]);
    if (!frameSeen.has(frameKey)) {
      frameSeen.add(frameKey);
      frameValues.push(frameValue);
    }
    const slotValues = group.values.map((v, k) => (k === frameIndex ? '' : v));
    const key = JSON.stringify(slotValues);
    let slot = slotByKey.get(key);
    if (!slot) {
      slot = { values: slotValues, rowsByFrame: new Map() };
      slotByKey.set(key, slot);
      slots.push(slot);
    }
    slot.rowsByFrame.set(frameKey, group.rows);
  }
  if (frameColumn !== undefined) {
    const frameRank = rank[frameIndex] as Map<string, number>;
    frameValues.sort(
      (a, b) =>
        (frameRank.get(JSON.stringify([a])) ?? -1) - (frameRank.get(JSON.stringify([b])) ?? -1),
    );
  }
  if (frameValues.length === 0) frameValues.push('');

  const wrap =
    (options['facetColWrap'] as number | undefined) &&
    !args.cols.facetRow &&
    !config.marginalX &&
    !config.marginalY
      ? Math.max(0, Math.floor(options['facetColWrap'] as number))
      : 0;
  if (config.marginalX && args.cols.facetRow) {
    throw new Error(`${args.fn}: marginalX cannot be combined with facetRow.`);
  }
  if (config.marginalY && args.cols.facetCol) {
    throw new Error(`${args.fn}: marginalY cannot be combined with facetCol.`);
  }
  const facetCount = ncols;
  if (wrap) {
    nrows = Math.ceil(ncols / wrap);
    ncols = Math.min(ncols, wrap);
  }
  if (config.marginalX) nrows += 1;
  if (config.marginalY) ncols += 1;

  let lastTraceNameLabels: string[] = [];
  const frames: { name: string; data: Record<string, unknown>[] }[] = [];
  /** Per frame, the cell of each trace: row from the top and column, 1-based. */
  const frameCells: [number, number][][] = [];
  for (const frameValue of frameValues) {
    const frameKey = JSON.stringify([frameValue]);
    const namesInFrame = new Set<string>();
    const data: Record<string, unknown>[] = [];
    const cells: [number, number][] = [];
    for (const slot of slots) {
      const rows = slot.rowsByFrame.get(frameKey) ?? [];
      const values = slot.values.map((v, k) => (k === frameIndex ? frameValue : v));
      const mappingLabels = new Map<string, string>();
      const traceNameLabels = new Map<string, string>();
      mappings.forEach((m, k) => {
        if (m.column === undefined) return;
        const key = args.label(m.column);
        if (m.valMap !== 'identity') {
          mappingLabels.set(key, valueText(values[k]));
          if (m.showInTraceName) traceNameLabels.set(key, valueText(values[k]));
        }
      });
      lastTraceNameLabels = [...traceNameLabels.keys()];
      const name = [...traceNameLabels.values()].join(', ');
      const groupData = config.transform ? config.transform(rows) : { rows };

      for (const [specIndex, spec] of config.specs.entries()) {
        const trace: Record<string, unknown> = { type: spec.type, name };
        if (!NO_LEGEND.has(spec.type)) {
          trace['legendgroup'] = name;
          trace['showlegend'] = name !== '' && !namesInFrame.has(name);
        }
        const barmode = config.layoutPatch?.['barmode'];
        if (ALIGNED.has(spec.type) && (barmode === 'group' || barmode === undefined)) {
          trace['alignmentgroup'] = 'True';
          trace['offsetgroup'] = name;
        }
        namesInFrame.add(name);

        let row = config.marginalX && spec.marginal !== 'x' ? 2 : 1;
        let col = spec.marginal === 'y' ? 2 : 1;
        mappings.forEach((m, k) => {
          const v = values[k];
          if (m.facet === 'row' && m.column !== undefined) {
            row = (m.valMap as Map<string, unknown>).get(mapKey(v)) as number;
            return;
          }
          if (m.facet === 'col' && m.column !== undefined) {
            col = (m.valMap as Map<string, unknown>).get(mapKey(v)) as number;
            if (wrap) {
              row = 1 + Math.floor((col - 1) / wrap);
              col = 1 + ((col - 1) % wrap);
            }
            return;
          }
          if (!('path' in m.grouper)) return;
          const variable = m.grouper.variable;
          // Marginal box / violin / histogram traces take the color only, on their markers.
          if (specIndex > 0 && spec.marginal && variable !== 'color') return;
          const style =
            m.valMap === 'identity' ? v : m.valMap.get(m.column === undefined ? '' : mapKey(v));
          if (style === undefined) return;
          setPath(trace, spec.marginal ? 'marker.color' : m.grouper.path, style);
        });
        cells.push([row, col]);
        const patch = traceKwargs(args, config, spec, groupData, new Map(mappingLabels));
        data.push(deepMerge(trace, patch) as Record<string, unknown>);
      }
    }
    frames.push({ name: valueText(frameValue), data });
    frameCells.push(cells);
  }

  const layout: Record<string, unknown> = {};
  if (continuous && !config.inlineColorscale) {
    const colorColumn = args.cols.color as string;
    layout['coloraxis'] = {
      colorbar: { title: { text: args.label(colorColumn) } },
      ...colorscaleAttributes(args),
    };
  }
  for (const key of ['height', 'width'] as const) {
    if (options[key] !== undefined) layout[key] = options[key];
  }
  const tl = (args.template?.layout ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const legend: Record<string, unknown> = { tracegroupgap: 0 };
  if (lastTraceNameLabels.length > 0) legend['title'] = { text: lastTraceNameLabels.join(', ') };
  if (args.cols.size !== undefined && tl['legend']?.['itemsizing'] === undefined) {
    legend['itemsizing'] = 'constant';
  }
  layout['legend'] = legend;
  if (options['title'] !== undefined) layout['title'] = { text: options['title'] };
  else if (tl['margin']?.['t'] === undefined) layout['margin'] = { t: 60 };
  for (const [key, value] of Object.entries(config.layoutPatch ?? {})) {
    if (value !== undefined) layout[key] = value;
  }
  if (options['template'] !== undefined) layout['template'] = options['template'];

  const plan: GridPlan = {
    nrows,
    ncols,
    wrap,
    facetCount,
    colLabels: args.cols.facetCol !== undefined ? colLabels : [],
    rowLabels: args.cols.facetRow !== undefined ? rowLabels : [],
    marginalX: config.marginalX,
    marginalY: config.marginalY,
    colorGiven: args.cols.color !== undefined,
    subplotType: config.subplotType ?? 'xy',
  };
  const grid = layoutGrid(args, plan);
  Object.assign(layout, grid.layout);
  frames.forEach((frame, f) =>
    frame.data.forEach((trace, i) => {
      const [row, col] = frameCells[f]?.[i] ?? [1, 1];
      grid.place(trace, row, col);
    }),
  );
  if (config.subplotType === undefined || config.subplotType === 'xy')
    configureAxes(args, config, plan, grid, layout, orders);

  const figure: ExpressFigure = { data: frames[0]?.data ?? [], layout };
  if (frames.length > 1) {
    figure.frames = frames;
    fixAnimationRanges(args, config, figure, grid);
    animationControls(args, figure);
  }
  return figure;
}

/** Traces px gives no `legendgroup` / `showlegend`. */
const NO_LEGEND = new Set(['parcoords', 'parcats', 'histogram2d']);
/** Traces px aligns in `offsetgroup`s (in `group` bar mode or without a bar mode). */
const ALIGNED = new Set(['bar', 'box', 'violin', 'histogram']);
