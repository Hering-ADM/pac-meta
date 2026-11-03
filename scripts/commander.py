"""Listas de Commander enviadas à mão.

Cada deck é um arquivo de texto em data/commander/<slug>.txt, no formato exportado por Moxfield,
Archidekt, LigaMagic ou MTGO ("1 Sol Ring", "1x Sol Ring (CMM) 400"). O comandante pode vir numa
seção "Commander"/"Comandante" ou ser indicado em data/commander/decks.json, que guarda nome,
autor e descrição de cada deck.
"""
import os, re
from common import load, DATA

DIR = os.path.join(DATA, 'commander')
HEAD_CMD = re.compile(r'^(//\s*)?(commander|comandante|comandantes|commanders)\s*:?\s*$', re.I)
HEAD_SKIP = re.compile(r'^(//\s*)?(sideboard|maybeboard|maybe|considering|tokens?)\s*:?\s*$', re.I)
HEAD_ANY = re.compile(r'^(//\s*)?[A-Za-zÀ-ú ]+\s*(\(\d+\))?\s*:?\s*$')
CATEGORIAS = ('bhell', 'cedh', 'comunidade')
LINE = re.compile(r'^(\d+)\s*x?\s+(.+?)\s*$', re.I)


def clean_name(n):
    n = re.sub(r'\s+\*[A-Z]+\*\s*$', '', n)               # *F*, *E*
    n = re.sub(r'\s+\([A-Za-z0-9]{2,6}\)\s*[\w-]*\s*$', '', n)  # (CMM) 400
    n = re.sub(r'\s+\[[^\]]+\]\s*$', '', n)               # [CMM]
    n = re.sub(r'\s+#\S+$', '', n)
    return n.replace(' / ', ' // ').strip()


def parse(text):
    cmd, main, sec = [], [], 'main'
    for ln in text.replace('\r', '').split('\n'):
        s = ln.strip()
        if not s or s.startswith('#'): continue
        if HEAD_CMD.match(s): sec = 'cmd'; continue
        if HEAD_SKIP.match(s): sec = 'skip'; continue
        m = LINE.match(s)
        if not m:
            if HEAD_ANY.match(s): sec = 'main' if sec != 'skip' or not s.lower().startswith(('side', 'maybe')) else sec
            continue
        if sec == 'skip': continue
        item = [int(m.group(1)), clean_name(m.group(2))]
        (cmd if sec == 'cmd' else main).append(item)
    return cmd, main


def names():
    """Nomes de todas as cartas das listas (para o prices.py baixar preço e imagem)."""
    out = set()
    if not os.path.isdir(DIR): return out
    for f in os.listdir(DIR):
        if f.endswith('.txt'):
            cmd, main = parse(open(os.path.join(DIR, f), encoding='utf-8').read())
            out.update(n for _, n in cmd + main)
    meta = load(os.path.join(DIR, 'decks.json'), {}) or {}
    for d in meta.get('decks', []): out.update(d.get('comandante') or [])
    return out


def decks():
    if not os.path.isdir(DIR): return []
    meta = {d['slug']: d for d in (load(os.path.join(DIR, 'decks.json'), {}) or {}).get('decks', [])}
    out = []
    for f in sorted(os.listdir(DIR)):
        if not f.endswith('.txt'): continue
        s = f[:-4]; m = meta.get(s, {})
        cmd, main = parse(open(os.path.join(DIR, f), encoding='utf-8').read())
        want = m.get('comandante') or []
        if want:  # comandante indicado no decks.json: tira da lista principal se estiver lá
            low = {w.lower() for w in want}
            cmd = cmd or [[1, w] for w in want]
            main = [x for x in main if x[1].lower() not in low]
        out.append({'slug': s, 'nome': m.get('nome') or (cmd[0][1] if cmd else s.replace('-', ' ').title()), 'autor': m.get('autor', ''),
                    'descricao': m.get('descricao', ''), 'data': m.get('data', ''), 'tags': m.get('tags', []), 'cmd': cmd, 'main': main,
                    'categoria': m.get('categoria') if m.get('categoria') in CATEGORIAS else 'comunidade',
                    'evento': m.get('evento', ''), 'colocacao': m.get('colocacao'), 'jogador': m.get('jogador', ''),
                    'fonte': m.get('fonte', '') if str(m.get('fonte', '')).startswith('https://') else ''})
    return out
