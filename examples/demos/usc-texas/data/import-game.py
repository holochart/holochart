"""Rebuild the factual game dataset from USC's archived official statistics."""
import json, re, sys
from html.parser import HTMLParser
from pathlib import Path
URL = 'https://usc_ftp.sidearmsports.com/custompages/sports/m-footbl/stats/2005-2006-texas.html'
class Text(HTMLParser):
    def __init__(self): super().__init__(); self.parts = []
    def handle_data(self, data): self.parts.append(data)
def seconds(s):
    m, s = map(int, s.split(':')); return m * 60 + s
def name(s):
    if s.upper() == 'TEAM': return 'TEAM'
    if ',' not in s: return s
    last, first = s.split(',', 1)
    # Normalize abbreviated names without changing statistical credits.
    first = {'Michae': 'Michael', 'Robe': 'Robert'}.get(first.strip(), first.strip())
    return first + ' ' + last.strip()
def pos(spot, team):
    side, n = spot[0], int(spot[1:]); return n if side == ('U' if team == 'Texas' else 'H') else 100-n
p = Text(); p.feed(Path(sys.argv[1]).read_text()); text = ''.join(p.parts)
# Team totals are transcribed; all detailed observations below are extracted.
teams = [
 dict(name='Texas', score=41, quarters=[0,16,7,18], rush=289, passYards=267, rushAtt=36, passAtt=40, completions=30, interceptions=0, firstDowns=[15,14,1], third=[3,11], fourth=[1,2], redZone=[5,6], possession=[398,429,426,427], penalties=[4,34], fumbles=[4,1], sacks=0),
 dict(name='USC', score=38, quarters=[7,3,14,14], rush=209, passYards=365, rushAtt=41, passAtt=41, completions=29, interceptions=1, firstDowns=[12,15,3], third=[8,14], fourth=[1,3], redZone=[4,5], possession=[502,471,474,473], penalties=[5,30], fumbles=[1,1], sacks=3),
]
individual = text[text.index('Individual Statistics (Final)'):text.index('Drive Chart (Final)')]
players=[]
for team, section in zip(['Texas','USC'], individual.split('Rushing')[1:]):
    rushing, rest = section.split('Passing',1); receiving = rest.split('Receiving',1)[1].split('Punting',1)[0]
    for line in rushing.splitlines():
        m = re.match(r'^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s+(-?[\d.]+)$',line)
        if m and not m[1].startswith('Totals'):
            players.append(dict(team=team,name=name(m[1].strip()),kind='Rush',attempts=int(m[2]),yards=int(m[5]),td=int(m[6]),long=int(m[7])))
    for line in receiving.splitlines():
        m=re.match(r'^(.+?)\s+(\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)$',line)
        if m and not m[1].startswith('Totals'):
            players.append(dict(team=team,name=name(m[1].strip()),kind='Reception',attempts=int(m[2]),yards=int(m[3]),td=int(m[4]),long=int(m[5])))
scoreSection = text[text.index('Scoring Summary:'):text.index('Kickoff time:')]
scores=[]; quarter=1; totals={'Texas':0,'USC':0}
for line in scoreSection.splitlines():
    m=re.match(r'\s*(?:(1st|2nd|3rd|4th)\s+)?(\d\d:\d\d) (UT|USC) - (.+)',line)
    if not m: continue
    if m[1]: quarter=int(m[1][0])
    team='Texas' if m[3]=='UT' else 'USC'; desc=m[4]; kind='Field goal' if 'field goal' in desc else 'Pass TD' if 'pass from' in desc else 'Rush TD'
    pts=3 if kind=='Field goal' else 6 if 'failed' in desc else 8 if 'rush)' in desc else 7
    totals[team]+=pts
    scorer=re.match(r'(.+?) (\d+) yd',desc)
    scores.append(dict(quarter=quarter,clock=m[2],elapsed=(quarter-1)*900+900-seconds(m[2]),team=team,kind=kind,player=name(scorer[1]),yards=int(scorer[2]),points=pts,texas=totals['Texas'],usc=totals['USC']))
drives=[]
section=text[text.index('Drive Chart (Final)'):text.index('UT                        1st')]
for line in section.splitlines():
    m=re.match(r'^(UT|USC)\s+(\d)(?:st|nd|rd|th)\s+([UH]\d+)\s+(\d\d:\d\d)\s+(.+?)\s+([UH]\d+)\s+(\d\d:\d\d)\s+(.+?)\s+(\d+)-(-?\d+)\s+(\d+:\d+)#?\s*$',line)
    if not m: continue
    team='Texas' if m[1]=='UT' else 'USC'; quarter=int(m[2]); duration=seconds(m[11]); outcome=m[8].replace('*','').title()
    # The zero-play muff has a spurious 00:00 start; place it at 13:39.
    start=(quarter-1)*900+900-seconds(m[4]) if duration else 81
    drives.append(dict(team=team,quarter=quarter,start=start,end=start+duration,clock=m[4],startField=pos(m[3],team),endField=pos(m[6],team),obtained=m[5],outcome=outcome,plays=int(m[9]),yards=int(m[10]),seconds=duration))
