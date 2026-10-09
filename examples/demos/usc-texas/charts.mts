/** Figure builders for the Rose Bowl demo. All quantities come from the official game dataset. */
import {
  COLOR,
  DEFENSE,
  DRIVES,
  PLAYS,
  PLAYERS,
  QUARTERS,
  SCORES,
  SCRIMMAGE,
  TEAMS,
  clock,
  leadTimes,
  pointsFor,
  sum,
  teamDrives,
  teamPlays,
} from './analysis.mts';
type Trace = Record<string, unknown>;
export interface Figure {
  data: Trace[];
  layout: Record<string, unknown>;
}
const names = TEAMS.map((t) => t.name);
const teamColor = (team: string) => COLOR[team]!;
const axis = (text: string, extra: Record<string, unknown> = {}) => ({ title: { text }, ...extra });
const figure = (data: Trace[], layout: Record<string, unknown> = {}): Figure => ({ data, layout });
const bar = (name: string, x: (string | number)[], y: number[], extra: Trace = {}): Trace => ({
  type: 'bar',
  name,
  x,
  y,
  marker: { color: teamColor(name) },
  ...extra,
});
const line = (name: string, x: number[], y: number[], extra: Trace = {}): Trace => ({
  type: 'scatter',
  name,
  x,
  y,
  mode: 'lines+markers',
  line: { color: teamColor(name), width: 3 },
  marker: { color: teamColor(name), size: 7 },
  ...extra,
});
const compare = (
  labels: string[],
  values: (t: (typeof TEAMS)[number]) => number[],
  ytitle: string,
  extra: Record<string, unknown> = {},
) =>
  figure(
    TEAMS.map((t) => bar(t.name, labels, values(t))),
    { barmode: 'group', xaxis: { type: 'category' }, yaxis: axis(ytitle), ...extra },
  );
const timeline = () => ({
  xaxis: axis('Game minutes elapsed', {
    range: [0, 60],
    tickvals: [0, 15, 30, 45, 60],
    ticktext: ['Kickoff', 'End Q1', 'Half', 'End Q3', 'Final'],
  }),
});
const fieldAxis = () =>
  axis('Yards from own goal line', {
    range: [0, 100],
    tickvals: [0, 20, 40, 50, 60, 80, 100],
    ticktext: ['Own goal', 'Own 20', 'Own 40', '50', 'Opp 40', 'Opp 20', 'Goal'],
  });
const driveText = (d: (typeof DRIVES)[number]) =>
  `${d.team} · possession ${d.id}<br>${d.plays} plays · ${d.yards} yards · ${clock(d.seconds)}<br>${d.outcome}`;
const snapText = (p: (typeof PLAYS)[number]) =>
  `${p.team} · Q${p.quarter} · play ${p.id}<br>${p.player} · ${p.kind}<br>${p.down} & ${p.toGo} · ${p.yards} yards${p.td ? ' · TD' : ''}`;
const distribution = (type: string, drives: boolean): Figure =>
  figure(
    TEAMS.map((t) => ({
      type,
      name: t.name,
      ...(type === 'histogram'
        ? {
            x: (drives ? teamDrives(t.name) : teamPlays(t.name)).map((p) => p.yards),
            xbins: drives ? { start: -10, end: 90, size: 10 } : { start: -15, end: 50, size: 5 },
            opacity: 0.7,
          }
        : {
            y: (drives ? teamDrives(t.name) : teamPlays(t.name)).map((p) => p.yards),
            ...(type === 'violin'
              ? { points: 'all', box: { visible: true }, meanline: { visible: true } }
              : { boxpoints: 'all' }),
            jitter: 0.3,
          }),
      marker: { color: teamColor(t.name), ...(type === 'histogram' ? {} : { size: 5 }) },
      ...(type === 'histogram' ? {} : { line: { color: teamColor(t.name) } }),
    })),
    {
      barmode: 'overlay',
      xaxis: axis(type === 'histogram' ? 'Net yards' : 'Team'),
      yaxis: axis(type === 'histogram' ? 'Count' : 'Net yards'),
    },
  );
