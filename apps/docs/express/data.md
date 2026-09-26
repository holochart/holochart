---
title: Data input
description: Rows, columns, Arrow tables and CSV text as Express data, with column references and type inference.
status: complete
---

# Data input

Express functions take a table as their first argument (after the element, when drawing
directly). Four shapes work, and they all give the same figure:

| Shape       | Example                                                 | Notes                                         |
| ----------- | ------------------------------------------------------- | --------------------------------------------- |
| Rows        | `[{ day: 'Sat', tip: 3.5 }, { day: 'Sun', tip: 2 }]`    | Columns are the keys, in first-seen order     |
| Columns     | `{ day: ['Sat', 'Sun'], tip: Float64Array.of(3.5, 2) }` | All columns the same length                   |
| Arrow table | an `apache-arrow` `Table`                               | Duck-typed: `numRows`, `schema`, `getChild()` |
| CSV         | `fromCSV(text)`                                         | RFC 4180, typed like pandas' `read_csv`       |

<Example id="express/histogram-facets" :height="480" />

```ts
import hx from '@mk7s/holochart-express';

const rows = [
  { day: 'Sat', total_bill: 20.1, sex: 'Male' },
  { day: 'Sun', total_bill: 17.5, sex: 'Female' },
];
const columns = { day: ['Sat', 'Sun'], total_bill: [20.1, 17.5], sex: ['Male', 'Female'] };

hx.histogram(rows, { x: 'total_bill', color: 'sex' });
hx.histogram(columns, { x: 'total_bill', color: 'sex' }); // the same figure
```

## Column references

Every column option takes a column name, or the values themselves as an array (as px allows). An
array gets the option's name as its column name in hover lines and titles, so `labels` can rename
it:

```ts
import hx from '@mk7s/holochart-express';

const weights = [1.2, 3.4, 2.2];
hx.scatter(null, {
  x: [1, 2, 3],
  y: weights,
  color: ['a', 'b', 'a'],
  labels: { y: 'weight (kg)' },
});
```

With `null` (or `undefined`) as the data, every column comes from arrays. A name that is not a
column throws, listing the columns there are; an array of the wrong length throws too.

## Arrow tables

Pass an [Apache Arrow](https://arrow.apache.org/docs/js/) `Table` as it is. Express reads it
through `numRows`, `schema.fields` and `getChild(name)`, without depending on Arrow itself, so any
object with that shape works. Int64 and timestamp columns (bigints) become numbers.

```ts
import hx from '@mk7s/holochart-express';
import type { ArrowLikeTable } from '@mk7s/holochart-express';

declare const table: ArrowLikeTable; // e.g. tableFromIPC(await fetch(url).then((r) => r.arrayBuffer()))
hx.line(table, { x: 'date', y: 'close', color: 'symbol' });
```

## CSV

`fromCSV` (also `hx.data.fromCSV`) parses RFC 4180 text into a `Table` that every function takes:

```ts
import hx, { fromCSV } from '@mk7s/holochart-express';

const table = fromCSV('city,temp,date\n"Paris, FR",21.5,2024-03-01\nOslo,,2024-03-02\n');
table.column('temp'); // [21.5, null]
hx.bar(table, { x: 'city', y: 'temp' });
```

- Fields are separated by commas (`delimiter` changes it) and records by CRLF, LF or CR. A field
  in double quotes may hold delimiters, line breaks and doubled quotes (`""` is one `"`).
- The first record names the columns (`header: false` names them `0`, `1`, …). Empty names become
  `Unnamed: 0`, repeated names get `.1`, `.2`, as in pandas.
- A column whose non-empty fields are all numbers (`12`, `-3.5`, `1e-3`, `NaN`, `inf`) becomes
  numbers; empty fields are missing (`null`) in every column. `typed: false` keeps every field as
  its string.
- Dates stay ISO strings, which Express and date axes read as dates.
- Malformed quoting and records longer than the header throw with the line or record number.

Fetching the text is up to you (`await fetch(url).then((r) => r.text())`).

## Column types

Express infers each column's type the way pandas dtypes drive px, and uses it to decide how a
column maps:

| Type          | When                                                                 | Used for                                     |
| ------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `numeric`     | every present value is a number (or bigint)                          | continuous `color`, orientation, ranges, KDE |
| `date`        | every present value is a `Date` or an ISO date string (`2024-03-01`) | written as date strings; date axes           |
| `categorical` | anything else: strings, booleans, mixes, numeric strings (`'42'`)    | groups, category axes                        |

Missing values (`null`, `undefined`, `NaN`) are ignored when inferring. `Date` objects are written
into figures as UTC date strings (`2024-03-01`, `2024-03-01 12:30`), so figures stay JSON. Rows
whose grouping value is missing are left out, as pandas' `groupby` drops them.

`columnTypes(data)` shows what Express sees, and `toTable(data)` gives the normalized `Table`
(`names`, `length`, `column(name)`, `type(name)`, `toRows()`, `toColumns()`):

```ts
import { columnTypes, toTable } from '@mk7s/holochart-express';

columnTypes([{ day: 'Sat', tip: 3.5, when: '2024-03-02' }]);
// { day: 'categorical', tip: 'numeric', when: 'date' }
toTable({ a: [1, 2], b: ['x', 'y'] }).toRows(); // [{ a: 1, b: 'x' }, { a: 2, b: 'y' }]
```
