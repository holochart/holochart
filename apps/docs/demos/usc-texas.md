---
title: USC–Texas Rose Bowl
description: The 2005-season national championship in 48 Holochart charts — the 41–38 finish, every drive, every offensive play, and the players who made it happen.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import StatTiles from './components/StatTiles.vue';
const stats = [
  { value: '41–38', label: 'Texas wins the national championship', aside: '2005 season · January 4, 2006' },
  { value: '467 yd', label: 'Vince Young’s total offense', aside: '267 passing + 200 rushing' },
  { value: '19 sec', label: 'left when Texas took the final lead', aside: '4th & 5 · 8-yard touchdown run' },
  { value: '48 charts', label: 'one game, many ways to see it', aside: '13 scores · 26 possessions · 158 offensive plays' },
];
</script>

<p class="hc-eyebrow">The Rose Bowl · Pasadena · January 4, 2006 · 2005 season</p>

# Fourth and five. A season on the line.

<p class="hc-verdict"><strong>Texas 41. USC 38.</strong> Two offenses combined for 1,130 yards,
  but the championship came down to eight. With 19 seconds left, Vince Young reached the end zone
  on fourth down, then ran in the two-point conversion. Texas had erased a 12-point deficit in the
  final 6:42.</p>

<StatTiles :items="stats" />

The game often called “2005 USC–Texas” was played on **January 4, 2006**, to decide the
**2005-season championship**. This demo uses USC’s official archived game report: box score,
scoring summary, drive chart, individual statistics and play-by-play. All 48 charts are live
Holochart examples, with the same data available in the sandbox and gallery. Hover for details,
drag to zoom, click legend entries to isolate a series, and drag the 3D charts to rotate them.
Texas is **orange**; USC is **red**. Axes and labels identify the teams as well as the colors.