const ranked = (
  rows: { name: string; team: string; yards: number }[],
  value = (p: (typeof rows)[number]) => p.yards,
  title = 'Net yards',
): Figure => {
  const sorted = [...rows].sort((a, b) => value(a) - value(b));
  return figure(
    [
      {
        type: 'bar',
        orientation: 'h',
        x: sorted.map(value),
        y: sorted.map((p) => p.name),
        marker: { color: sorted.map((p) => teamColor(p.team)) },
        text: sorted.map((p) => value(p).toFixed(1).replace('.0', '')),
        textposition: 'auto',
        hovertemplate: '%{y}: %{x}<extra></extra>',
      },
    ],
    { showlegend: false, margin: { l: 125 }, xaxis: axis(title), yaxis: { type: 'category' } },
  );
};
const positiveTree = (type: string): Figure => {
  const rows = PLAYERS.filter((p) => p.yards > 0 && p.name !== 'TEAM');
  const ids: string[] = [],
    labels: string[] = [],
    parents: string[] = [],
    values: number[] = [],
    colors: string[] = [];
  const add = (id: string, label: string, parent: string, value: number, color: string) => {
    ids.push(id);
    labels.push(label);
    parents.push(parent);
    values.push(value);
    colors.push(color);
  };
  add('game', 'Positive net yardage', '', sum(rows.map((p) => p.yards)), '#515563');
  for (const t of TEAMS) {
    const players = rows.filter((p) => p.team === t.name);
    add(t.name, t.name, 'game', sum(players.map((p) => p.yards)), teamColor(t.name));
    for (const kind of ['Rush', 'Reception']) {
      const branch = `${t.name}/${kind}`;
      const r = players.filter((p) => p.kind === kind);
      add(branch, kind, t.name, sum(r.map((p) => p.yards)), teamColor(t.name));
      r.forEach((p) => add(`${branch}/${p.name}`, p.name, branch, p.yards, teamColor(t.name)));
    }
  }
  return figure(
    [
      {
        type,
        ids,
        labels,
        parents,
        values,
        branchvalues: 'total',
        marker: { colors, line: { width: 1, color: '#0a0a0f' } },
        textinfo: 'label+value',
        hovertemplate: '%{label}: %{value} yards<extra></extra>',
      },
    ],
    {
      margin: { l: 12, r: 12, b: 12 },
      uniformtext: { minsize: 9, mode: 'hide' },
      showlegend: false,
    },
  );
};

