/** Official game observations, with pure derived statistics shared by every chart. */
import game from './data/game.json';
export const TEAMS = game.teams;
export const PLAYERS = game.players;
export const SCORES = game.scores;
export const DRIVES = game.drives;
export const PLAYS = game.plays;
export const DEFENSE = game.defense;
export const COLOR: Record<string, string> = { Texas: '#e88945', USC: '#ec5267' };
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
export const sum = (v: number[]): number => v.reduce((a, b) => a + b, 0);
export const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
export const teamPlays = (team: string) => PLAYS.filter((p) => p.team === team);
export const teamDrives = (team: string) => DRIVES.filter((d) => d.team === team && d.plays > 0);
export const pointsFor = (d: (typeof DRIVES)[number]): number =>
  SCORES.find((s) => s.team === d.team && s.elapsed === d.end)?.points ?? 0;
export const leadTimes = (): number[] => {
  const times = [0, 0, 0];
  let previous = 0,
    lead = 0;
  for (const s of SCORES) {
    times[lead > 0 ? 0 : lead < 0 ? 1 : 2]! += s.elapsed - previous;
    lead = s.texas - s.usc;
    previous = s.elapsed;
  }
  times[lead > 0 ? 0 : lead < 0 ? 1 : 2]! += 3600 - previous;
  return times;
};
export const SCRIMMAGE = [
  ...new Set(PLAYERS.filter((p) => p.name !== 'TEAM').map((p) => `${p.team}|${p.name}`)),
].map((key) => {
  const [team, name] = key.split('|');
  const records = PLAYERS.filter((p) => p.team === team && p.name === name);
  return {
    team: team!,
    name: name!,
    yards: sum(records.map((p) => p.yards)),
    rush: sum(records.filter((p) => p.kind === 'Rush').map((p) => p.yards)),
    receiving: sum(records.filter((p) => p.kind === 'Reception').map((p) => p.yards)),
  };
});
