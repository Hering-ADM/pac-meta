"""Preços e dados das cartas pelo Scryfall (bulk "default_cards"), uma vez por dia.

Guarda só as cartas que aparecem nas listas coletadas: preço mais barato em papel (USD e EUR),
preço em tix do MTGO, imagem, custo, tipo e cores. Também guarda um histórico diário de preços.
"""
import datetime as dt, json, os, sys
from common import get, load, save, RAW, DATA

CARDS = os.path.join(DATA, 'cards.json')
HIST = os.path.join(DATA, 'price_history')


def key(n):
    return n.split(' // ')[0].split('/')[0].strip().lower()


def used_names():
    s = set()
    for f in os.listdir(RAW):
        ev = load(os.path.join(RAW, f), {})
        for d in ev.get('decks', []):
            for _, n in d['main'] + d['side']: s.add(n)
    return s


def num(x):
    try: return float(x) if x not in (None, '') else None
    except ValueError: return None


def main():
    today = dt.date.today().isoformat()
    cur = load(CARDS, {})
    names = used_names()
    if cur.get('_date') == today and all(key(n) in cur.get('cards', {}) for n in names):
        print('preços de hoje já baixados'); return
    meta = json.loads(get('https://api.scryfall.com/bulk-data/default_cards', headers={'Accept': 'application/json'}))
    url = meta.get('jsonl_download_uri') or meta.get('download_uri')
    print('baixando', url, flush=True)
    import gzip, tempfile, urllib.request
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.gz' if url.endswith('.gz') else '.json').name
    req = urllib.request.Request(url, headers={'User-Agent': 'PacMeta/1.0', 'Accept': '*/*'})
    with urllib.request.urlopen(req, timeout=600) as r, open(tmp, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b)
    def cards_iter():
        if tmp.endswith('.gz'):
            with gzip.open(tmp, 'rt', encoding='utf-8') as f:
                for ln in f:
                    ln = ln.strip().rstrip(',')
                    if ln.startswith('{'): yield json.loads(ln)
        else:
            with open(tmp, encoding='utf-8') as f:
                for c in json.load(f): yield c
    bulk = cards_iter()
    want = {key(n): n for n in names}
    out = {}
    for c in bulk:
        if c.get('lang') != 'en' or c.get('layout') in ('token', 'emblem', 'art_series', 'double_faced_token'): continue
        k = key(c.get('name', ''))
        if k not in want: continue
        p = c.get('prices') or {}
        usd, eur, tix = num(p.get('usd')), num(p.get('eur')), num(p.get('tix'))
        o = out.setdefault(k, {'name': want[k], 'full': c.get('name'), 'usd': None, 'eur': None, 'tix': None, 'img': None, 'uri': None})
        paper = 'paper' in (c.get('games') or []) and not c.get('digital')
        if paper and usd is not None and (o['usd'] is None or usd < o['usd']): o['usd'] = usd
        if paper and eur is not None and (o['eur'] is None or eur < o['eur']): o['eur'] = eur
        if tix is not None and (o['tix'] is None or tix < o['tix']): o['tix'] = tix
        face = (c.get('card_faces') or [{}])[0]
        iu = c.get('image_uris') or face.get('image_uris') or {}
        better = o['img'] is None or (paper and not o.get('_paper'))
        if iu.get('normal') and better:
            o['img'] = iu.get('normal'); o['art'] = iu.get('art_crop'); o['_paper'] = paper; o['uri'] = c.get('scryfall_uri')
            o['cost'] = c.get('mana_cost') or face.get('mana_cost') or ''
            o['cmc'] = c.get('cmc'); o['type'] = c.get('type_line') or face.get('type_line') or ''
            o['colors'] = c.get('colors') if c.get('colors') is not None else face.get('colors', [])
            o['ci'] = c.get('color_identity') or []
            o['rarity'] = c.get('rarity')
    os.remove(tmp)
    for o in out.values(): o.pop('_paper', None)
    save(CARDS, {'_date': today, 'cards': out})
    os.makedirs(HIST, exist_ok=True)
    save(os.path.join(HIST, today + '.json'), {k: [o['usd'], o['eur'], o['tix']] for k, o in out.items()})
    for f in sorted(os.listdir(HIST))[:-60]: os.remove(os.path.join(HIST, f))
    falt = [n for n in names if key(n) not in out]
    print('cartas com dados:', len(out), 'sem dados:', len(falt), falt[:20])


if __name__ == '__main__':
    main()
