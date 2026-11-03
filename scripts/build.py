"""Monta os dados do site (site/data) a partir dos eventos coletados e dos preços."""
import datetime as dt, json, math, os, shutil, collections
from common import load, save, slug, RAW, DATA, OUT, FORMATS

GUILDS = {'': 'Incolor', 'W': 'Mono-White', 'U': 'Mono-Blue', 'B': 'Mono-Black', 'R': 'Mono-Red', 'G': 'Mono-Green',
          'WU': 'Azorius', 'UB': 'Dimir', 'BR': 'Rakdos', 'RG': 'Gruul', 'WG': 'Selesnya', 'WB': 'Orzhov', 'UR': 'Izzet',
          'BG': 'Golgari', 'WR': 'Boros', 'UG': 'Simic', 'WUB': 'Esper', 'UBR': 'Grixis', 'BRG': 'Jund', 'WRG': 'Naya',
          'WUG': 'Bant', 'WBG': 'Abzan', 'WUR': 'Jeskai', 'UBG': 'Sultai', 'WBR': 'Mardu', 'URG': 'Temur'}
BASICS = {'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes', 'Snow-Covered Plains', 'Snow-Covered Island',
          'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest'}
ORDER = 'WUBRG'


def key(n): return n.split(' // ')[0].split('/')[0].strip().lower()


class Cards:
    def __init__(self, raw_colors):
        self.db = (load(os.path.join(DATA, 'cards.json'), {}) or {}).get('cards', {})
        self.raw = raw_colors
        hist = os.path.join(DATA, 'price_history')
        files = sorted(os.listdir(hist)) if os.path.isdir(hist) else []
        self.old = load(os.path.join(hist, files[-8]), {}) if len(files) >= 8 else (load(os.path.join(hist, files[0]), {}) if files else {})
    def info(self, n): return self.db.get(key(n), {})
    def is_land(self, n):
        t = self.info(n).get('type')
        if t: return 'Land' in t.split('//')[0]
        return self.raw.get(n) == ['L']
    def colors(self, n):
        i = self.info(n)
        if 'colors' in i: return i.get('colors') or []
        return [c for c in self.raw.get(n, []) if c in ORDER]
    def usd(self, n): return self.info(n).get('usd')
    def tix(self, n): return self.info(n).get('tix')


def deck_colors(d, C):
    cnt = collections.Counter()
    nonland = 0
    for q, n in d['main']:
        if C.is_land(n): continue
        nonland += q
        for c in C.colors(n): cnt[c] += q
    cs = [c for c in ORDER if cnt[c] >= max(4, 0.12 * nonland)]
    return ''.join(cs)


NAMECOL = {v.lower(): k for k, v in GUILDS.items()}
NAMECOL.update({'mono red': 'R', 'mono black': 'B', 'mono blue': 'U', 'mono green': 'G', 'mono white': 'W', 'white': 'W', 'blue': 'U', 'red': 'R', 'black': 'B', 'green': 'G'})


def load_ref():
    out = {}
    try:
        lines = open(os.path.join(DATA, 'archetypes_ref.txt'), encoding='utf-8').read().splitlines()
    except FileNotFoundError:
        return out
    for ln in lines:
        if not ln.strip() or ln.startswith('#'): continue
        fmt, name, cards = [x.strip() for x in ln.split('|')]
        cs = [c.strip() for c in cards.split(';') if c.strip()]
        req = [c[1:] for c in cs if c.startswith('!')]
        cs = [c.lstrip('!') for c in cs]
        low = name.lower(); col = None
        for k in sorted(NAMECOL, key=len, reverse=True):
            if low.startswith(k + ' ') or low == k: col = NAMECOL[k]; break
        out.setdefault(fmt, []).append({'name': name, 'cards': cs, 'req': req, 'col': col})
    return out


