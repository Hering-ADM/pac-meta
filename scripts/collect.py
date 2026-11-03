"""Baixa os resultados oficiais do MTGO (mtgo.com/decklists) e guarda uma versão compacta por evento.

Cada evento vira data/raw/<site_name>.json e nunca é baixado de novo.
"""
import datetime as dt, json, os, re, sys, time
from common import get, load, save, RAW, FORMATS

BASE = 'https://www.mtgo.com'
KEEP_DAYS = int(os.environ.get('KEEP_DAYS', '30'))
MAX_NEW = int(os.environ.get('MAX_NEW', '180'))  # por execução; o resto vem nas próximas horas


def month_links(y, m):
    html = get(f'{BASE}/decklists/{y}/{m:02d}').decode('utf-8', 'replace')
    return sorted(set(re.findall(r'href="(/decklist/[^"#?]+)"', html)))


def fmt_of(site_name):
    first = site_name.split('-')[0]
    return first if first in FORMATS else None


def kind_of(site_name):
    s = site_name.lower()
    for k in ('showcase', 'challenge', 'qualifier', 'champions', 'super', 'last-chance', 'preliminary', 'league'):
        if k in s: return k
    return 'outro'


def extract(html):
    i = html.find('window.MTGO.decklists.data')
    if i < 0: return None
    j = html.find('{', i)
    obj, _ = json.JSONDecoder().raw_decode(html[j:])
    return obj


def compact(site_name, d):
    stand = {str(s.get('loginid')): s for s in d.get('standings') or []}
    wl = {str(s.get('loginid')): s for s in d.get('winloss') or []}
    final = {str(s.get('loginid')): int(s.get('rank') or 0) for s in d.get('final_rank') or []}
    colors = {}
    decks = []
    for dl in d.get('decklists') or []:
        lid = str(dl.get('loginid'))
        def cards(lst):
            acc = {}
            for c in lst or []:
                a = c.get('card_attributes') or {}
                n = (a.get('card_name') or '').strip()
                if not n: continue
                acc[n] = acc.get(n, 0) + int(c.get('qty') or 0)
                cs = [x.replace('COLOR_', '')[0] if x != 'COLOR_BLUE' else 'U' for x in a.get('colors') or []]
                colors[n] = [x for x in cs if x in 'WUBRG']
                if (a.get('card_type') or '').strip().startswith('LAND'): colors[n] = ['L']
            return [[q, n] for n, q in sorted(acc.items(), key=lambda kv: (-kv[1], kv[0]))]
        st = stand.get(lid, {})
        w = wl.get(lid, {})
        rank = final.get(lid) or int(st.get('rank') or 0) or None
        decks.append({
            'player': dl.get('player') or st.get('login_name') or '?',
            'rank': rank,
            'wins': int(w['wins']) if w.get('wins') not in (None, '') else None,
            'losses': int(w['losses']) if w.get('losses') not in (None, '') else None,
            'main': cards(dl.get('main_deck')), 'side': cards(dl.get('sideboard_deck')),
        })
    kind = kind_of(site_name)
    if kind == 'league':
        for x in decks:
            if x['wins'] is None: x['wins'], x['losses'] = 5, 0
    decks.sort(key=lambda x: (x['rank'] or 999, -(x['wins'] or 0), x['player'].lower()))
    pc = d.get('player_count') or {}
    return {
        'id': site_name, 'name': d.get('description') or site_name, 'date': (d.get('starttime') or '')[:10],
        'format': fmt_of(site_name), 'kind': kind,
        'players': int(pc.get('players')) if isinstance(pc, dict) and pc.get('players') else None,
        'url': f'{BASE}/decklist/{site_name}', 'colors': colors, 'decks': decks,
    }


def main():
    today = dt.date.today()
    start = today - dt.timedelta(days=KEEP_DAYS)
    cutoff = start.isoformat()
    months, cur = [], today.replace(day=1)
    while cur >= start.replace(day=1):
        months.append((cur.year, cur.month)); cur = (cur - dt.timedelta(days=1)).replace(day=1)
    os.makedirs(RAW, exist_ok=True)
    have = {f[:-5] for f in os.listdir(RAW) if f.endswith('.json')}
    novos = 0
    links = []
    for y, m in months:
        try:
            links += month_links(y, m)
        except Exception as e:
            print('falha na lista', y, m, e, file=sys.stderr, flush=True)
    def dkey(hh):
        mm = re.search(r'(\d{4}-\d{2}-\d{2})', hh); return mm.group(1) if mm else ''
    links = sorted(set(links), key=dkey, reverse=True)  # mais recentes primeiro
    t0 = time.time()
    for href in links:
        if novos >= MAX_NEW or time.time() - t0 > 20 * 60: break
        site = href.rsplit('/', 1)[-1]
        if site in have or not fmt_of(site): continue
        mdate = re.search(r'(\d{4})-(\d{2})-(\d{2})', site)
        if mdate and '-'.join(mdate.groups()) < cutoff: continue
        try:
            html = get(BASE + href).decode('utf-8', 'replace')
            d = extract(html)
        except Exception as e:
            print('falha', site, e, file=sys.stderr, flush=True); continue
        if not d or not d.get('decklists'):
            continue  # evento ainda sem listas publicadas: tenta na próxima hora
        save(os.path.join(RAW, site + '.json'), compact(site, d))
        have.add(site); novos += 1
        print('ok', site, len(d.get('decklists') or []), flush=True)
        time.sleep(0.5)
    # remove eventos fora da janela
    for f in os.listdir(RAW):
        ev = load(os.path.join(RAW, f), {})
        if ev.get('date') and ev['date'] < cutoff: os.remove(os.path.join(RAW, f))
    print('eventos novos:', novos)


if __name__ == '__main__':
    main()
