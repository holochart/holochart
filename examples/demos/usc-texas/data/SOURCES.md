# USC–Texas, 2005-season championship

Played January 4, 2006, at the Rose Bowl in Pasadena. Texas won 41–38 on the field.
The season is 2005; the calendar year of the bowl is 2006.

## Data provenance

- [USC official archived report](https://usc_ftp.sidearmsports.com/custompages/sports/m-footbl/stats/2005-2006-texas.html): authoritative snapshot for this demo, retrieved October 3, 2026. Scoring, individual offensive statistics, drives, defense, and offensive plays are parsed by `import-game.py`. Team summary values are transcribed in that script.
- [Texas official archived report](https://stats.texassports.com/custompages/sports/m-footbl/archive/stats/05/rosebowl.htm): cross-check of final score, team yardage, scoring times, drive totals, and player offensive totals.
- [USC current box-score presentation](https://usctrojans.com/sports/football/stats/2005/texas/boxscore/3393): cross-check of game date, quarter scores and final score.

Reports differ on some individual defensive credits and longest-run fields. Use the USC archive consistently; do not mix defensive credits between sources. Names are reordered to first/last; the report's `Michae` and `Robe` abbreviations are expanded to Michael and Robert. Other initials are preserved.

## Rebuild

Save the USC archive's HTML locally, then run:

```sh
python3 examples/demos/usc-texas/data/import-game.py /absolute/path/to/report.html
pnpm exec prettier --write examples/demos/usc-texas/data/game.json
pnpm exec vitest run tests/demos/usc-texas.test.ts
```

The importer accepts saved HTML rather than disabling certificate validation for the archive's legacy hostname. Rebuilding requires no network calls from the live demo.

## Accounting

- Offensive plays exclude special teams, conversion attempts, administrative rows, and `NO PLAY` events. They reproduce Texas's 289 rushing + 267 passing yards and USC's 209 rushing + 365 passing yards, in 76 and 82 plays respectively.
- Sacks are rushing losses, following college statistical convention. An incomplete or intercepted pass contributes zero offensive yards.
- Young's lateral to Selvin Young gains 22 yards on the snap; the individual credits are 10 and 12 rushing yards. Use 22 in snap charts and official player totals in player charts.
- The opening Texas punt-return fumble is a zero-play, zero-second possession. Its archive start clock is anomalous (00:00); normalize to elapsed 81 seconds, the 13:39 punt-return event. It remains in the possession count and Sankey; drive length/efficiency charts omit it.
- Drive duration is the official TOP value, including drives that cross quarters. Chronological drive durations reconcile to exactly 60 minutes. Both end-of-half and end-of-game outcomes retain the archive's `End of half` wording.
- Drive play counts include kicks and drive net yardage includes penalty changes. Do not equate these with offensive-play counts and net offense.
- Scoring-event points include the immediate PAT/conversion. Individual scoring credits assign touchdowns, kicks and the two-point conversion separately.
- Lead time integrates the score difference between scoring events. The opening 153 seconds are tied. There is no modeled win probability.
- Treemap and sunburst values include only positive net player-category yardage, excluding TEAM and negative categories. Their 1,143 yards do not equal the 1,130 net offense yards.
- Histogram bins are fixed (5-yard play gains; 10-yard drives). Violin curves smooth this game's observed plays. Explosive thresholds (10+, 20+, 30+) are nested, not additive.
- No player tracking positions, play timestamps absent from the source, or other synthetic game observations are added.