export function build(id: string): Figure {
  switch (id) {
    case 'score-line':
      return figure(
        TEAMS.map((t) =>
          line(
            t.name,
            [0, ...SCORES.map((s) => s.elapsed / 60), 60],
            [0, ...SCORES.map((s) => (t.name === 'Texas' ? s.texas : s.usc)), t.score],
            { line: { color: teamColor(t.name), width: 3, shape: 'hv' } },
          ),
        ),
        { ...timeline(), yaxis: axis('Points', { range: [0, 45] }) },
      );
    case 'lead-area': {
      const x = [0, ...SCORES.map((s) => s.elapsed / 60), 60];
      const y = [0, ...SCORES.map((s) => s.texas - s.usc), 3];
      return figure(
        [
          line(
            'Texas lead',
            x,
            y.map((v) => Math.max(0, v)),
            { fill: 'tozeroy', mode: 'lines', line: { color: teamColor('Texas'), shape: 'hv' } },
          ),
          line(
            'USC lead',
            x,
            y.map((v) => Math.min(0, v)),
            { fill: 'tozeroy', mode: 'lines', line: { color: teamColor('USC'), shape: 'hv' } },
          ),
        ],
        { ...timeline(), yaxis: axis('Texas − USC (points)', { range: [-14, 12] }) },
      );
    }
    case 'quarter-bars':
      return compare(QUARTERS, (t) => t.quarters, 'Points');
    case 'scoring-waterfall':
      return figure(
        [
          {
            type: 'waterfall',
            x: SCORES.map((s) => `Q${s.quarter} ${s.clock}`),
            y: SCORES.map((s) => (s.team === 'Texas' ? 1 : -1) * s.points),
            measure: SCORES.map(() => 'relative'),
            increasing: { marker: { color: teamColor('Texas') } },
            decreasing: { marker: { color: teamColor('USC') } },
            text: SCORES.map((s) => `${s.team} +${s.points}`),
            textposition: 'outside',
          },
        ],
        {
          showlegend: false,
          xaxis: { type: 'category', tickangle: -45 },
          yaxis: axis('Running Texas − USC margin'),
          margin: { b: 110 },
        },
      );
    case 'scoring-clock':
      return figure(
        TEAMS.map((t) => ({
          type: 'barpolar',
          name: t.name,
          theta: SCORES.filter((s) => s.team === t.name).map((s) => s.elapsed / 10),
          r: SCORES.filter((s) => s.team === t.name).map((s) => s.points),
          width: 5,
          marker: { color: teamColor(t.name) },
          text: SCORES.filter((s) => s.team === t.name).map(
            (s) => `Q${s.quarter} ${s.clock} · ${s.player}`,
          ),
          hovertemplate: '%{text}<br>%{r} points<extra></extra>',
        })),
        {
          polar: {
            angularaxis: {
              rotation: 90,
              direction: 'clockwise',
              tickvals: [0, 90, 180, 270],
              ticktext: ['Kickoff', 'Q2', 'Q3', 'Q4'],
            },
            radialaxis: axis('Points', { range: [0, 9] }),
          },
        },
      );
    case 'lead-time':
      return figure(
        [
          {
            type: 'pie',
            labels: ['Texas leading', 'USC leading', 'Tied'],
            values: leadTimes(),
            hole: 0.65,
            marker: { colors: [teamColor('Texas'), teamColor('USC'), '#6e778a'] },
            textinfo: 'label+percent',
            customdata: leadTimes().map(clock),
            hovertemplate: '%{label}: %{customdata}<extra></extra>',
          },
        ],
        { margin: { l: 24, r: 24 }, showlegend: false },
      );
    case 'scoring-table':
      return figure(
        [
          {
            type: 'table',
            columnwidth: [65, 65, 70, 145, 90, 60],
            header: {
              values: ['Quarter', 'Clock', 'Team', 'Scorer', 'Play', 'Score'],
              fill: { color: '#242633' },
              font: { color: '#eceef4', size: 12 },
            },
            cells: {
              values: [
                SCORES.map((s) => `Q${s.quarter}`),
                SCORES.map((s) => s.clock),
                SCORES.map((s) => s.team),
                SCORES.map((s) => s.player),
                SCORES.map((s) => `${s.yards} yd ${s.kind}`),
                SCORES.map((s) => `${s.texas}–${s.usc}`),
              ],
              height: 28,
              fill: { color: '#11121b' },
              font: { color: '#d8dbe8', size: 11 },
              align: 'left',
            },
          },
        ],
        { margin: { l: 8, r: 8, b: 8 } },
      );
    case 'offense-stack':
      return figure(
        [
          bar(
            'Rush',
            names,
            TEAMS.map((t) => t.rush),
            { marker: { color: '#e88945' } },
          ),
          bar(
            'Pass',
            names,
            TEAMS.map((t) => t.passYards),
            { marker: { color: '#6c93da' } },
          ),
        ],
        { barmode: 'stack', yaxis: axis('Net yards'), xaxis: { type: 'category' } },
      );
    case 'play-mix':
      return compare(
        ['Rush attempts', 'Pass attempts'],
        (t) => [t.rushAtt, t.passAtt],
        'Official attempts (sacks count as rushes)',
      );
    case 'efficiency':
      return compare(
        ['Per rush', 'Per pass attempt', 'Per offensive play'],
        (t) => [
          t.rush / t.rushAtt,
          t.passYards / t.passAtt,
          (t.rush + t.passYards) / (t.rushAtt + t.passAtt),
        ],
        'Net yards per attempt',
      );
    case 'first-downs':
      return compare(['Rush', 'Pass', 'Penalty'], (t) => t.firstDowns, 'First downs');
    case 'conversions':
      return compare(
        ['Third down', 'Fourth down', 'Red zone score'],
        (t) => [
          t.third[0]! / t.third[1]!,
          t.fourth[0]! / t.fourth[1]!,
          t.redZone[0]! / t.redZone[1]!,
        ],
        'Conversion rate',
        { yaxis: axis('Conversion rate', { range: [0, 1], tickformat: '.0%' }) },
      );
    case 'possession':
      return figure(
        [
          {
            type: 'pie',
            labels: names,
            values: TEAMS.map((t) => sum(t.possession)),
            hole: 0.6,
            marker: { colors: names.map(teamColor) },
            textinfo: 'label+percent',
            customdata: TEAMS.map((t) => clock(sum(t.possession))),
            hovertemplate: '%{label}: %{customdata}<extra></extra>',
          },
        ],
        { showlegend: false },
      );
    case 'quarter-possession':
      return compare(QUARTERS, (t) => t.possession.map((v) => v / 60), 'Minutes with possession', {
        barmode: 'stack',
        yaxis: axis('Minutes with possession', { range: [0, 15] }),
      });
    case 'penalties':
      return compare(
        ['Penalty yards', 'Rushing yards lost'],
        (t) => [t.penalties[1]!, t.name === 'Texas' ? 27 : 21],
        'Yards',
      );
    case 'turnovers':
      return compare(
        ['Fumbles', 'Fumbles lost', 'Interceptions thrown'],
        (t) => [...t.fumbles, t.interceptions],
        'Count',
      );
    case 'drive-timeline':
      return figure(
        TEAMS.map((t) => ({
          type: 'bar',
          name: t.name,
          orientation: 'h',
          y: teamDrives(t.name).map((d) => `#${d.id} ${t.name}`),
          x: teamDrives(t.name).map((d) => d.seconds / 60),
          base: teamDrives(t.name).map((d) => d.start / 60),
          marker: { color: teamColor(t.name) },
          customdata: teamDrives(t.name).map(driveText),
          hovertemplate: '%{customdata}<extra></extra>',
        })),
        {
          ...timeline(),
          yaxis: {
            type: 'category',
            categoryorder: 'array',
            categoryarray: DRIVES.filter((d) => d.plays > 0)
              .map((d) => `#${d.id} ${d.team}`)
              .reverse(),
          },
          margin: { l: 90 },
          barmode: 'overlay',
        },
      );
    case 'drive-distance':
      return figure(
        TEAMS.map((t) =>
          bar(
            t.name,
            teamDrives(t.name).map((d) => d.id),
            teamDrives(t.name).map((d) => d.yards),
            {
              customdata: teamDrives(t.name).map(driveText),
              hovertemplate: '%{customdata}<extra></extra>',
            },
          ),
        ),
        { xaxis: axis('Possession number'), yaxis: axis('Net drive yards') },
      );
    case 'drive-bubbles':
      return figure(
        TEAMS.map((t) => ({
          type: 'scatter',
          mode: 'markers',
          name: t.name,
          x: teamDrives(t.name).map((d) => d.plays),
          y: teamDrives(t.name).map((d) => d.yards),
          marker: {
            color: teamColor(t.name),
            size: teamDrives(t.name).map((d) => 8 + pointsFor(d) * 3),
            opacity: 0.8,
          },
          customdata: teamDrives(t.name).map(driveText),
          hovertemplate: '%{customdata}<extra></extra>',
        })),
        { xaxis: axis('Plays (includes kicks)'), yaxis: axis('Net drive yards') },
      );
    case 'field-position':
      return figure(
        TEAMS.map((t) => ({
          type: 'scatter',
          mode: 'markers',
          name: t.name,
          x: teamDrives(t.name).map((d) => d.startField),
          y: teamDrives(t.name).map((d) => d.yards),
          marker: { color: teamColor(t.name), size: 11 },
          customdata: teamDrives(t.name).map(driveText),
          hovertemplate: '%{customdata}<extra></extra>',
        })),
        { xaxis: fieldAxis(), yaxis: axis('Net drive yards') },
      );
    case 'drive-box':
      return distribution('box', true);
    case 'drive-histogram':
      return distribution('histogram', true);
    case 'drive-parcoords': {
      const rows = DRIVES.filter((d) => d.plays > 0);
      return figure(
        [
          {
            type: 'parcoords',
            line: {
              color: rows.map((d) => (d.team === 'Texas' ? 0 : 1)),
              colorscale: [
                [0, teamColor('Texas')],
                [1, teamColor('USC')],
              ],
              cmin: 0,
              cmax: 1,
            },
            dimensions: [
              {
                label: 'Team',
                values: rows.map((d) => (d.team === 'Texas' ? 0 : 1)),
                tickvals: [0, 1],
                ticktext: names,
              },
              { label: 'Start field', values: rows.map((d) => d.startField) },
              { label: 'Plays', values: rows.map((d) => d.plays) },
              { label: 'Yards', values: rows.map((d) => d.yards) },
              { label: 'Minutes', values: rows.map((d) => d.seconds / 60) },
              { label: 'Points', values: rows.map(pointsFor) },
            ],
          },
        ],
        { margin: { l: 55, r: 55, b: 32 } },
      );
    }
    case 'drive-parcats': {
      const rows = DRIVES.filter((d) => d.plays > 0);
      return figure(
        [
          {
            type: 'parcats',
            dimensions: [
              { label: 'Team', values: rows.map((d) => d.team) },
              {
                label: 'Half',
                values: rows.map((d) => (d.quarter < 3 ? 'First half' : 'Second half')),
              },
              { label: 'Result', values: rows.map((d) => d.outcome) },
            ],
            line: {
              color: rows.map((d) => (d.team === 'Texas' ? 0 : 1)),
              colorscale: [
                [0, teamColor('Texas')],
                [1, teamColor('USC')],
              ],
              shape: 'hspline',
              cmin: 0,
              cmax: 1,
            },
            hoveron: 'color',
            hoverinfo: 'count+probability',
          },
        ],
        { margin: { l: 40, r: 65, b: 24 } },
      );
    }
    case 'drive-sankey': {
      const results = [...new Set(DRIVES.map((d) => d.outcome))];
      const source: number[] = [],
        target: number[] = [],
        value: number[] = [],
        color: string[] = [];
      names.forEach((team, i) =>
        results.forEach((result, j) => {
          const n = DRIVES.filter((d) => d.team === team && d.outcome === result).length;
          if (n) {
            source.push(i);
            target.push(2 + j);
            value.push(n);
            color.push(teamColor(team));
          }
        }),
      );
      return figure(
        [
          {
            type: 'sankey',
            node: {
              label: [...names, ...results],
              color: [...names.map(teamColor), ...results.map(() => '#686e85')],
              pad: 22,
              thickness: 20,
            },
            link: { source, target, value, color },
          },
        ],
        { margin: { l: 25, r: 25, b: 25 } },
      );
    }
    case 'scoring-drive-speed':
      return figure(
        TEAMS.map((t) => ({
          type: 'scatter',
          name: t.name,
          mode: 'markers',
          x: teamDrives(t.name)
            .filter((d) => pointsFor(d) > 0)
            .map((d) => d.seconds / 60),
          y: teamDrives(t.name)
            .filter((d) => pointsFor(d) > 0)
            .map((d) => d.yards),
          marker: { color: teamColor(t.name), size: 13 },
          customdata: teamDrives(t.name)
            .filter((d) => pointsFor(d) > 0)
            .map(driveText),
          hovertemplate: '%{customdata}<extra></extra>',
        })),
        { xaxis: axis('Scoring-drive duration (minutes)'), yaxis: axis('Net drive yards') },
      );
    case 'rushing':
      return ranked(PLAYERS.filter((p) => p.kind === 'Rush'));
    case 'rushing-efficiency':
      return ranked(
        PLAYERS.filter((p) => p.kind === 'Rush' && p.name !== 'TEAM'),
        (p) => {
          const r = PLAYERS.find(
            (r) => r.team === p.team && r.name === p.name && r.kind === 'Rush',
          )!;
          return r.yards / r.attempts;
        },
        'Net yards per rush',
      );
    case 'receiving':
      return ranked(PLAYERS.filter((p) => p.kind === 'Reception'));
    case 'receiver-bubbles':
      return figure(
        TEAMS.map((t) => {
          const rows = PLAYERS.filter((p) => p.team === t.name && p.kind === 'Reception');
          return {
            type: 'scatter',
            name: t.name,
            mode: 'markers+text',
            x: rows.map((p) => p.attempts),
            y: rows.map((p) => p.yards),
            text: rows.map((p) => p.name.split(' ').at(-1)),
            textposition: 'top center',
            textfont: { size: 10 },
            marker: { color: teamColor(t.name), size: rows.map((p) => 8 + p.long / 2) },
            customdata: rows.map((p) => [p.name, p.long]),
            hovertemplate:
              '%{customdata[0]}<br>%{x} catches · %{y} yards<br>Longest %{customdata[1]} yards<extra></extra>',
          };
        }),
        { xaxis: axis('Receptions'), yaxis: axis('Receiving yards'), margin: { r: 55 } },
      );
    case 'scrimmage':
      return ranked(SCRIMMAGE);
    case 'player-treemap':
      return positiveTree('treemap');
    case 'player-sunburst':
      return positiveTree('sunburst');
    case 'scoring-players':
      return ranked(
        [
          { name: 'Vince Young', team: 'Texas', yards: 20 },
          { name: 'Selvin Young', team: 'Texas', yards: 6 },
          { name: 'Ramonce Taylor', team: 'Texas', yards: 6 },
          { name: 'David Pino', team: 'Texas', yards: 9 },
          { name: 'LenDale White', team: 'USC', yards: 18 },
          { name: 'Reggie Bush', team: 'USC', yards: 6 },
          { name: 'Dwayne Jarrett', team: 'USC', yards: 6 },
          { name: 'Mario Danelo', team: 'USC', yards: 8 },
        ],
        (p) => p.yards,
        'Points scored (includes kicks and conversion)',
      );
    case 'quarterbacks':
      return figure(
        [
          bar('Vince Young', ['Pass', 'Rush'], [267, 200], {
            marker: { color: teamColor('Texas') },
          }),
          bar('Matt Leinart', ['Pass', 'Rush'], [365, 2], { marker: { color: teamColor('USC') } }),
        ],
        {
          barmode: 'group',
          xaxis: { type: 'category' },
          yaxis: axis('Net yards (sacks deducted from rushing)'),
        },
      );
    case 'defense': {
      const rows = [...DEFENSE]
        .filter((p) => p.name !== 'TEAM')
        .sort((a, b) => b.total - a.total)
        .slice(0, 14)
        .reverse();
      return figure(
        [
          {
            type: 'bar',
            name: 'Solo',
            orientation: 'h',
            x: rows.map((p) => p.solo),
            y: rows.map((p) => `${p.name} (${p.team})`),
            marker: { color: rows.map((p) => teamColor(p.team)) },
          },
          {
            type: 'bar',
            name: 'Assisted',
            orientation: 'h',
            x: rows.map((p) => p.assists),
            y: rows.map((p) => `${p.name} (${p.team})`),
            marker: { color: '#777e95' },
          },
        ],
        {
          barmode: 'stack',
          margin: { l: 175 },
          xaxis: axis('Tackles'),
          yaxis: { type: 'category' },
        },
      );
    }
    case 'snap-gains':
      return figure(
        TEAMS.map((t) => ({
          type: 'scatter',
          mode: 'markers',
          name: t.name,
          x: teamPlays(t.name).map((p) => p.id),
          y: teamPlays(t.name).map((p) => p.yards),
          marker: {
            color: teamColor(t.name),
            size: teamPlays(t.name).map((p) => (p.td ? 13 : 6)),
            symbol: teamPlays(t.name).map((p) => (p.kind === 'Pass' ? 'diamond' : 'circle')),
          },
          customdata: teamPlays(t.name).map(snapText),
          hovertemplate: '%{customdata}<extra></extra>',
        })),
        { xaxis: axis('Offensive play in game order'), yaxis: axis('Net yards') },
      );
    case 'gain-histogram':
      return distribution('histogram', false);
    case 'gain-box':
      return distribution('box', false);
    case 'gain-violin':
      return distribution('violin', false);
    case 'down-heatmap':
      return figure(
        [
          {
            type: 'heatmap',
            x: ['1st', '2nd', '3rd', '4th'],
            y: names,
            z: names.map((t) =>
              [1, 2, 3, 4].map((down) => {
                const ps = teamPlays(t).filter((p) => p.down === down);
                return sum(ps.map((p) => p.yards)) / ps.length;
              }),
            ),
            colorscale: 'YlOrRd',
            colorbar: { title: { text: 'Yards/play' }, thickness: 12 },
            hovertemplate: '%{y} · %{x} down<br>%{z:.2f} yards/play<extra></extra>',
          },
        ],
        { xaxis: axis('Down at snap', { type: 'category' }), yaxis: { type: 'category' } },
      );
    case 'explosives':
      return compare(
        ['10+ yard gains', '20+ yard gains', '30+ yard gains'],
        (t) => [10, 20, 30].map((n) => teamPlays(t.name).filter((p) => p.yards >= n).length),
        'Offensive plays (nested thresholds)',
      );
    case 'cumulative-yards':
      return figure(
        TEAMS.map((t) => {
          let total = 0;
          const ps = teamPlays(t.name);
          return line(
            t.name,
            [0, ...ps.map((p) => p.id)],
            [0, ...ps.map((p) => (total += p.yards))],
            { mode: 'lines', line: { color: teamColor(t.name), width: 3, shape: 'hv' } },
          );
        }),
        {
          xaxis: axis('Offensive play in game order'),
          yaxis: axis('Cumulative net offense (yards)'),
        },
      );
    case 'run-pass-quarter':
      return figure(
        TEAMS.flatMap((t) =>
          ['Rush', 'Pass'].map((kind) =>
            bar(
              `${t.name} ${kind}`,
              QUARTERS,
              [1, 2, 3, 4].map((q) =>
                sum(
                  teamPlays(t.name)
                    .filter((p) => p.quarter === q && p.kind === kind)
                    .map((p) => p.yards),
                ),
              ),
              {
                marker: {
                  color:
                    kind === 'Rush'
                      ? teamColor(t.name)
                      : t.name === 'Texas'
                        ? '#99aadc'
                        : '#b289ba',
                },
              },
            ),
          ),
        ),
        { barmode: 'group', xaxis: { type: 'category' }, yaxis: axis('Net offensive yards') },
      );
    case 'play-splom':
      return figure(
        [
          {
            type: 'splom',
            dimensions: [
              { label: 'Down', values: PLAYS.map((p) => p.down) },
              { label: 'To go', values: PLAYS.map((p) => p.toGo) },
              { label: 'Field', values: PLAYS.map((p) => p.field) },
              { label: 'Gain', values: PLAYS.map((p) => p.yards) },
            ],
            marker: {
              color: PLAYS.map((p) => (p.team === 'Texas' ? 0 : 1)),
              colorscale: [
                [0, teamColor('Texas')],
                [1, teamColor('USC')],
              ],
              cmin: 0,
              cmax: 1,
              size: 5,
              opacity: 0.7,
            },
            showupperhalf: false,
            diagonal: { visible: false },
          },
        ],
        { showlegend: false, margin: { l: 50, r: 25, b: 55 } },
      );
    case 'play-3d':
      return figure(
        TEAMS.map((t) => ({
          type: 'scatter3d',
          mode: 'markers',
          name: t.name,
          x: teamPlays(t.name).map((p) => p.id),
          y: teamPlays(t.name).map((p) => p.field),
          z: teamPlays(t.name).map((p) => p.yards),
          marker: { color: teamColor(t.name), size: 4 },
          customdata: teamPlays(t.name).map(snapText),
          hovertemplate: '%{customdata}<extra></extra>',
        })),
        {
          scene: {
            xaxis: axis('Play number'),
            yaxis: fieldAxis(),
            zaxis: axis('Net gain'),
            camera: { eye: { x: 1.5, y: -1.8, z: 1.1 } },
          },
          margin: { l: 0, r: 0, b: 0 },
        },
      );
    case 'quarter-3d':
      return figure(
        [
          {
            type: 'bar3d',
            x: TEAMS.flatMap(() => QUARTERS),
            y: TEAMS.flatMap((t) => QUARTERS.map(() => t.name)),
            z: TEAMS.flatMap((t) => t.quarters),
            width: 0.65,
            depth: 0.55,
            marker: { color: TEAMS.flatMap((t) => QUARTERS.map(() => teamColor(t.name))) },
          },
        ],
        {
          showlegend: false,
          scene: {
            xaxis: { type: 'category', categoryorder: 'array', categoryarray: QUARTERS },
            yaxis: { type: 'category' },
            zaxis: axis('Points'),
            camera: { eye: { x: 1.4, y: -1.8, z: 1.1 } },
          },
          margin: { l: 0, r: 0, b: 0 },
        },
      );
    case 'final-drive': {
      const ps = teamPlays('Texas').slice(-10);
      return figure(
        [
          {
            type: 'bar',
            name: 'Gain',
            x: ps.map((_, i) => i + 1),
            y: ps.map((p) => p.yards),
            marker: { color: ps.map((p) => (p.kind === 'Rush' ? teamColor('Texas') : '#6c93da')) },
            customdata: ps.map(snapText),
            hovertemplate: '%{customdata}<extra></extra>',
          },
          {
            type: 'scatter',
            name: 'Field position',
            x: ps.map((_, i) => i + 1),
            y: ps.map((p) => p.field + p.yards),
            yaxis: 'y2',
            mode: 'lines+markers',
            line: { color: '#d9dce8', width: 2 },
          },
        ],
        {
          xaxis: axis('Play of final Texas drive', { dtick: 1 }),
          yaxis: axis('Net gain (yards)'),
          yaxis2: { ...fieldAxis(), overlaying: 'y', side: 'right', showgrid: false },
          margin: { r: 100 },
        },
      );
    }
    default:
      throw new Error(`Unknown Rose Bowl chart: ${id}`);
  }
}
