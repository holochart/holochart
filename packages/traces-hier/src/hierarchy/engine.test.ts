import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildHierarchy, type Hierarchy, type HierarchyInput } from './build.ts';
import { calcHierarchy } from './calc.ts';
import { hierarchyColorway, resolveHierarchyColors } from './colors.ts';
import {
  formatNodePercent,
  formatNodeValue,
  nodeContext,
  nodeEventFields,
  nodeHoverText,
  nodeLabels,
  nodePath,
  nodeText,
  nodeValues,
} from './format.ts';
import { drillEntry, findEntry, levelWindow, partition } from './levels.ts';

const EVE = {
  labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
  parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
  values: [10, 14, 12, 10, 2, 6, 6, 4, 4],
};

function tree(input: Partial<HierarchyInput> = EVE): Hierarchy {
  return buildHierarchy({ labels: [], parents: [], type: 'sunburst', name: 't', ...input })
    .hierarchy!;
}

const node = (h: Hierarchy, id: string) => h.nodes.find((n) => n.id === id)!;

const trace = (extra: Record<string, unknown> = {}): FullTrace =>
  ({
    type: 'sunburst',
    visible: true,
    _index: 0,
    _input: {},
    _module: undefined,
    ...EVE,
    ...extra,
  }) as FullTrace;

describe('levels', () => {
  const h = tree();

  it('finds the entry for a level, the root for unset or unknown levels', () => {
    expect(findEntry(h, 'Seth').id).toBe('Seth');
    expect(findEntry(h, '').id).toBe('Eve');
    expect(findEntry(h, undefined).id).toBe('Eve');
    expect(findEntry(h, 'nobody').id).toBe('Eve');
  });

  it('drills into branches, up from the entry, and not on the root or leaves', () => {
    expect(drillEntry(h, node(h, 'Seth'), h.root)?.id).toBe('Seth');
    expect(drillEntry(h, node(h, 'Seth'), node(h, 'Seth'))?.id).toBe('Eve');
    expect(drillEntry(h, h.root, h.root)).toBeUndefined();
    expect(drillEntry(h, node(h, 'Cain'), h.root)).toBeUndefined();
    expect(drillEntry(h, node(h, 'Cain'), h.root, { leaves: true })?.id).toBe('Cain');
  });

  it('windows the levels drawn by maxdepth, skipping a generated root', () => {
    expect(levelWindow(h, h.root, -1)).toEqual({
      skipEntry: false,
      offset: 0,
      levels: 3,
      cutoff: Infinity,
    });
    expect(levelWindow(h, h.root, 2)).toMatchObject({ levels: 2, cutoff: 2 });
    expect(levelWindow(h, node(h, 'Seth'), 5)).toMatchObject({ levels: 2, cutoff: 5 });
    const multi = tree({ labels: ['A', 'B', 'a'], parents: ['', '', 'A'] });
    expect(levelWindow(multi, multi.root, 1)).toEqual({
      skipEntry: true,
      offset: 1,
      levels: 1,
      cutoff: 2,
    });
  });

  it('partitions like d3: one unit per level, spans by value, remainders left as gaps', () => {
    const cells = partition(h.root, 68, 3);
    const at = (id: string) => cells.find((c) => c.node.id === id)!;
    expect(at('Eve')).toMatchObject({ x0: 0, x1: 68, y0: 0, y1: 1, depth: 0 });
    expect(at('Seth')).toMatchObject({ x0: 0, x1: 24, y0: 1, y1: 2 });
    expect(at('Cain')).toMatchObject({ x0: 24, x1: 38 });
    expect(at('Azura').x1).toBe(58);
    expect(at('Noam')).toMatchObject({ x0: 10, x1: 12, y0: 2, y1: 3, depth: 2 });
    const sub = partition(node(h, 'Seth'), 1, 1);
    expect(sub.map((c) => [c.node.id, c.depth])).toEqual([
      ['Seth', 0],
      ['Enos', 1],
      ['Noam', 1],
    ]);
  });

  it('partition cells nest in their parents (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(), fc.nat({ max: 50 })), { minLength: 1, maxLength: 30 }),
        (rows) => {
          const h2 = tree({
            labels: rows.map((_, i) => `n${i}`),
            parents: rows.map(([p], i) => (i === 0 ? '' : `n${p % i}`)),
            values: rows.map(([, v]) => v),
          });
          const cells = partition(h2.root, 1, 1);
          const cellOf = new Map(cells.map((c) => [c.node, c]));
          for (const c of cells) {
            const parent = c.node.parent && cellOf.get(c.node.parent);
            if (!parent) continue;
            expect(c.x0).toBeGreaterThanOrEqual(parent.x0 - 1e-9);
            expect(c.x1).toBeLessThanOrEqual(parent.x1 + 1e-9);
            expect(c.y0).toBeCloseTo(parent.y1, 9);
          }
        },
      ),
    );
  });
});

