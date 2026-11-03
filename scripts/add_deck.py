"""Atalho para adicionar um deck de Commander: lê a lista do stdin e grava o .txt e a entrada em decks.json.

uso: python add_deck.py <slug> <categoria> "<jogador>" "<fonte>" < lista.txt
O nome do deck é o do comandante (primeira carta da seção Commander).
"""
import datetime as dt, json, os, sys
from commander import parse, DIR

slug, cat, jog, fonte = sys.argv[1:5]
txt = sys.stdin.read()
cmd, main = parse(txt)
assert cmd, 'lista sem seção Commander'
open(os.path.join(DIR, slug + '.txt'), 'w', encoding='utf-8').write(txt.strip() + '\n')
p = os.path.join(DIR, 'decks.json')
d = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {'decks': []}
d['decks'] = [x for x in d['decks'] if x['slug'] != slug] + [{
    'slug': slug, 'categoria': cat, 'nome': ' + '.join(n for _, n in cmd), 'comandante': [n for _, n in cmd],
    'jogador': jog, 'data': dt.date.today().isoformat(), 'fonte': fonte}]
open(p, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
print(slug, '·', ' + '.join(n for _, n in cmd), '·', sum(q for q, _ in cmd + main), 'cartas')
