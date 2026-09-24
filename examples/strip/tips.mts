import { gaussian, rng } from '../_lib/rng.ts';

/** One row of the synthetic "tips" table used by the strip plot examples. */
export interface TipRow {
  day: 'Thu' | 'Fri' | 'Sat' | 'Sun';
  time: 'Lunch' | 'Dinner';
  smoker: 'Yes' | 'No';
  sex: 'Female' | 'Male';
  total_bill: number;
  tip: number;
  size: number;
}

/**
 * A deterministic stand-in for the classic restaurant "tips" dataset (the one plotly.py's
 * examples use): `n` rows with a day, meal time, smoker flag, sex, party size, bill and tip.
 */
export function tips(n = 244, seed = 3): TipRow[] {
  const random = rng(seed);
  const normal = gaussian(rng(seed + 1));
  const days = ['Thu', 'Fri', 'Sat', 'Sun'] as const;
  const weights = [0.25, 0.08, 0.36, 0.31];
  const rows: TipRow[] = [];
  for (let i = 0; i < n; i++) {
    let r = random();
    let d = 0;
    while (d < days.length - 1 && r > weights[d]!) r -= weights[d++]!;
    const day = days[d]!;
    const time = day === 'Thu' ? 'Lunch' : day === 'Fri' && random() < 0.3 ? 'Lunch' : 'Dinner';
    const size = Math.max(1, Math.min(6, Math.round(2.5 + normal() * 0.9)));
    const bill = Math.max(3, 6 + size * 4.2 + (time === 'Dinner' ? 3 : 0) + normal() * 5.5);
    const tip = Math.max(1, bill * (0.15 + normal() * 0.035));
    rows.push({
      day,
      time,
      smoker: random() < 0.38 ? 'Yes' : 'No',
      sex: random() < 0.36 ? 'Female' : 'Male',
      total_bill: Math.round(bill * 100) / 100,
      tip: Math.round(tip * 100) / 100,
      size,
    });
  }
  return rows;
}