[Jump to the box score](#the-box-score) · [Explore the drives](#twenty-six-possessions) ·
[Compare the players](#the-players) · [Inspect every play](#every-offensive-play)

## The game, minute by minute

Texas scored the final 15 points. USC led 38–26 with 6:42 left; Vince Young’s fourth-down touchdown and two-point run made it 41–38 with 19 seconds remaining.

### The race to 41

Step lines change only when points are scored. Texas took the lead for the last time with 19 seconds left.

<Example id="demos/usc-texas/score-line" bare :height="460" />

### Who had the lead

Above zero, Texas leads; below zero, USC leads. The orange finish is only 19 seconds wide.

<Example id="demos/usc-texas/lead-area" bare :height="420" />

### Four very different quarters

Texas scored 16 points in the second quarter and 18 in the fourth. USC scored 28 points after halftime.

<Example id="demos/usc-texas/quarter-bars" bare :height="420" />

### Every swing of the margin

Each scoring event adds Texas points or subtracts USC points. The running total ends at Texas +3. Touchdowns include the subsequent extra point or conversion.

<Example id="demos/usc-texas/scoring-waterfall" bare :height="480" />

### Sixty minutes around the dial

One revolution is the game: kickoff at the top, then Q2, Q3 and Q4 clockwise. Each spoke marks a scoring event; its height is the points added.

<Example id="demos/usc-texas/scoring-clock" bare :height="520" />

### A lead is not a result

Time spent ahead, measured between scoring events. Tied time includes the opening 2:33. This is clock time, not a win-probability estimate.

<Example id="demos/usc-texas/lead-time" bare :height="460" />

### All thirteen scoring events

The score column always lists Texas first. Touchdown rows include the points from the following kick or two-point conversion.

<Example id="demos/usc-texas/scoring-table" bare :height="540" />

## The box score

USC gained 18 more yards and possessed the ball for four more minutes. Texas gained more per offensive play and committed one fewer turnover.

### Two paths to the end zone

Stacked rushing and passing yardage: Texas 556 total yards, USC 574. Passing yards are counted once, rather than being added again as receiving yards.

<Example id="demos/usc-texas/offense-stack" bare :height="420" />

### Run or throw

Official rushing and passing attempts. Under college scoring rules, sacks are charged against rushing.

<Example id="demos/usc-texas/play-mix" bare :height="420" />

### What each attempt produced

Net yards divided by the official attempts: Texas gained 8.03 per rush; USC gained 8.90 per pass attempt. Total-play efficiency uses rushing plus passing attempts.

<Example id="demos/usc-texas/efficiency" bare :height="420" />

### Thirty first downs apiece

The totals match, but Texas earned more on the ground and USC earned more through the air and by penalty.

<Example id="demos/usc-texas/first-downs" bare :height="420" />

### Moving the chains

Third down: Texas 3/11, USC 8/14. Fourth down: Texas 1/2, USC 1/3. Red-zone scores: Texas 5/6, USC 4/5. Red-zone scoring includes field goals.

<Example id="demos/usc-texas/conversions" bare :height="420" />

### Thirty-two minutes to twenty-eight

USC’s possession advantage did not produce a scoring advantage. Both values come from the official time-of-possession totals.

<Example id="demos/usc-texas/possession" bare :height="460" />

### Possession by quarter

Each stacked pair adds to 15 minutes. USC held the ball longer in every quarter.

<Example id="demos/usc-texas/quarter-possession" bare :height="420" />

### Yards given away

Penalty yardage and yards lost on rushing plays, shown separately. These are different official categories and should not be added to total offense.

<Example id="demos/usc-texas/penalties" bare :height="420" />

### Loose balls and lost possessions

Texas fumbled four times but lost only one. USC lost its only fumble and threw the game’s only interception.

<Example id="demos/usc-texas/turnovers" bare :height="420" />

## Twenty-six possessions

The official drive chart includes a zero-play Texas punt-return fumble. The Sankey includes that possession; charts of drive length and efficiency use the 25 possessions with at least one recorded play. Drive play counts include punts and field-goal attempts.

### Who had the ball, and when

Every nonzero drive positioned on the game clock. Bars can span quarter boundaries. Hover for the result, duration, plays and yards.

<Example id="demos/usc-texas/drive-timeline" bare :height="720" />

### How far each possession traveled

Official net drive yardage, in game order. Penalties affect drive distance, so adding these bars does not reproduce net offensive yardage.

<Example id="demos/usc-texas/drive-distance" bare :height="440" />

### Long drives, quick drives

Plays against drive yards. Larger circles represent more points: size is 8 + 3 × points in pixels. Empty possessions are the smallest circles.

<Example id="demos/usc-texas/drive-bubbles" bare :height="460" />

### Starting territory

Starting field position against net drive yards. A position of 20 means the offense’s own 20-yard line, regardless of team.

<Example id="demos/usc-texas/field-position" bare :height="460" />

### The spread of drive lengths

Boxes summarize the nonzero drives for each team; dots show each actual drive, including negative net yardage.

<Example id="demos/usc-texas/drive-box" bare :height="460" />

### Ten-yard bins

A histogram of official net drive yardage, with 10-yard bins. The overlap makes the shared cluster of long drives visible.

<Example id="demos/usc-texas/drive-histogram" bare :height="440" />

### The anatomy of a possession

Each line is a drive, linking team, start field, play count, yardage, duration and points. Drag along an axis to brush a range.

<Example id="demos/usc-texas/drive-parcoords" bare :height="460" />

### Two halves, different outcomes

Drive counts flow from team through the half in which the possession started to its recorded result. A drive crossing halftime is not split.

<Example id="demos/usc-texas/drive-parcats" bare :height="500" />

### Where the possessions ended

All 26 possessions, including the zero-play punt-return fumble. Flow width is the number of drives. The source labels both half-ending and game-ending possessions “End of half.”

<Example id="demos/usc-texas/drive-sankey" bare :height="500" />

### The pace of scoring

Only scoring possessions: net yards against elapsed minutes. Texas’s final touchdown drive covered 56 net yards in 1:50.

<Example id="demos/usc-texas/scoring-drive-speed" bare :height="460" />

## The players

Vince Young generated 467 yards of offense: 267 passing and 200 rushing. Receiving yards are credits for those same pass plays; the scrimmage charts combine only rushing and receiving.

### Every rushing contribution

Net rushing yards, including TEAM’s kneel-down and negative player totals. Team color stays consistent throughout the demo.

<Example id="demos/usc-texas/rushing" bare :height="500" />

### Yards per carry

Net rushing yards divided by attempts. Sacks are deducted from Matt Leinart’s rushing total. Small samples, such as one carry, remain visible.

<Example id="demos/usc-texas/rushing-efficiency" bare :height="500" />

### Every receiving contribution

Official receiving totals, including the negative-yard catches by Texas backs.

<Example id="demos/usc-texas/receiving" bare :height="570" />

### Volume and distance

Receptions against receiving yards. Marker diameter is 8 + longest reception / 2 pixels; hover gives the exact longest catch.

<Example id="demos/usc-texas/receiver-bubbles" bare :height="500" />

### Rushes plus receptions

Each player’s net rushing and receiving yards combined. Quarterback passing yards are excluded to avoid counting a completed pass twice.

<Example id="demos/usc-texas/scrimmage" bare :height="650" />

### Where the yardage came from

Team → rush or reception → player. Area represents positive player-category net yardage. Negative categories and TEAM are omitted, so this tree is not a total-offense reconciliation.

<Example id="demos/usc-texas/player-treemap" bare :height="580" />

### The same offense in rings

The hierarchy from the treemap shown radially. Click a branch to explore it. Only positive net player-category totals are represented.

<Example id="demos/usc-texas/player-sunburst" bare :height="580" />

### Who put points on the board

Touchdowns credit six points to the scorer, kicks credit the kicker, and Young receives the two-point conversion. The bars sum to all 79 points.

<Example id="demos/usc-texas/scoring-players" bare :height="500" />

### Two championship quarterbacks

Vince Young: 267 passing + 200 rushing. Matt Leinart: 365 passing + 2 net rushing, after sack yardage. USC’s other pass attempt was by Dwayne Jarrett.

<Example id="demos/usc-texas/quarterbacks" bare :height="440" />

### The leading tacklers

The 14 highest individual tackle totals in USC’s official report, split into solo and assisted tackles. TEAM credits are excluded.

<Example id="demos/usc-texas/defense" bare :height="620" />

## Every offensive play

The 158 recorded offensive plays reproduce the official rushing and passing yardage for both teams. Kicks, conversion attempts, administrative rows and plays marked NO PLAY are excluded. Sacks are grouped with rushing to follow college box-score accounting; incompletions and interceptions contribute zero offensive yards. On Young’s lateral to Selvin Young, the snap’s gain is 22 yards; the individual rushing credits are 10 and 12.

### One dot per offensive play

Circles are rushes and diamonds are passes; larger dots are touchdowns. The horizontal axis is play order, not elapsed time.

<Example id="demos/usc-texas/snap-gains" bare :height="480" />

### How often did a play break loose

Five-yard bins of net offensive gains. Zero includes incompletions, interceptions and runs with no gain.

<Example id="demos/usc-texas/gain-histogram" bare :height="440" />

### The typical gain and the outliers

Every play is a dot. The box gives the median and interquartile range; the long upper tail contains the explosive gains.

<Example id="demos/usc-texas/gain-box" bare :height="460" />

### The shape of the game

Smoothed gain distributions with inner boxes. The smoothing describes this game’s observed plays; it is not a prediction model.

<Example id="demos/usc-texas/gain-violin" bare :height="460" />

### Yards gained by down

Average net offensive gain at each down, including zero-yard pass attempts. Fourth down has a very small sample; special-teams attempts are excluded.

<Example id="demos/usc-texas/down-heatmap" bare :height="420" />

### Ten, twenty, thirty

Counts of offensive plays gaining at least 10, 20 and 30 yards. These thresholds overlap: every 30-yard play also counts in the other two bars.

<Example id="demos/usc-texas/explosives" bare :height="440" />

### Building up 1,130 yards

Net offensive yardage accumulates in game order, including downward steps for losses. The endpoints reconcile to Texas 556 and USC 574.

<Example id="demos/usc-texas/cumulative-yards" bare :height="460" />

### How the offense changed

Net rushing and passing yards for each team and quarter, assigned to the quarter of the snap. Sacks remain in rushing.

<Example id="demos/usc-texas/run-pass-quarter" bare :height="460" />

### Down, distance, territory, gain

A scatterplot matrix of down, yards to go, field position and net gain. Texas is orange and USC is red. The diagonal and duplicate upper triangle are hidden.

<Example id="demos/usc-texas/play-splom" bare :height="650" />

### The game as a point cloud

Play order, offensive field position and net gain in three dimensions. Hover for the play details and drag to orbit.

<Example id="demos/usc-texas/play-3d" bare :height="600" />

### The scoreboard in three dimensions

The quarter-by-quarter score as eight extruded bars. Rotate the view to inspect each team’s row.

<Example id="demos/usc-texas/quarter-3d" bare :height="560" />

### Fourth and five, for the title

The last ten Texas offensive plays. Bars show gains (orange rush, blue pass); the pale line shows field position on the right axis. An accepted USC penalty moves the ball between snaps and is not an offensive gain. Young’s last run gains eight yards from USC’s 8-yard line.

<Example id="demos/usc-texas/final-drive" bare :height="500" />

## Sources and accounting

The data is a static snapshot of the [USC official game report](https://usc_ftp.sidearmsports.com/custompages/sports/m-footbl/stats/2005-2006-texas.html),
checked against [Texas’s official report](https://stats.texassports.com/custompages/sports/m-footbl/archive/stats/05/rosebowl.htm)
and the [USC box-score page](https://usctrojans.com/sports/football/stats/2005/texas/boxscore/3393).
The archived schools’ reports differ on a few individual defensive credits and longest-run
fields. This demo consistently follows USC’s report for those fields. It shows the recorded
on-field game result.

The play importer checks both teams’ net passing and rushing totals, all scoring events, and
possession durations against the official box score. Drive yardage includes changes from
penalties; offensive yardage does not. The final-drive field-position line uses each recorded
snap’s start plus its credited gain, so an accepted penalty can create a jump before the next
snap. Two-point attempts contribute to the score, but not to offensive yardage. Statistical
plots describe this single game; no win probabilities or tracking coordinates are invented.

The normalized dataset and reproducible importer live in
`examples/demos/usc-texas/data/`; the shared figure builders live in `charts.mts`.