def ref_match(refs, names, col):
    best = None
    for i, r in enumerate(refs):
        if sum(1 for c in r['cards'] if c in names) < 2 or any(c not in names for c in r['req']): continue
        if r['col'] is None: sc = 1
        elif r['col'] == col: sc = 2
        elif set(r['col']) <= set(col): sc = 1
        else: sc = 0
        if best is None or sc > best[0]: best = (sc, i, r['name'])
        if sc == 2: break
    return best[2] if best else None


def match(rule, names):
    if any(n in names for n in rule.get('none', [])): return False
    return all(sum(1 for c in g['cards'] if c in names) >= g['min'] for g in rule['groups'])


def price(lst, C, f):
    tot, miss = 0.0, 0
    for q, n in lst:
        p = f(n)
        if p is None:
            if n not in BASICS: miss += 1
        else: tot += q * p
    if tot == 0 and miss: return None, miss
    return round(tot, 2), miss


def art_for(name, typ, rules_by_name, C):
    r = rules_by_name.get(name)
    names = [n for _, n in typ]
    cands = []
    if r:
        cands = [c for g in r['groups'] for c in g['cards'] if c in names]
    elif name.endswith(')') and '(' in name:
        cands = [name[name.rindex('(') + 1:-1]]
    cands += [n for n in names if not C.is_land(n)]
    for n in [c for c in cands if not C.is_land(c)] + cands:
        a = C.info(n).get('art')
        if a: return a
    return None


def avg_list(decks, part, total):
    n = len(decks)
    sums = collections.Counter(); incl = collections.Counter()
    for d in decks:
        for q, c in d[part]:
            sums[c] += q; incl[c] += 1
    avg = {c: sums[c] / n for c in sums}
    alloc = {c: min(math.floor(a), 4 if c not in BASICS else 99) for c, a in avg.items()}
    left = total - sum(alloc.values())
    rema = sorted(avg, key=lambda c: (avg[c] - math.floor(avg[c]), incl[c]), reverse=True)
    i = 0
    while left > 0 and i < len(rema) * 3:
        c = rema[i % len(rema)]
        if alloc[c] < (4 if c not in BASICS else 99) and (i >= len(rema) or avg[c] - alloc[c] > 0):
            alloc[c] += 1; left -= 1
        i += 1
    while left < 0:
        c = min((c for c in alloc if alloc[c] > 0), key=lambda c: avg[c])
        alloc[c] -= 1; left += 1
    typical = [[q, c] for c, q in sorted(alloc.items(), key=lambda kv: (-kv[1], kv[0])) if q > 0]
    stats = [{'card': c, 'avg': round(sums[c] / incl[c], 2), 'pct': round(100 * incl[c] / n, 1)} for c in sorted(sums, key=lambda c: (-incl[c], -sums[c], c))]
    return typical, stats