describe('format', () => {
  const h = tree();
  const ctx = nodeContext(h, h.root, undefined);
  const enos = node(h, 'Enos');

  it("formats values like pie and percentages whole, pie's way when they round to 0%", () => {
    expect(formatNodeValue(12345.5)).toBe('12,345.5');
    expect(formatNodePercent(10 / 24)).toBe('42%');
    expect(formatNodePercent(0.001)).toBe('0.1%');
    expect(formatNodePercent(1)).toBe('100%');
  });

  it("paths list the ancestors' labels, each followed by '/'", () => {
    expect(nodePath(h.root)).toBe('/');
    expect(nodePath(node(h, 'Seth'))).toBe('Eve/');
    expect(nodePath(enos)).toBe('Eve/Seth/');
  });

  it('builds textinfo labels in Plotly order, naming percentages only when there are several', () => {
    const t = trace({ textinfo: 'label+value+percent parent' });
    expect(nodeText(t, enos, ctx)).toBe('Enos<br>10<br>42%');
    const several = trace({ textinfo: 'percent parent+percent root+current path', text: ['x'] });
    expect(nodeText(several, enos, ctx)).toBe('Eve/Seth/<br>42% of parent<br>15% of root');
    const root = trace({ textinfo: 'label+value+current path+percent root+text', text: 'hi' });
    expect(nodeText(root, h.root, ctx)).toBe('Eve<br>10<br>hi');
    expect(nodeText(trace({ textinfo: 'none' }), enos, ctx)).toBe('');
  });

  it('fills texttemplate with the node variables and formats', () => {
    const t = trace({ texttemplate: '%{label}: %{percentRoot:.1%} of %{root} (%{value}) %{nope}' });
    expect(nodeText(t, enos, ctx)).toBe('Enos: 14.7% of Eve (10) ');
    expect(nodeValues(t, enos, ctx)).toMatchObject({
      label: 'Enos',
      value: 10,
      currentPath: 'Eve/Seth/',
      parent: 'Seth',
      entry: 'Eve',
      root: 'Eve',
    });
    expect(nodeLabels(enos, ctx)).toEqual({
      value: '10',
      percentParent: '42%',
      percentEntry: '15%',
      percentRoot: '15%',
    });
  });

  it('builds hover text from hoverinfo, dropping repeated percentages', () => {
    const all = trace({ hoverinfo: 'all' });
    expect(nodeHoverText(all, enos, ctx)).toBe(
      'Enos<br>10<br>Eve/Seth/<br>42% of Seth<br>15% of Eve',
    );
    expect(nodeHoverText(all, h.root, ctx)).toBe('Eve<br>10<br>100% of Eve');
    const seth = nodeContext(h, node(h, 'Seth'), undefined);
    expect(
      nodeHoverText(trace({ hoverinfo: 'percent entry+text', hovertext: 'H' }), enos, seth),
    ).toBe('42% of Seth<br>H');
    expect(nodeHoverText(trace({ hoverinfo: 'skip' }), enos, ctx)).toBe('');
  });

  it('reports Plotly event fields', () => {
    const fields = nodeEventFields(
      trace({ customdata: EVE.labels.map((l) => l.length) }),
      enos,
      ctx,
    );
    expect(fields).toEqual({
      currentPath: 'Eve/Seth/',
      root: 'Eve',
      entry: 'Eve',
      percentRoot: 10 / 68,
      percentEntry: 10 / 68,
      percentParent: 10 / 24,
      parent: 'Seth',
      label: 'Enos',
      value: 10,
      customdata: 4,
    });
    expect(nodeEventFields(trace(), h.root, ctx)['parent']).toBe('');
  });

  it("uses the chart's separators", () => {
    const layout = { _locale: { separators: ',.' } } as unknown as FullLayout;
    const t = trace({ textinfo: 'value+percent root' });
    const big = tree({ labels: ['R', 'A'], parents: ['', 'R'], values: [12345.5, 1] });
    const c = nodeContext(big, big.root, layout);
    expect(nodeText(t, node(big, 'A'), c)).toBe('1<br>0,0081%');
    expect(nodeText(t, big.root, c)).toBe('12.345,5');
  });
});