drives.sort(key=lambda d:(d['start'],0 if d['plays']==0 else 1))
for i,d in enumerate(drives): d['id']=i+1
# Parse offensive snaps; exclude special teams, administrative rows, and nullified plays.
section=text[text.index('Play-by-Play Summary (1st quarter)'):]
starts=list(re.finditer(r'^\s*([UH]) ([1-4])-(\d+|G)\s+([UH]\d+)\s+',section,re.M)); plays=[]; quarter=1
for i,m in enumerate(starts):
    b=section[m.end():starts[i+1].start() if i+1<len(starts) else len(section)]
    # The first action occurs before any quarter header; later headers update after prior action.
    action=b.split('---------------')[0].split('==END')[0].split('Play-by-Play Summary')[0]
    action=' '.join(action.split()); team='Texas' if m[1]=='U' else 'USC'; field=pos(m[4],team)
    kind='Pass' if ' pass ' in action else 'Rush' if ' rush ' in action or ' sacked ' in action else None
    if kind and 'NO PLAY' not in action and re.match(r'^[A-Za-z.]+, |^TEAM ', action):
        gainMatch=re.search(r'(?:for (loss of )?)(\d+) yards?',action)
        gain= (-1 if gainMatch and gainMatch[1] else 1)*int(gainMatch[2]) if gainMatch else 0
        if 'rush to' in action or ('pass complete' in action and not gainMatch):
            endpoint=re.search(r'at (UT|USC)(\d+)',action)
            if endpoint: gain=(int(endpoint[2]) if endpoint[1]==('UT' if team=='Texas' else 'USC') else 100-int(endpoint[2]))-field
        if 'Young, Selvin for 12 yards' in action: gain=22
        plays.append(dict(team=team,quarter=quarter,down=int(m[2]),toGo=100-field if m[3]=='G' else int(m[3]),field=field,kind=kind,yards=gain,complete='pass complete' in action,td='TOUCHDOWN' in action,first='1ST DOWN' in action,player=name(re.split(r' rush | pass | sacked ',action)[0]),sack=' sacked ' in action))
    q=re.search(r'Play-by-Play Summary \((\d)(?:st|nd|rd|th) quarter\)',b)
    if q: quarter=int(q[1])
for i,p in enumerate(plays): p['id']=i+1
# Tackles: preserve the official source's individual attribution, with TEAM separate.
defense=[]
section=text[text.index('Defensive Statistics (Final)'):text.index('Game Participation') if text.index('Game Participation') > text.index('Defensive Statistics (Final)') else text.index('Box Score (Final)')]
team='Texas'
for line in section.splitlines():
    if line.strip()=='USC Trojans': team='USC'
    m=re.match(r'^\w+\s+([A-Za-z.]+, [A-Za-z.]+|TEAM|Team)\s+(\d+|\.)\s+(\d+|\.)\s+(\d+)\s+',line)
    if m: defense.append(dict(team=team,name=name(m[1].strip()),solo=0 if m[2]=='.' else int(m[2]),assists=0 if m[3]=='.' else int(m[3]),total=int(m[4])))
game=dict(source=URL,date='2006-01-04',season=2005,teams=teams,players=players,scores=scores,drives=drives,plays=plays,defense=defense)
Path(__file__).with_name('game.json').write_text(json.dumps(game,indent=2)+'\n')
print('scores',len(scores),'drives',len(drives),'players',len(players),'snaps',len(plays),'defenders',len(defense))
for t in teams:
    print(t['name'], {k:sum(p['yards'] for p in plays if p['team']==t['name'] and p['kind']==k) for k in ['Rush','Pass']})
assert totals=={'Texas':41,'USC':38}
assert len(drives)==26 and len(scores)==13 and len(players)==24

assert len(plays) == 158
for t in teams:
    for kind, expected in [('Rush', t['rush']), ('Pass', t['passYards'])]:
        assert sum(p['yards'] for p in plays if p['team']==t['name'] and p['kind']==kind) == expected
    assert sum(d['seconds'] for d in drives if d['team']==t['name']) == sum(t['possession'])