def main():
    events = []
    raw_colors = {}
    for f in sorted(os.listdir(RAW)):
        ev = load(os.path.join(RAW, f))
        if ev and ev.get('format') and ev.get('decks'):
            events.append(ev); raw_colors.update(ev.get('colors') or {})
    C = Cards(raw_colors)
    rules = load(os.path.join(DATA, 'archetypes.json'), {})
    rules_by_name = {r['name']: r for v in rules.values() for r in v}
    refs = load_ref()
    for v in refs.values():
        for r in v: rules_by_name.setdefault(r['name'], {'groups': [{'cards': r['cards'], 'min': 2}]})
    today = max([e['date'] for e in events] or [dt.date.today().isoformat()])
    td = dt.date.fromisoformat(today)
    since = lambda days: (td - dt.timedelta(days=days - 1)).isoformat()
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    index = {'updated': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'), 'latest': today, 'formats': [], 'events': []}
    card_index = {}
    for fmt, fname in FORMATS.items():
        evs = sorted([e for e in events if e['format'] == fmt], key=lambda e: (e['date'], e['id']), reverse=True)
        if not evs: continue
        all_decks = [(e, i, d) for e in evs for i, d in enumerate(e['decks'])]
        freq = collections.Counter()
        for _, _, d in all_decks:
            for _, n in d['main']:
                if not C.is_land(n): freq[n] += 1
        N = len(all_decks)
        for e, i, d in all_decks:
            names = {n for _, n in d['main']}
            arch = next((r['name'] for r in rules.get(fmt, []) if match(r, names)), None)
            col = deck_colors(d, C)
            if not arch:
                arch = ref_match(refs.get(fmt, []), names, col)
            if not arch:
                arch = GUILDS.get(col, col or 'Incolor')
            d['arch'] = arch; d['aslug'] = slug(arch); d['col'] = col
            d['usd'], d['usd_miss'] = price(d['main'] + d['side'], C, C.usd)
            d['tix'], _ = price(d['main'] + d['side'], C, C.tix)
        # metagame por janela
        meta = {'format': fmt, 'name': fname, 'updated': index['updated'], 'windows': {}}
        for days in (7, 14, 30):
            cur = [x for x in all_decks if x[0]['date'] >= since(days)]
            prev_from = (td - dt.timedelta(days=2 * days - 1)).isoformat()
            prev = [x for x in all_decks if prev_from <= x[0]['date'] < since(days)]
            ca = collections.Counter(x[2]['aslug'] for x in cur); pa = collections.Counter(x[2]['aslug'] for x in prev)
            names = {x[2]['aslug']: x[2]['arch'] for x in cur}
            top8 = collections.Counter(x[2]['aslug'] for x in cur if x[0]['kind'] != 'league' and (x[2]['rank'] or 99) <= 8)
            rows = []
            for s, k in ca.most_common():
                ds = [x[2] for x in cur if x[2]['aslug'] == s]
                typ, _ = avg_list(ds, 'main', 60)
                typs, _ = avg_list(ds, 'side', 15)
                inc = collections.Counter(n for d in ds for _, n in d['main'] if not C.is_land(n))
                rows.append({'slug': s, 'name': names[s], 'decks': k, 'share': round(100 * k / len(cur), 2),
                             'prev': round(100 * pa[s] / len(prev), 2) if prev else None, 'top8': top8[s],
                             'colors': collections.Counter(d['col'] for d in ds).most_common(1)[0][0],
                             'usd': price(typ + typs, C, C.usd)[0], 'tix': price(typ + typs, C, C.tix)[0],
                             'key': [n for n, _ in inc.most_common(4)], 'art': art_for(names[s], typ, rules_by_name, C)})
            meta['windows'][str(days)] = {'decks': len(cur), 'events': len({x[0]['id'] for x in cur}), 'rows': rows}
        save(os.path.join(OUT, fmt, 'meta.json'), meta)
        # páginas de arquétipo (30 dias)
        cur30 = [x for x in all_decks if x[0]['date'] >= since(30)]
        by = collections.defaultdict(list)
        for x in cur30: by[x[2]['aslug']].append(x)
        for s, xs in by.items():
            ds = [x[2] for x in xs]
            typ, st = avg_list(ds, 'main', 60); typs, sts = avg_list(ds, 'side', 15)
            save(os.path.join(OUT, fmt, 'arch', s + '.json'), {
                'format': fmt, 'slug': s, 'name': ds[0]['arch'], 'decks': len(ds), 'share': round(100 * len(ds) / max(1, len(cur30)), 2),
                'main': typ, 'side': typs, 'main_stats': st[:60], 'side_stats': sts[:40],
                'usd': price(typ + typs, C, C.usd)[0], 'tix': price(typ + typs, C, C.tix)[0], 'art': art_for(ds[0]['arch'], typ, rules_by_name, C),
                'recent': [{'ev': e['id'], 'evname': e['name'], 'date': e['date'], 'kind': e['kind'], 'i': i, 'player': d['player'],
                            'rank': d['rank'], 'w': d['wins'], 'l': d['losses'], 'usd': d['usd']} for e, i, d in xs[:60]]})
        # eventos
        lst = []
        for e in evs:
            win = e['decks'][0] if e['decks'] and e['kind'] != 'league' else None
            lst.append({'id': e['id'], 'name': e['name'], 'date': e['date'], 'kind': e['kind'], 'players': e['players'],
                        'decks': len(e['decks']), 'winner': win['player'] if win else None, 'warch': win['arch'] if win else None,
                        'waslug': win['aslug'] if win else None})
            save(os.path.join(OUT, 'event', e['id'] + '.json'), {
                'id': e['id'], 'name': e['name'], 'date': e['date'], 'kind': e['kind'], 'players': e['players'], 'format': fmt,
                'url': e['url'], 'decks': [{k: d[k] for k in ('player', 'rank', 'wins', 'losses', 'main', 'side', 'arch', 'aslug', 'usd', 'tix')} for d in e['decks']]})
        save(os.path.join(OUT, fmt, 'events.json'), lst)
        # uso de cartas no formato (30 dias)
        use = collections.Counter(); arches = collections.defaultdict(collections.Counter); copies = collections.Counter()
        for _, _, d in cur30:
            for q, n in d['main'] + d['side']:
                use[n] += 1; arches[n][d['aslug']] += 1; copies[n] += q
        for n, k in use.items():
            ci = card_index.setdefault(n, {'f': {}})
            ci['f'][fmt] = [round(100 * k / max(1, len(cur30)), 1), round(copies[n] / k, 1), [a for a, _ in arches[n].most_common(5)]]
        w7 = meta['windows']['7']
        index['formats'].append({'id': fmt, 'name': fname, 'decks30': len(cur30), 'events30': len({x[0]['id'] for x in cur30}),
                                 'top': [{'slug': r['slug'], 'name': r['name'], 'share': r['share'], 'colors': r['colors'], 'art': r['art'], 'usd': r['usd'], 'tix': r['tix']} for r in (w7['rows'] or meta['windows']['30']['rows'])[:6]]})
        index['events'] += lst[:12]
    index['events'] = sorted(index['events'], key=lambda e: (e['date'], e['id']), reverse=True)[:30]
    for e in index['events']:
        e['format'] = next(f for f in FORMATS if e['id'].startswith(f))
    save(os.path.join(OUT, 'index.json'), index)
    # índice de cartas e variações de preço
    cards = {}
    for n, ci in card_index.items():
        i = C.info(n)
        o = C.old.get(key(n)) or [None, None, None]
        cards[n] = {'img': i.get('img'), 'art': i.get('art'), 'usd': i.get('usd'), 'eur': i.get('eur'), 'tix': i.get('tix'), 'usd7': o[0], 'tix7': o[2],
                    'type': i.get('type'), 'cost': i.get('cost'), 'cmc': i.get('cmc'), 'colors': i.get('colors'), 'rarity': i.get('rarity'),
                    'uri': i.get('uri'), 'full': i.get('full'), 'f': ci['f']}
    save(os.path.join(OUT, 'cards.json'), cards)
    movers = []
    for n, c in cards.items():
        if c['usd'] and c['usd7'] and c['usd7'] >= 1 and abs(c['usd'] - c['usd7']) >= 0.5:
            movers.append({'card': n, 'usd': c['usd'], 'usd7': c['usd7'], 'pct': round(100 * (c['usd'] - c['usd7']) / c['usd7'], 1),
                           'fmts': sorted(c['f'], key=lambda f: -c['f'][f][0])[:3]})
    movers.sort(key=lambda m: -m['pct'])
    save(os.path.join(OUT, 'movers.json'), {'up': movers[:40], 'down': sorted(movers, key=lambda m: m['pct'])[:40]})
    print('formatos:', [f['id'] for f in index['formats']], 'eventos:', len(events), 'cartas:', len(cards))


if __name__ == '__main__':
    main()
