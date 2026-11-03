"""Funções compartilhadas do coletor do Pac-Meta (só biblioteca padrão)."""
import json, os, re, time, urllib.request, urllib.error, gzip

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
RAW = os.path.join(DATA, 'raw')
OUT = os.path.join(ROOT, 'site', 'data')
UA = 'PacMeta/1.0 (+site de fas, sem fins comerciais)'

FORMATS = {
    'standard': 'Standard', 'pioneer': 'Pioneer', 'modern': 'Modern', 'legacy': 'Legacy',
    'vintage': 'Vintage', 'pauper': 'Pauper', 'premodern': 'Premodern',
}


def get(url, data=None, headers=None, tries=4, timeout=60):
    h = {'User-Agent': UA, 'Accept': '*/*', 'Accept-Encoding': 'gzip'}
    if headers: h.update(headers)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip': b = gzip.decompress(b)
                return b
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (404, 410): raise
            time.sleep(2 * (i + 1) + (10 if e.code == 429 else 0))
        except Exception as e:  # rede instável
            last = e
            time.sleep(2 * (i + 1))
    raise last


def load(path, default=None):
    try:
        with open(path, encoding='utf-8') as f: return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save(path, obj, compact=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        if compact: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        else: json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def slug(s):
    import unicodedata
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
