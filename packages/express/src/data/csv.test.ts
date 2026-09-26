import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fromCSV, parseCSVRecords } from './csv.ts';

describe('parseCSVRecords (RFC 4180)', () => {
  it('splits fields and records on CRLF, LF and CR, ignoring a final line break', () => {
    expect(parseCSVRecords('a,b\r\n1,2\n3,4\r5,6\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
    ]);
  });

  it('reads quoted fields with delimiters, line breaks and doubled quotes', () => {
    expect(parseCSVRecords('"a,b","say ""hi""","two\r\nlines",""\n')).toEqual([
      ['a,b', 'say "hi"', 'two\r\nlines', ''],
    ]);
  });

  it('keeps empty fields and whitespace, drops a BOM', () => {
    expect(parseCSVRecords('﻿a, b ,\n,,')).toEqual([
      ['a', ' b ', ''],
      ['', '', ''],
    ]);
  });

  it('takes other delimiters', () => {
    expect(parseCSVRecords('a;b\n"x;y";2', ';')).toEqual([
      ['a', 'b'],
      ['x;y', '2'],
    ]);
    expect(() => parseCSVRecords('a', '"')).toThrow(/delimiter/);
  });

  it('reports malformed quoting with the line number', () => {
    expect(() => parseCSVRecords('a\n"open')).toThrow(/opened on line 2 never closes/);
    expect(() => parseCSVRecords('a\n"x"y')).toThrow(/after a closing quote on line 2/);
    expect(() => parseCSVRecords('a\nb"c')).toThrow(/quote inside an unquoted field on line 2/);
  });

  it('round-trips any table written with RFC 4180 quoting (property)', () => {
    const field = fc.string({ unit: fc.constantFrom('a', 'b', ',', '"', '\n', '\r\n', ' ', 'é') });
    const quote = (s: string) =>
      /[",\r\n]/.test(s) || s === '' ? `"${s.replace(/"/g, '""')}"` : s;
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 4 })
          .chain((w) =>
            fc.array(fc.array(field, { minLength: w, maxLength: w }), { minLength: 1 }),
          ),
        (records) => {
          const text = records.map((r) => r.map(quote).join(',')).join('\r\n');
          expect(parseCSVRecords(text)).toEqual(records);
        },
      ),
    );
  });
});

describe('fromCSV', () => {
  it('types numeric columns, keeps dates and text as strings, empty fields as null', () => {
    const t = fromCSV('city,temp,date,code\n"Paris, FR",21.5,2024-03-01,007\nOslo,,2024-03-02,x\n');
    expect(t.names).toEqual(['city', 'temp', 'date', 'code']);
    expect(t.column('city')).toEqual(['Paris, FR', 'Oslo']);
    expect(t.column('temp')).toEqual([21.5, null]);
    expect(t.column('date')).toEqual(['2024-03-01', '2024-03-02']);
    expect(t.column('code')).toEqual(['007', 'x']);
    expect([t.type('temp'), t.type('date'), t.type('city')]).toEqual([
      'numeric',
      'date',
      'categorical',
    ]);
  });

  it('parses exponents, signs, NaN and infinities', () => {
    const t = fromCSV('v\n1e3\n-2.5\n.5\n+4\nNaN\ninf\n-Infinity');
    expect(t.column('v')).toEqual([1000, -2.5, 0.5, 4, NaN, Infinity, -Infinity]);
  });

  it('names unnamed and repeated header fields like pandas', () => {
    expect(fromCSV(',a,a,a\n1,2,3,4').names).toEqual(['Unnamed: 0', 'a', 'a.1', 'a.2']);
  });

  it('pads short records, rejects long ones', () => {
    expect(fromCSV('a,b\n1').column('b')).toEqual([null]);
    expect(() => fromCSV('a,b\n1,2,3')).toThrow(/record 2 has 3 fields; the header has 2/);
  });

  it('reads headerless and untyped text', () => {
    const t = fromCSV('1,x\n2,y', { header: false, typed: false });
    expect(t.names).toEqual(['0', '1']);
    expect(t.column('0')).toEqual(['1', '2']);
    expect(fromCSV('a\n\n').column('a')).toEqual([null]);
    expect(fromCSV('').length).toBe(0);
  });
});
