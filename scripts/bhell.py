"""Bhell: campeonato semanal de Commander da Pac Deck, lido da planilha pública do Google.

A planilha é configurada em data/commander/bhell-config.json ({"sheet": "<id>", "season": 8, "nome": "..."}).
Lê as abas "Pontuação final", "Etapas", "ELO" e "Recordes e Histórico" (CSV público do Google) e guarda
o resultado em data/commander/bhell.json. Se a planilha não responder, mantém os dados anteriores.
Para testar sem internet: python bhell.py <pasta com os CSVs>.
"""
import csv, datetime as dt, io, os, re, sys, urllib.parse
from common import get, load, save, DATA

CFG = os.path.join(DATA, 'commander', 'bhell-config.json')
OUTF = os.path.join(DATA, 'commander', 'bhell.json')
ABAS = ['Pontuação final', 'Etapas', 'ELO', 'Recordes e Histórico']


def baixar(sheet, aba, local=None):
    if local: return open(os.path.join(local, aba + '.csv'), encoding='utf-8').read()
    url = f'https://docs.google.com/spreadsheets/d/{sheet}/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(aba)}'
    return get(url, headers={'Accept': 'text/csv'}).decode('utf-8')


def rows(txt): return [[c.strip() for c in r] for r in csv.reader(io.StringIO(txt))]
def num(s):
    s = (s or '').replace('R$', '').replace('%', '').replace('.', '').replace(',', '.').strip()
    try: return float(s) if s else None
    except ValueError: return None
def inteiro(s):
    v = num(s); return int(v) if v is not None else None
def col(head, nome, depois=0):
    """Índice da coluna com esse título (a partir de 'depois')."""
    for i in range(depois, len(head)):
        if head[i].lower() == nome.lower(): return i
    return None


def pontuacao(t):
    r = rows(t); head = r[0]
    c = {k: col(head, k) for k in ('Ranking', 'Pontuação', 'Jogador', '% V/J', 'V', 'VJ3', 'Bye', 'Prêmio', 'Inscrições')}
    out, inscr, classif = [], None, None
    for i, x in enumerate(r[1:]):
        g = lambda k: x[c[k]] if c[k] is not None and c[k] < len(x) else ''
        if inscr is None and num(g('Inscrições')): inscr = num(g('Inscrições'))
        if x and re.search(r'classificad', x[0], re.I): classif = ' '.join(x[0].split())
        nome = g('Jogador')
        if not nome: continue
        p = c['Prêmio']
        out.append({'pos': inteiro(g('Ranking')), 'jogador': nome, 'pts': inteiro(g('Pontuação')) or 0, 'pv': num(g('% V/J')),
                    'v': inteiro(g('V')) or 0, 'vj3': inteiro(g('VJ3')) or 0, 'bye': inteiro(g('Bye')) or 0,
                    'premio_pct': num(x[p]) if p is not None and p < len(x) else None,
                    'premio': num(x[p + 1]) if p is not None and p + 1 < len(x) else None})
    return out, inscr, classif


def etapas(t):
    r = rows(t); head = r[0]
    grupos = []  # (número da etapa, [índices das rodadas])
    for i, h in enumerate(head):
        m = re.match(r'Etapa\s*(\d+)', h, re.I)
        if m: grupos.append((int(m.group(1)), [i]))
        elif grupos and re.match(r'R\d+$', h, re.I) and i == grupos[-1][1][-1] + 1: grupos[-1][1].append(i)
    ci = {k: col(head, k) for k in ('Pts', 'V', 'D', 'E', 'J', 'Bye')}
    jog, jogadas = {}, set()
    for x in r[1:]:
        if not x or not x[0]: continue
        ets = []
        for n, idx in grupos:
            vals = [num(x[i]) for i in idx if i < len(x)]
            if any(v is not None for v in vals): jogadas.add(n); ets.append([n, int(sum(v or 0 for v in vals)), [None if v is None else int(v) for v in vals]])
        g = lambda k: inteiro(x[ci[k]]) if ci[k] is not None and ci[k] < len(x) else None
        jog[x[0].lower()] = {'etapas': ets, 'd': g('D') or 0, 'e': g('E') or 0, 'j': g('J') or 0}
    return jog, sorted(jogadas), len(grupos)


def elo(t):
    r = rows(t); head = r[0]
    c = {k: col(head, k) for k in ('Ranking', 'Jogador', 'Rating', 'Dif', 'Posição')}
    out = []
    for x in r[1:]:
        g = lambda k: x[c[k]] if c[k] is not None and c[k] < len(x) else ''
        if not g('Jogador'): continue
        mv = g('Posição'); m = re.search(r'-?\d+', mv)
        out.append({'pos': inteiro(g('Ranking')), 'jogador': g('Jogador'), 'rating': num(g('Rating')), 'dif': num(g('Dif')), 'mov': int(m.group()) if m else 0})
    return out


def recordes(t):
    r = rows(t); head = r[0] if r else []
    cs, cc, cd = col(head, 'Season', 5), col(head, 'Campeões'), col(head, 'Decks')
    camp, recs, titulo, rot = [], [], None, [h for h in head[2:6]]
    for x in r[1:]:
        x = x + [''] * 12
        if cc is not None and x[cc] and inteiro(x[cs]) is not None:
            camp.append({'season': inteiro(x[cs]), 'campeao': x[cc], 'deck': x[cd] if cd is not None else ''})
        if x[2] == 'Jogador': rot = x[2:6]; continue          # novo cabeçalho para os blocos de baixo
        if x[1]: titulo = {'titulo': x[1].split('\n')[0].strip(), 'nota': ' '.join(x[1].split('\n')[1:]).strip(' ()'), 'linhas': []}; recs.append(titulo)
        if titulo is None or not x[2]: continue
        titulo['linhas'].append([[rot[i] if i < len(rot) else '', v.replace('\n', ' · ')] for i, v in enumerate(x[2:6]) if v])
    return camp, [t for t in recs if t['linhas']]


def main():
    cfg = load(CFG, None)
    if not cfg or not cfg.get('sheet'): print('Bhell: sem planilha configurada'); return
    local = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        txt = {a: baixar(cfg['sheet'], a, local) for a in ABAS}
    except Exception as e:
        print('Bhell: planilha indisponível, mantendo os dados anteriores:', e); return
    rank, inscr, classif = pontuacao(txt['Pontuação final'])
    det, jogadas, total = etapas(txt['Etapas'])
    for p in rank: p.update(det.get(p['jogador'].lower(), {'etapas': [], 'd': 0, 'e': 0, 'j': 0}))
    rank = [p for p in rank if p['j'] or p['pts']]
    camp, recs = recordes(txt['Recordes e Histórico'])
    out = {'nome': cfg.get('nome', 'Bhell'), 'season': cfg.get('season'), 'sheet': cfg['sheet'], 'atualizado': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
           'etapas_jogadas': jogadas, 'etapas_total': total, 'inscricoes': inscr, 'classificados': classif,
           'ranking': rank, 'elo': elo(txt['ELO']), 'campeoes': camp, 'recordes': recs}
    save(OUTF, out, compact=False)
    print('Bhell:', len(rank), 'jogadores na season,', len(out['elo']), 'no ELO, etapas', jogadas)


if __name__ == '__main__':
    main()
