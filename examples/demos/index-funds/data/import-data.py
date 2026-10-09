#!/usr/bin/env python3
"""Builds market.json and holdings.json from raw downloads (see SOURCES.md).

    python3 import-data.py <raw-dir>

<raw-dir> holds one Yahoo Finance chart response per ticker (`SPY.json`, `%5EVIX.json`, ...) and
the State Street holdings workbooks (`spy-holdings.xlsx`, `dia-holdings.xlsx`, `xlk-holdings.xlsx`,
...). Standard library only: the workbooks are read as zipped XML.
"""
import datetime
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from zoneinfo import ZoneInfo

RAW = Path(sys.argv[1])
OUT = Path(__file__).parent
NY = ZoneInfo('America/New_York')

# First session kept (a year of run-up, so drawdowns see the 2021-22 highs and rolling windows are
# warm), the close the four years are measured from, the close that splits them, and the last one.
FIRST = '2021-10-01'
BASE = '2022-09-30'
SPLIT = '2024-09-30'
LAST = '2026-09-30'

GROUPS = {
    'funds': ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI'],
    'styles': ['RSP', 'MDY', 'VUG', 'VTV'],
    'sectors': ['XLK', 'XLC', 'XLY', 'XLF', 'XLV', 'XLI', 'XLP', 'XLE', 'XLU', 'XLB', 'XLRE'],
    'assets': ['VXUS', 'VEA', 'VWO', 'BND', 'TLT', 'GLD', 'BIL'],
    'stocks': ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO'],
}
INDICATORS = {'VIX': '%5EVIX', 'TNX': '%5ETNX', 'IRX': '%5EIRX'}
OHLCV = ['SPY', 'QQQ', 'DIA', 'IWM']


def sig(x, digits=6):
    return None if x is None else float(f'{x:.{digits}g}')


def load(name):
    r = json.loads((RAW / f'{name}.json').read_text())['chart']['result'][0]
    days = [datetime.datetime.fromtimestamp(t, NY).strftime('%Y-%m-%d') for t in r['timestamp']]
    q = r['indicators']['quote'][0]
    adj = r['indicators'].get('adjclose', [{}])[0].get('adjclose')
    events = r.get('events', {})
    return {
        'name': r['meta'].get('longName') or r['meta'].get('shortName'),
        'days': days,
        'quote': q,
        'adj': adj or q['close'],
        'dividends': sorted(
            [
                datetime.datetime.fromtimestamp(d['date'], NY).strftime('%Y-%m-%d'),
                sig(d['amount']),
            ]
            for d in events.get('dividends', {}).values()
        ),
    }


def aligned(src, field, calendar):
    """`field` on every calendar day; a missing day repeats the last value (yield indexes only)."""
    values = src['adj'] if field == 'adj' else src['quote'][field]
    by_day = {d: v for d, v in zip(src['days'], values) if v is not None}
    out, last = [], None
    for day in calendar:
        last = by_day.get(day, last)
        out.append(last)
    return out


spy = load('SPY')
calendar = [d for d in spy['days'] if FIRST <= d <= LAST]
assert BASE in calendar and SPLIT in calendar and calendar[-1] == LAST

market = {
    'retrieved': datetime.date.today().isoformat(),
    'source': 'Yahoo Finance chart endpoint (query1.finance.yahoo.com/v8/finance/chart)',
    'note': 'adjClose is split- and dividend-adjusted (total return). See SOURCES.md.',
    'date': calendar,
    'base': calendar.index(BASE),
    'split': calendar.index(SPLIT),
    'groups': GROUPS,
    'names': {},
    'adjClose': {},
    'indicators': {},
    'ohlcv': {},
    'dividends': {},
}
for group in GROUPS.values():
    for t in group:
        src = load(t)
        missing = [d for d in calendar if d not in src['days']]
        assert not missing, (t, missing[:3])
        market['names'][t] = src['name']
        market['adjClose'][t] = [sig(v) for v in aligned(src, 'adj', calendar)]
for key, name in INDICATORS.items():
    market['indicators'][key] = [sig(v, 5) for v in aligned(load(name), 'close', calendar)]
window = calendar[market['base'] :]
for t in OHLCV:
    src = load(t)
    market['ohlcv'][t] = {
        f: [sig(v) if f != 'volume' else v for v in aligned(src, f, window)]
        for f in ('open', 'high', 'low', 'close', 'volume')
    }
    market['dividends'][t] = [d for d in src['dividends'] if BASE < d[0] <= LAST]