describe('colors', () => {
  const layout = { colorway: ['#111111', '#222222', '#333333'] } as unknown as FullLayout;

  it('gives first-level nodes the colorway in order, deeper nodes their parent color', () => {
    const t = trace();
    const calc = calcHierarchy(t, { fullLayout: layout });
    resolveHierarchyColors([{ trace: t, ...calc }], layout, 'sunburst');
    const h = calc.hierarchy!;
    const way = hierarchyColorway(layout, 'sunburst');
    expect(way.length).toBe(9);
    expect(h.root.children.map((n) => n.color)).toEqual(way.slice(0, 5));
    expect(node(h, 'Enos').color).toBe(node(h, 'Seth').color);
    expect(node(h, 'Enoch').color).toBe(node(h, 'Awan').color);
    expect(h.root.color).toBe('rgba(0, 0, 0, 0)');
  });

  it('shares colors by id across traces; explicit colors register first', () => {
    const a = trace({ marker: { colors: ['', 'red'] }, root: { color: 'white' } });
    const b = trace({ labels: ['R', 'Cain', 'Zed'], parents: ['', 'R', 'R'], values: [0, 1, 2] });
    const ca = calcHierarchy(a, { fullLayout: layout });
    const cb = calcHierarchy(b, { fullLayout: layout });
    resolveHierarchyColors(
      [
        { trace: a, ...ca },
        { trace: b, ...cb },
      ],
      layout,
      'sunburst',
    );
    expect(node(ca.hierarchy!, 'Cain').color).toBe('rgb(255, 0, 0)');
    expect(node(cb.hierarchy!, 'Cain').color).toBe('rgb(255, 0, 0)');
    expect(ca.hierarchy!.root.color).toBe('rgb(255, 255, 255)');
    // Four first-level colors were used by trace a (Cain is explicit).
    expect(node(cb.hierarchy!, 'Zed').color).toBe(hierarchyColorway(layout, 'sunburst')[4]);
  });

  it('colors every node through the colorscale, non-numbers as #444', () => {
    const t = trace({
      _hasColorscale: true,
      marker: {
        colors: [0, 1, 2, 3, 4, 5, 6, 7, 'blue'],
        colorscale: [
          [0, '#000000'],
          [1, '#ffffff'],
        ],
        cauto: true,
        autocolorscale: false,
      },
    });
    const calc = calcHierarchy(t, { fullLayout: layout });
    const h = calc.hierarchy!;
    expect(h.root.color).toBe('rgb(0, 0, 0)');
    expect(node(h, 'Enoch').color).toBe('rgb(255, 255, 255)');
    expect(node(h, 'Azura').color).toBe('rgb(0, 0, 255)');
    const counts = trace({ values: undefined, _hasColorscale: true, marker: { cauto: true } });
    const byCount = calcHierarchy(counts, { fullLayout: layout }).hierarchy!;
    expect(byCount.root.color).not.toBe(node(byCount, 'Cain').color);
  });
});
