import { describe, expect, it } from 'vitest';
import {
  DEFENSE,
  DRIVES,
  PLAYERS,
  PLAYS,
  SCORES,
  TEAMS,
  leadTimes,
  pointsFor,
  sum,
  teamPlays,
} from '../../examples/demos/usc-texas/analysis.mts';
import { build } from '../../examples/demos/usc-texas/charts.mts';

describe('Rose Bowl official game data', () => {
  it('reconciles offensive plays and individual totals to both team box scores', () => {
    expect(PLAYS).toHaveLength(158);
    for (const t of TEAMS) {
      const plays = teamPlays(t.name);
      expect(plays).toHaveLength(t.rushAtt + t.passAtt);
      for (const [kind, playerKind, yards] of [
        ['Rush', 'Rush', t.rush],
        ['Pass', 'Reception', t.passYards],
      ] as const) {
        expect(sum(plays.filter((p) => p.kind === kind).map((p) => p.yards))).toBe(yards);
        expect(
          sum(
            PLAYERS.filter((p) => p.team === t.name && p.kind === playerKind).map((p) => p.yards),
          ),
        ).toBe(yards);
      }
      expect(plays.filter((p) => p.kind === 'Pass')).toHaveLength(t.passAtt);
      expect(plays.filter((p) => p.complete)).toHaveLength(t.completions);
      expect(plays.filter((p) => p.sack)).toHaveLength(t.sacks);
    }
    expect(DEFENSE.every((p) => p.total === p.solo + p.assists)).toBe(true);
  });

  it('reconciles chronological possessions, scoring events, and all four quarters', () => {
    expect(DRIVES).toHaveLength(26);
    expect(SCORES).toHaveLength(13);
    const real = DRIVES.filter((d) => d.seconds > 0);
    expect(real[0]!.start).toBe(0);
    expect(real.at(-1)!.end).toBe(3600);
    for (let i = 1; i < real.length; i++) expect(real[i]!.start).toBe(real[i - 1]!.end);
    for (const t of TEAMS) {
      expect(sum(DRIVES.filter((d) => d.team === t.name).map((d) => d.seconds))).toBe(
        sum(t.possession),
      );
      expect(sum(DRIVES.filter((d) => d.team === t.name).map(pointsFor))).toBe(t.score);
      expect(
        [1, 2, 3, 4].map((q) =>
          sum(SCORES.filter((s) => s.team === t.name && s.quarter === q).map((s) => s.points)),
        ),
      ).toEqual(t.quarters);
    }
    expect(sum(leadTimes())).toBe(3600);
    expect(leadTimes()[2]).toBe(153);
    expect(SCORES.at(-1)).toMatchObject({ elapsed: 3581, points: 8, texas: 41, usc: 38 });
  });

  it('preserves the final drive and the lateral without counting conversion yardage', () => {
    const final = teamPlays('Texas').slice(-10);
    expect(final[0]).toMatchObject({ field: 44, down: 1, yards: -2 });
    expect(final.at(-1)).toMatchObject({ field: 92, down: 4, toGo: 5, yards: 8, td: true });
    expect(sum(final.map((p) => p.yards))).toBe(51); // Plus a 5-yard USC penalty = 56 drive yards.
    expect(
      PLAYS.find((p) => p.team === 'Texas' && p.quarter === 2 && p.field === 78 && p.td)?.yards,
    ).toBe(22);
    expect(sum(build('scoring-players').data[0]!['x'] as number[])).toBe(79);
  });
});