(OUT / 'market.json').write_text(json.dumps(market, separators=(',', ':')) + '\n')

# --- Holdings ---------------------------------------------------------------------------------

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def sheet(path):
    z = zipfile.ZipFile(path)
    shared = [
        ''.join(t.text or '' for t in si.iter(f'{NS}t'))
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(f'{NS}si')
    ]
    name = next(n for n in z.namelist() if n.startswith('xl/worksheets/sheet'))
    rows = []
    for row in ET.fromstring(z.read(name)).iter(f'{NS}row'):
        cells = {}
        for c in row.findall(f'{NS}c'):
            v = c.find(f'{NS}v')
            col = re.match(r'[A-Z]+', c.get('r')).group(0)
            cells[col] = None if v is None else shared[int(v.text)] if c.get('t') == 's' else v.text
        rows.append(cells)
    return rows


def holdings(ticker):
    rows = sheet(RAW / f'{ticker.lower()}-holdings.xlsx')
    as_of = datetime.datetime.strptime(rows[2]['B'].replace('As of ', ''), '%d-%b-%Y')
    stocks = [
        {'ticker': r['B'], 'name': r['A'], 'weight': float(r['E'])}
        for r in rows[4:]
        if r.get('B') and r.get('E') and r['B'] != '-' and r.get('H') == 'USD' and float(r['E']) >= 1e-4
    ]
    return as_of.strftime('%Y-%m-%d'), stocks


SMALL = {'Of', 'And', 'The', 'De', 'For'}
UPPER = {'Inc', 'Corp', 'Co', 'Ltd', 'Plc', 'Cl', 'Nv', 'Sa', 'Lp'}
KEEP = {'IBM', '3M', 'AT&T', 'HP', 'GE', 'CVS', 'KLA', 'AMD', 'HCA', 'RTX'}
FIX = {'Jpmorgan': 'JPMorgan', 'Nvidia': 'NVIDIA'}
# Names the rules below get wrong, for the holdings people look for first.
NAMES = {
    'ABBV': 'AbbVie',
    'AMD': 'AMD',
    'AMZN': 'Amazon',
    'GOOG': 'Alphabet (C)',
    'GOOGL': 'Alphabet (A)',
    'IBM': 'IBM',
    'KO': 'Coca-Cola',
    'MCD': "McDonald's",
    'PLTR': 'Palantir',
    'SHW': 'Sherwin-Williams',
    'UNH': 'UnitedHealth Group',
    'XOM': 'Exxon Mobil',
}


def title(name):
    name = re.sub(r'[\s-]+(CL(ASS)? )?[A-C]( SHARES)?$', '', name.replace(' + ', ' & '))
    name = re.sub(r'\s+(INC|CORP|CO|COS|PLC|LTD|NV|SA|LP)(/THE)?\b\.?', '', name)
    name = re.sub(r'(/(THE|DE|NEW)|\s+&)$', '', name.strip())
    words = []
    for i, w in enumerate(name.split()):
        if w in KEEP or '&' in w and len(w) <= 4:
            words.append(w)
            continue
        w = '-'.join(p.capitalize() for p in w.split('-'))
        w = FIX.get(w, w)
        words.append(w.lower() if i and w in SMALL else w)
    return ' '.join(words)


sector_of = {}
for etf in GROUPS['sectors']:
    for h in holdings(etf)[1]:
        sector_of[h['ticker']] = etf

out = {}
for fund in ('SPY', 'DIA'):
    as_of, stocks = holdings(fund)
    total = sum(h['weight'] for h in stocks)
    out[fund] = {
        'asOf': as_of,
        'holdings': [
            {
                'ticker': h['ticker'],
                'name': NAMES.get(h['ticker']) or title(h['name']),
                # Weight in percent of the stock portfolio (cash excluded).
                'weight': round(h['weight'] / total * 100, 4),
                **({'sector': sector_of[h['ticker']]} if fund == 'SPY' else {}),
            }
            for h in sorted(stocks, key=lambda h: -h['weight'])
        ],
    }
(OUT / 'holdings.json').write_text(json.dumps(out, separators=(',', ':')) + '\n')
print(len(calendar), 'sessions', calendar[0], '…', calendar[-1], '| base', market['base'], 'split', market['split'])
print({k: len(v['holdings']) for k, v in out.items()})
