import { createScale, supplyDefaults } from '@mk7s/holochart-core';
import { IDENTITY_TRANSFORM } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  formatTemplate,
  type AxisInfo,
  type HoverContext,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { bar, type BarCalc } from './bar/index.ts';
import { timeline } from './timeline.ts';

const DAY = 86_400_000;
const utc = (m: number, d: number, h = 0): number => Date.UTC(2026, m - 1, d, h);

const TASKS = [
  { Task: 'Scope', Start: '2026-03-02', Finish: '2026-03-06', Owner: 'Ana', Pct: 100 },
  { Task: 'Design', Start: '2026-03-05', Finish: '2026-03-16', Owner: 'Ben', Pct: 80 },
  { Task: 'Build', Start: '2026-03-12', Finish: '2026-04-03', Owner: 'Ana', Pct: 30 },
  { Task: 'Test', Start: '2026-03-30', Finish: '2026-04-10', Owner: 'Cy', Pct: 0 },
];

describe('timeline', () => {
  it('builds one horizontal bar trace with date bases and ms lengths', () => {
    const { data, layout } = timeline({ data: TASKS, xStart: 'Start', xEnd: 'Finish', y: 'Task' });
    expect(data).toHaveLength(1);
    const t = data[0]!;
    expect(t).toMatchObject({
      type: 'bar',
      orientation: 'h',
      name: '',
      showlegend: false,
      base: ['2026-03-02', '2026-03-05', '2026-03-12', '2026-03-30'],
      x: [4 * DAY, 11 * DAY, 22 * DAY, 11 * DAY],
      y: ['Scope', 'Design', 'Build', 'Test'],
      hovertemplate: 'Start=%{base|%Y-%m-%d}<br>Finish=%{x|%Y-%m-%d}<br>Task=%{y}<extra></extra>',
    });
    expect(t['marker']).toBeUndefined();
    expect(t['textposition']).toBeUndefined();
    expect(layout).toEqual({
      barmode: 'overlay',
      xaxis: { type: 'date' },
      yaxis: {
        title: { text: 'Task' },
        categoryorder: 'array',
        categoryarray: ['Test', 'Build', 'Design', 'Scope'],
      },
    });
  });

  it('groups by color in order of first appearance or categoryOrders', () => {
    const fig = timeline({
      data: TASKS,
      xStart: 'Start',
      xEnd: 'Finish',
      y: 'Task',
      color: 'Owner',
    });
    expect(fig.data.map((t) => t['name'])).toEqual(['Ana', 'Ben', 'Cy']);
    expect(fig.data[0]).toMatchObject({
      legendgroup: 'Ana',
      showlegend: true,
      y: ['Scope', 'Build'],
      x: [4 * DAY, 22 * DAY],
      hovertemplate:
        'Owner=Ana<br>Start=%{base|%Y-%m-%d}<br>Finish=%{x|%Y-%m-%d}<br>Task=%{y}<extra></extra>',
    });
    expect(fig.layout['legend']).toEqual({ title: { text: 'Owner' } });
    // Rows keep their overall order, across groups.
    expect((fig.layout['yaxis'] as Record<string, unknown>)['categoryarray']).toEqual([
      'Test',
      'Build',
      'Design',
      'Scope',
    ]);

    const ordered = timeline({
      data: TASKS,
      xStart: 'Start',
      xEnd: 'Finish',
      y: 'Task',
      color: 'Owner',
      categoryOrders: { Owner: ['Cy', 'Nobody', 'Ben'] },
    });
    expect(ordered.data.map((t) => t['name'])).toEqual(['Cy', 'Ben', 'Ana']);
  });

  it('assigns colors like px: the map first, then the sequence after the map', () => {
    const base = { data: TASKS, xStart: 'Start', xEnd: 'Finish', y: 'Task', color: 'Owner' };
    const colorOf = (fig: ReturnType<typeof timeline>) =>
      fig.data.map((t) => (t['marker'] as { color?: string } | undefined)?.color);
    expect(colorOf(timeline(base))).toEqual([undefined, undefined, undefined]);
    expect(colorOf(timeline({ ...base, colorDiscreteMap: { Ben: '#111' } }))).toEqual([
      undefined,
      '#111',
      undefined,
    ]);
    expect(
      colorOf(
        timeline({
          ...base,
          colorDiscreteMap: { Ben: '#111' },
          colorDiscreteSequence: ['#a', '#b', '#c'],
        }),
      ),
    ).toEqual(['#b', '#111', '#c']);
  });

  it('accepts columns, Date objects and ms numbers, and skips invalid rows', () => {
    const start = [new Date(utc(3, 2)), utc(3, 5), 'not a date', '2026-03-09', null];
    const { data } = timeline({
      data: {
        task: ['a', 'b', 'c', 'd', 'e'],
        start,
        end: ['2026-03-03', new Date(utc(3, 7)), '2026-03-09', '', '2026-03-10'],
      },
      xStart: 'start',
      xEnd: 'end',
      y: 'task',
    });
    expect(data[0]).toMatchObject({ y: ['a', 'b'], base: [start[0], start[1]], x: [DAY, 2 * DAY] });
  });

  it('adds text, hover name and hover data like px', () => {
    const { data } = timeline({
      data: TASKS,
      xStart: 'Start',
      xEnd: 'Finish',
      y: 'Task',
      text: 'Owner',
      hoverName: 'Task',
      hoverData: ['Pct', 'Start', 'Owner'],
      labels: { Pct: 'Done (%)', Finish: 'End' },
    });
    const t = data[0]!;
    expect(t['text']).toEqual(['Ana', 'Ben', 'Ana', 'Cy']);
    expect(t['textposition']).toBe('auto');
    expect(t['hovertext']).toEqual(['Scope', 'Design', 'Build', 'Test']);
    expect(t['customdata']).toEqual([
      [100, 'Ana'],
      [80, 'Ben'],
      [30, 'Ana'],
      [0, 'Cy'],
    ]);
    expect(t['hovertemplate']).toBe(
      '<b>%{hovertext}</b><br><br>Start=%{base|%Y-%m-%d}<br>End=%{x|%Y-%m-%d}<br>Task=%{y}' +
        '<br>Owner=%{text}<br>Done (%)=%{customdata[0]}<br>Owner=%{customdata[1]}<extra></extra>',
    );
  });

  it('shows the time of day in hover when a bar starts or ends within a day', () => {
    const { data } = timeline({
      data: [{ t: 'a', s: '2026-03-02 09:30', e: '2026-03-02 17:00' }],
      xStart: 's',
      xEnd: 'e',
      y: 't',
    });
    expect(data[0]!['x']).toEqual([7.5 * 3_600_000]);
    expect(data[0]!['hovertemplate']).toContain('%{base|%Y-%m-%d %H:%M}');
  });

  it('orders rows by categoryOrders, top-down unless reverseY is false', () => {
    const opts = { data: TASKS, xStart: 'Start', xEnd: 'Finish', y: 'Task' } as const;
    const yaxis = (fig: ReturnType<typeof timeline>) =>
      fig.layout['yaxis'] as Record<string, unknown>;
    expect(yaxis(timeline({ ...opts, reverseY: false }))).toEqual({ title: { text: 'Task' } });
    expect(
      yaxis(timeline({ ...opts, categoryOrders: { Task: ['Test', 'Launch', 'Scope'] } }))[
        'categoryarray'
      ],
    ).toEqual(['Build', 'Design', 'Scope', 'Launch', 'Test']);
    expect(
      yaxis(timeline({ ...opts, reverseY: false, categoryOrders: { Task: ['Test'] } }))[
        'categoryarray'
      ],
    ).toEqual(['Test', 'Scope', 'Design', 'Build']);
  });

  it('sets the title and marker opacity', () => {
    const fig = timeline({
      data: TASKS,
      xStart: 'Start',
      xEnd: 'Finish',
      y: 'Task',
      title: 'Plan',
      opacity: 0.6,
    });
    expect(fig.layout['title']).toEqual({ text: 'Plan' });
    expect(fig.data[0]!['marker']).toEqual({ opacity: 0.6 });
  });

  it('draws and hovers from start to finish through the bar trace', () => {
    const fig = timeline({ data: TASKS, xStart: 'Start', xEnd: 'Finish', y: 'Task' });
    const registry = createChartRegistry().register(bar);
    const { fullData, fullLayout } = supplyDefaults(fig, registry.core);
    const trace = fullData[0]!;
    const categories = ['Test', 'Build', 'Design', 'Scope'];
    const x = { id: 'x', scale: createScale({ type: 'date', length: 400 }) } as unknown as AxisInfo;
    const y = {
      id: 'y',
      scale: createScale({ type: 'category', categories, length: 400 }),
    } as unknown as AxisInfo;
    const calc = bar.calc!(trace, { fullLayout, index: 0, xaxis: x, yaxis: y }) as BarCalc;
    expect([...calc.s0]).toEqual([utc(3, 2), utc(3, 5), utc(3, 12), utc(3, 30)]);
    expect([...calc.s1]).toEqual([utc(3, 6), utc(3, 16), utc(4, 3), utc(4, 10)]);
    // 'Design' is category 2: hover the middle of its bar (1 px per day from 2026-03-01).
    const ctx: HoverContext = {
      fullLayout,
      xaxis: x,
      yaxis: y,
      transform: {
        ...IDENTITY_TRANSFORM,
        scaleX: 1 / DAY,
        offsetX: -utc(3, 1) / DAY,
        scaleY: 10,
        offsetY: 0,
      },
    };
    const [p] = bar.hoverPoints!(
      calc,
      trace,
      { px: 10, py: 20, xl: 0, yl: 0, mode: 'closest', distance: 20 },
      ctx,
    );
    expect(p).toMatchObject({ pointIndex: 1, y: 'Design' });
    const label = formatTemplate(String(trace['hovertemplate']), {
      values: { ...p!.fields, x: p!.x, y: p!.y },
    });
    expect(label).toBe('Start=2026-03-05<br>Finish=2026-03-16<br>Task=Design<extra></extra>');
  });
});
