'use strict';
/* Painel MTG — site estático. Dados em data/ (gerados a cada hora) e static/guias/. */
const FORMATS = [['standard', 'Standard'], ['pioneer', 'Pioneer'], ['modern', 'Modern'], ['legacy', 'Legacy'], ['vintage', 'Vintage'], ['pauper', 'Pauper'], ['premodern', 'Premodern']];
const FNAME = Object.fromEntries(FORMATS);
const KIND = { league: 'Liga', challenge: 'Challenge', showcase: 'Showcase', qualifier: 'Qualifier', champions: 'Champions', super: 'Super Qualifier', 'last-chance': 'Last Chance', preliminary: 'Preliminary', outro: 'Evento' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const $main = document.getElementById('main');
const cache = {};
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

/* ---------- utilidades ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
async function get(path) {
  if (!cache[path]) cache[path] = fetch(path, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  try { return await cache[path]; } catch (e) { delete cache[path]; throw e; }
}
const pct = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const usd = (v) => v == null ? '—' : 'US$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = (v) => v == null ? '—' : '€ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tix = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' tix';
const dat = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${+d} ${MESES[+m - 1]} ${y}`; };
const enc = encodeURIComponent;
const fmtOf = (id) => (FORMATS.find(([f]) => id.startsWith(f + '-')) || [''])[0];
function pips(col) { const s = h('span', { class: 'pips', 'aria-label': col ? 'Cores: ' + col : 'Incolor' }); (col || 'C').split('').forEach((c) => s.append(h('i', { class: c }))); return s; }
function record(w, l) { return w == null ? '' : `${w}-${l}`; }
function rankTxt(r, kind) { if (kind === 'league') return '5-0'; return r ? r + 'º' : '—'; }
function card(...kids) { return h('div', { class: 'card' }, ...kids); }
function title(t) { document.title = t + ' · Painel MTG'; }
function fail(msg) { $main.replaceChildren(h('p', { class: 'empty' }, msg || 'Não consegui carregar estes dados agora. Tente de novo em alguns minutos.')); }
let CARDS = null;
async function cards() { if (!CARDS) { try { CARDS = await get('data/cards.json'); } catch (e) { CARDS = {}; } } return CARDS; }
const TYPES = [['Creature', 'Criaturas'], ['Planeswalker', 'Planeswalkers'], ['Battle', 'Batalhas'], ['Instant', 'Instantâneas'], ['Sorcery', 'Feitiços'], ['Artifact', 'Artefatos'], ['Enchantment', 'Encantamentos'], ['Land', 'Terrenos']];
function typeOf(n) { const t = ((CARDS || {})[n] || {}).type || ''; const f = t.split('//')[0]; for (const [k, v] of TYPES) if (f.includes(k)) return v; return 'Outras'; }
function cardLink(n) { const a = h('a', { href: '#/c/' + enc(n), 'data-card': n }, n); return a; }

/* ---------- prévia da imagem ao passar o mouse ---------- */
const tip = document.getElementById('tip'); const tipImg = tip.querySelector('img');
document.addEventListener('mouseover', (ev) => {
  const a = ev.target.closest('[data-card]'); if (!a || !CARDS) return;
  const c = CARDS[a.dataset.card]; if (!c || !c.img) return;
  tipImg.src = c.img; tip.hidden = false;
});
document.addEventListener('mousemove', (ev) => { if (tip.hidden) return; const x = ev.clientX + 18, y = ev.clientY - 40; tip.style.left = Math.min(x, innerWidth - 260) + 'px'; tip.style.top = Math.max(8, Math.min(y, innerHeight - 350)) + 'px'; });
document.addEventListener('mouseout', (ev) => { if (ev.target.closest('[data-card]')) tip.hidden = true; });

/* ---------- tema ---------- */
const root = document.documentElement; const saved = store.get('tema', ''); if (saved) root.dataset.theme = saved;
document.getElementById('theme').addEventListener('click', () => { const dark = (root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'; root.dataset.theme = dark ? 'light' : 'dark'; store.set('tema', root.dataset.theme); });

/* ---------- navegação de formatos ---------- */
const nav = document.getElementById('fmt-nav');
FORMATS.forEach(([f, n]) => nav.append(h('a', { href: '#/f/' + f, 'data-f': f }, n)));

/* ---------- busca de cartas ---------- */
const q = document.getElementById('q'), ql = document.getElementById('q-list'); let qsel = -1, qitems = [];
q.addEventListener('focus', () => cards());
q.addEventListener('input', async () => {
  const C = await cards(); const t = q.value.trim().toLowerCase(); qsel = -1;
  if (t.length < 2) { ql.hidden = true; return; }
  qitems = Object.keys(C).filter((n) => n.toLowerCase().includes(t)).sort((a, b) => (a.toLowerCase().startsWith(t) ? 0 : 1) - (b.toLowerCase().startsWith(t) ? 0 : 1) || a.localeCompare(b)).slice(0, 12);
  ql.replaceChildren(...qitems.map((n, i) => h('li', { role: 'option', id: 'qo' + i, onmousedown: (e) => { e.preventDefault(); goCard(n); } }, h('span', null, n), h('small', null, usd(C[n].usd)))));
  ql.hidden = !qitems.length;
});
q.addEventListener('keydown', (e) => {
  if (ql.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); qsel = (qsel + (e.key === 'ArrowDown' ? 1 : -1) + qitems.length) % qitems.length; [...ql.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === qsel))); q.setAttribute('aria-activedescendant', 'qo' + qsel); }
  if (e.key === 'Enter') { e.preventDefault(); goCard(qitems[Math.max(0, qsel)]); }
  if (e.key === 'Escape') ql.hidden = true;
});
q.addEventListener('blur', () => setTimeout(() => { ql.hidden = true; }, 150));
function goCard(n) { if (!n) return; ql.hidden = true; q.value = ''; location.hash = '#/c/' + enc(n); }

/* ---------- páginas ---------- */
async function home() {
  title('Metagame, decks e preços de Magic');
  const idx = await get('data/index.json');
  const C = await cards();
  const fcards = idx.formats.map((f) => card(
    h('h2', null, h('a', { href: '#/f/' + f.id }, f.name), h('small', null, f.decks30 + ' decks em 30 dias')),
    h('ol', { class: 'fcard-list' }, f.top.map((a) => h('li', null,
      h('a', { class: 'ellip', href: `#/f/${f.id}/a/${a.slug}` }, pips(a.colors), a.name), h('em', null, pct(a.share)),
      h('span', { class: 'b' }, h('i', { style: `width:${Math.min(100, a.share * 3)}%` })))))));
  fcards.forEach((c) => c.classList.add('fcard'));
  let mv = { up: [], down: [] }; try { mv = await get('data/movers.json'); } catch (e) {}
  $main.replaceChildren(
    h('div', null, h('h1', null, 'Metagame de Magic, atualizado a cada hora'), h('p', { class: 'lead' }, 'Arquétipos mais jogados, listas dos torneios do MTGO, preços das cartas e guias de confronto. Escolha um formato para começar.')),
    h('div', { class: 'grid3' }, fcards),
    h('div', { class: 'grid2' },
      card(h('h2', null, 'Últimos torneios', h('a', { href: '#/torneios' }, 'ver todos')), eventsTable(idx.events.slice(0, 12), true)),
      card(h('h2', null, 'Preços que mais subiram na semana', h('a', { href: '#/precos' }, 'ver mais')), moversTable(mv.up.slice(0, 10), C))));
}

function eventsTable(evs, showFmt) {
  if (!evs.length) return h('p', { class: 'empty' }, 'Nenhum torneio ainda.');
  return h('div', { class: 'tbox' }, h('table', { class: 't' },
    h('thead', null, h('tr', null, h('th', null, 'Data'), h('th', null, 'Torneio'), showFmt && h('th', { class: 'hide-sm' }, 'Formato'), h('th', { class: 'n hide-sm' }, 'Jogadores'), h('th', null, 'Campeão'))),
    h('tbody', null, evs.map((e) => h('tr', null,
      h('td', null, dat(e.date)), h('td', { class: 'nm' }, h('a', { href: '#/e/' + e.id }, e.name)),
      showFmt && h('td', { class: 'hide-sm' }, FNAME[e.format || fmtOf(e.id)] || ''),
      h('td', { class: 'n hide-sm' }, e.players || (e.kind === 'league' ? e.decks + ' listas 5-0' : '—')),
      h('td', null, e.warch ? h('span', null, h('a', { href: `#/f/${e.format || fmtOf(e.id)}/a/${e.waslug}` }, e.warch), h('br'), h('small', null, e.winner)) : h('small', null, e.kind === 'league' ? 'Liga: só listas 5-0' : '—')))))));
}

function moversTable(list, C) {
  if (!list.length) return h('p', { class: 'empty' }, 'O histórico de preços começa a contar a partir do primeiro dia. As variações aparecem depois de uma semana.');
  return h('div', { class: 'tbox' }, h('table', { class: 't' },
    h('thead', null, h('tr', null, h('th', null, 'Carta'), h('th', { class: 'n' }, 'Agora'), h('th', { class: 'n hide-sm' }, 'Há 7 dias'), h('th', { class: 'n' }, 'Variação'))),
    h('tbody', null, list.map((m) => h('tr', null, h('td', { class: 'nm' }, cardLink(m.card), h('br'), h('small', null, m.fmts.map((f) => FNAME[f]).join(', '))), h('td', { class: 'n' }, usd(m.usd)), h('td', { class: 'n hide-sm' }, usd(m.usd7)), h('td', { class: 'n ' + (m.pct >= 0 ? 'up' : 'down') }, (m.pct >= 0 ? '+' : '') + pct(m.pct)))))));
}

async function metagame(f, params) {
  const m = await get(`data/${f}/meta.json`); title('Metagame ' + m.name);
  let days = params.get('d') || store.get('dias', '14'); if (!m.windows[days]) days = '14';
  let money = store.get('moeda', 'usd'); let sortK = 'share', sortD = -1;
  const body = h('div');
  function draw() {
    const w = m.windows[days]; const rows = w.rows.slice().sort((a, b) => ((a[sortK] ?? -1) > (b[sortK] ?? -1) ? 1 : (a[sortK] ?? -1) < (b[sortK] ?? -1) ? -1 : 0) * sortD);
    const mx = Math.max(1, ...w.rows.map((r) => r.share));
    const th = (k, t, cls) => h('th', { class: cls, 'aria-sort': sortK === k ? (sortD === 1 ? 'ascending' : 'descending') : null }, h('button', { class: 'sortb', onclick: () => { if (sortK === k) sortD = -sortD; else { sortK = k; sortD = k === 'name' ? 1 : -1; } draw(); } }, t + (sortK === k ? (sortD === 1 ? ' ↑' : ' ↓') : '')));
    body.replaceChildren(
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', null, w.decks), h('small', null, 'listas')), h('div', { class: 'stat' }, h('b', null, w.events), h('small', null, 'torneios')), h('div', { class: 'stat' }, h('b', null, w.rows.length), h('small', null, 'arquétipos'))),
      w.rows.length ? chart(w.rows.slice(0, 12)) : null,
      h('div', { class: 'tbox' }, h('table', { class: 't' },
        h('thead', null, h('tr', null, th('name', 'Arquétipo'), th('share', 'Meta', 'n'), th('trend', 'Tendência', 'n hide-sm'), th('decks', 'Listas', 'n hide-sm'), th('top8', 'Top 8', 'n hide-sm'), th(money, money === 'usd' ? 'Preço (papel)' : 'Preço (MTGO)', 'n'))),
        h('tbody', null, rows.map((r) => { const tr = r.prev == null ? null : r.share - r.prev; return h('tr', null,
          h('td', { class: 'nm' }, h('a', { href: `#/f/${f}/a/${r.slug}` }, pips(r.colors), r.name), h('br'), h('small', null, r.key.join(' · '))),
          h('td', { class: 'n' }, h('span', { class: 'bar', style: `width:${Math.max(2, r.share / mx * 4.5)}rem` }), pct(r.share)),
          h('td', { class: 'n hide-sm ' + (tr == null ? '' : tr >= 0 ? 'up' : 'down') }, tr == null ? '—' : (tr >= 0 ? '▲ +' : '▼ ') + pct(tr)),
          h('td', { class: 'n hide-sm' }, r.decks), h('td', { class: 'n hide-sm' }, r.top8 || '—'), h('td', { class: 'n' }, money === 'usd' ? usd(r.usd) : tix(r.tix))); })))));
  }
  m.windows[days].rows.forEach((r) => { r.trend = r.prev == null ? null : r.share - r.prev; });
  Object.values(m.windows).forEach((w) => w.rows.forEach((r) => { r.trend = r.prev == null ? null : r.share - r.prev; }));
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, ['7', '14', '30'].map((d) => h('button', { 'aria-pressed': String(d === days), onclick: (e) => { days = d; store.set('dias', d); seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, d + ' dias')));
  const seg2 = h('div', { class: 'seg', role: 'group', 'aria-label': 'Moeda' }, [['usd', 'Papel (US$)'], ['tix', 'MTGO (tix)']].map(([k, t]) => h('button', { 'aria-pressed': String(k === money), onclick: (e) => { money = k; store.set('moeda', k); seg2.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, t)));
  draw();
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', m.name), h('h1', null, 'Metagame de ' + m.name),
      h('p', { class: 'lead' }, 'Participação de cada arquétipo nas listas publicadas dos torneios do MTGO. Tendência compara com o período anterior de mesmo tamanho. Preço é o da lista típica, com a versão mais barata de cada carta.')),
    card(h('div', { class: 'row between' }, h('div', { class: 'row' }, seg, seg2), h('a', { href: `#/f/${f}/torneios` }, 'Torneios de ' + m.name + ' →')), body));
}

function chart(rows) {
  const W = 760, bh = 22, H = rows.length * bh + 8, L = 210; const mx = Math.max(...rows.map((r) => r.share));
  const ns = 'http://www.w3.org/2000/svg'; const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('class', 'chart'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Participação dos arquétipos mais jogados');
  rows.forEach((r, i) => {
    const y = 4 + i * bh; const w = (W - L - 70) * r.share / mx;
    const t = document.createElementNS(ns, 'text'); t.setAttribute('x', L - 8); t.setAttribute('y', y + 14); t.setAttribute('text-anchor', 'end'); t.textContent = r.name.length > 30 ? r.name.slice(0, 29) + '…' : r.name; s.append(t);
    const b = document.createElementNS(ns, 'rect'); b.setAttribute('x', L); b.setAttribute('y', y + 3); b.setAttribute('width', Math.max(2, w)); b.setAttribute('height', bh - 8); b.setAttribute('rx', 3); b.setAttribute('fill', i === 0 ? '#e2a33a' : 'var(--acc)'); s.append(b);
    const v = document.createElementNS(ns, 'text'); v.setAttribute('x', L + w + 6); v.setAttribute('y', y + 14); v.textContent = pct(r.share); s.append(v);
  });
  return h('div', { style: 'margin:.6rem 0 1rem' }, s);
}

function deckBlock(main, side, opts = {}) {
  const C = CARDS || {}; const groups = {};
  main.forEach(([q, n]) => { (groups[typeOf(n)] = groups[typeOf(n)] || []).push([q, n]); });
  const order = TYPES.map((t) => t[1]).concat('Outras');
  const sec = (t, l) => h('section', null, h('h3', null, h('span', null, t), h('span', null, l.reduce((s, x) => s + x[0], 0))), l.map(([q, n]) => h('div', { class: 'ln' }, h('b', null, q), cardLink(n), h('small', null, C[n] && C[n].usd != null ? usd(q * C[n].usd) : ''))));
  return h('div', { class: 'deck' }, order.filter((t) => groups[t]).map((t) => sec(t, groups[t])), side && side.length ? sec('Sideboard', side) : null);
}
function exportRow(main, side, name) {
  const txt = main.map(([q, n]) => q + ' ' + n).join('\n') + '\n\nSideboard\n' + side.map(([q, n]) => q + ' ' + n).join('\n');
  const st = h('span', { class: 'crumb', role: 'status' });
  return h('div', { class: 'row' },
    h('button', { class: 'btn pri', onclick: () => { navigator.clipboard.writeText(txt).then(() => { st.textContent = 'Lista copiada.'; }, () => { st.textContent = 'Não deu para copiar; use o botão de baixar.'; }); } }, 'Copiar lista'),
    h('button', { class: 'btn', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/plain' })), download: (name || 'deck').replace(/[^\w-]+/g, '_') + '.txt' }); document.body.append(a); a.click(); a.remove(); } }, 'Baixar .txt (MTGO/Arena)'), st);
}

async function archetype(f, s) {
  const [a] = await Promise.all([get(`data/${f}/arch/${s}.json`), cards()]); title(a.name + ' · ' + FNAME[f]);
  let view = 'tipica';
  const box = h('div');
  const statsT = (list, label) => h('div', { class: 'tbox' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, label), h('th', { class: 'n' }, 'Em % das listas'), h('th', { class: 'n' }, 'Cópias (média)'))), h('tbody', null, list.map((x) => h('tr', null, h('td', null, cardLink(x.card)), h('td', { class: 'n' }, pct(x.pct, 0)), h('td', { class: 'n' }, x.avg.toLocaleString('pt-BR')))))));
  function draw() { box.replaceChildren(view === 'tipica' ? h('div', null, exportRow(a.main, a.side, a.name), h('div', { style: 'height:.8rem' }), deckBlock(a.main, a.side)) : h('div', { class: 'grid2' }, statsT(a.main_stats, 'Principal'), statsT(a.side_stats, 'Sideboard'))); }
  const seg = h('div', { class: 'seg', role: 'group' }, [['tipica', 'Lista típica'], ['stats', 'Cartas e frequência']].map(([k, t]) => h('button', { 'aria-pressed': String(k === view), onclick: (e) => { view = k; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, t)));
  draw();
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/f/' + f }, FNAME[f]), ' › ', a.name), h('h1', null, a.name),
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', null, pct(a.share)), h('small', null, 'do meta em 30 dias')), h('div', { class: 'stat' }, h('b', null, a.decks), h('small', null, 'listas')), h('div', { class: 'stat' }, h('b', null, usd(a.usd)), h('small', null, 'papel, lista típica')), h('div', { class: 'stat' }, h('b', null, tix(a.tix)), h('small', null, 'MTGO')))),
    card(h('div', { class: 'row between' }, seg, h('small', { class: 'crumb' }, 'A lista típica junta as ' + a.decks + ' listas dos últimos 30 dias: cada carta entra com o número médio de cópias.')), h('div', { style: 'height:.8rem' }), box),
    card(h('h2', null, 'Listas recentes'), h('div', { class: 'tbox' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, h('th', null, 'Data'), h('th', null, 'Jogador'), h('th', null, 'Torneio'), h('th', { class: 'n' }, 'Resultado'), h('th', { class: 'n hide-sm' }, 'Preço'))),
      h('tbody', null, a.recent.map((r) => h('tr', null, h('td', null, dat(r.date)), h('td', { class: 'nm' }, h('a', { href: `#/e/${r.ev}/${r.i}` }, r.player)), h('td', null, h('a', { href: '#/e/' + r.ev }, r.evname)), h('td', { class: 'n' }, r.kind === 'league' ? '5-0' : (r.rank ? r.rank + 'º' : '') + (r.w != null ? ' (' + record(r.w, r.l) + ')' : '')), h('td', { class: 'n hide-sm' }, usd(r.usd)))))))));
}

async function eventsPage(f) {
  const fs = f ? [f] : FORMATS.map((x) => x[0]);
  title('Torneios' + (f ? ' de ' + FNAME[f] : ''));
  const lists = await Promise.all(fs.map((x) => get(`data/${x}/events.json`).then((l) => l.map((e) => ({ ...e, format: x }))).catch(() => [])));
  let all = lists.flat().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  let kind = 'todos';
  const box = h('div');
  const draw = () => box.replaceChildren(eventsTable(all.filter((e) => kind === 'todos' || (kind === 'league' ? e.kind === 'league' : e.kind !== 'league')).slice(0, 300), !f));
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Tipo de torneio' }, [['todos', 'Todos'], ['comp', 'Challenges e eventos'], ['league', 'Ligas']].map(([k, t]) => h('button', { 'aria-pressed': String(k === kind), onclick: (e) => { kind = k; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, t)));
  const sel = h('select', { 'aria-label': 'Formato', onchange: (e) => { location.hash = e.target.value ? `#/f/${e.target.value}/torneios` : '#/torneios'; } }, h('option', { value: '' }, 'Todos os formatos'), FORMATS.map(([k, n]) => h('option', { value: k, selected: k === f }, n)));
  draw();
  $main.replaceChildren(h('div', null, h('h1', null, 'Torneios' + (f ? ' de ' + FNAME[f] : '')), h('p', { class: 'lead' }, 'Resultados oficiais publicados pelo MTGO. Nas ligas, o MTGO divulga só uma parte das listas que fizeram 5-0.')), card(h('div', { class: 'row' }, sel, seg), h('div', { style: 'height:.8rem' }), box));
}

async function eventPage(id, i) {
  const [e] = await Promise.all([get(`data/event/${id}.json`), cards()]);
  if (i != null && e.decks[i]) return deckPage(e, +i);
  title(e.name);
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: `#/f/${e.format}/torneios` }, 'Torneios de ' + FNAME[e.format]), ' › ', e.name), h('h1', null, e.name), h('p', { class: 'lead' }, dat(e.date) + ' · ' + (KIND[e.kind] || '') + (e.players ? ' · ' + e.players + ' jogadores' : '') + ' · ', h('a', { href: e.url, target: '_blank', rel: 'noopener' }, 'ver no MTGO'))),
    card(h('div', { class: 'tbox' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, h('th', null, 'Pos.'), h('th', null, 'Jogador'), h('th', null, 'Arquétipo'), h('th', { class: 'n hide-sm' }, 'Vitórias-derrotas'), h('th', { class: 'n' }, 'Preço'))),
      h('tbody', null, e.decks.map((d, k) => h('tr', null, h('td', null, rankTxt(d.rank, e.kind)), h('td', { class: 'nm' }, h('a', { href: `#/e/${e.id}/${k}` }, d.player)), h('td', null, h('a', { href: `#/f/${e.format}/a/${d.aslug}` }, d.arch)), h('td', { class: 'n hide-sm' }, record(d.wins, d.losses)), h('td', { class: 'n' }, usd(d.usd)))))))));
}

function deckPage(e, i) {
  const d = e.decks[i]; title(d.arch + ' de ' + d.player);
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/e/' + e.id }, e.name), ' › ', d.player), h('h1', null, d.arch), h('p', { class: 'lead' }, 'por ' + d.player + ' · ' + rankTxt(d.rank, e.kind) + (d.wins != null && e.kind !== 'league' ? ' (' + record(d.wins, d.losses) + ')' : '') + ' · ' + dat(e.date) + ' · ', h('a', { href: `#/f/${e.format}/a/${d.aslug}` }, 'ver o arquétipo')),
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', null, usd(d.usd)), h('small', null, 'papel')), h('div', { class: 'stat' }, h('b', null, tix(d.tix)), h('small', null, 'MTGO')))),
    card(exportRow(d.main, d.side, d.arch + '-' + d.player), h('div', { style: 'height:.8rem' }), deckBlock(d.main, d.side)));
}

async function cardPage(n) {
  const C = await cards(); const c = C[n]; title(n);
  if (!c) return fail('Essa carta não aparece nas listas dos últimos 30 dias.');
  const ch = (a, b) => a != null && b != null && b > 0 ? h('span', { class: a >= b ? 'up' : 'down' }, (a >= b ? '+' : '') + pct(100 * (a - b) / b)) : '—';
  const uses = Object.entries(c.f).sort((a, b) => b[1][0] - a[1][0]);
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › Cartas'), h('h1', null, c.full || n), h('p', { class: 'lead' }, [c.cost, c.type].filter(Boolean).join(' · '))),
    h('div', { class: 'split' },
      h('div', { style: 'display:grid;gap:1.2rem' },
        card(h('h2', null, 'Preços'), h('div', { class: 'tbox' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'n' }, 'Agora'), h('th', { class: 'n' }, '7 dias'))),
          h('tbody', null, h('tr', null, h('td', null, 'Papel, mais barata (US$)'), h('td', { class: 'n price' }, usd(c.usd)), h('td', { class: 'n' }, ch(c.usd, c.usd7))), h('tr', null, h('td', null, 'Papel, mais barata (EUR)'), h('td', { class: 'n' }, eur(c.eur)), h('td', { class: 'n' }, '')), h('tr', null, h('td', null, 'MTGO'), h('td', { class: 'n' }, tix(c.tix)), h('td', { class: 'n' }, ch(c.tix, c.tix7)))))),
          h('p', { class: 'crumb' }, 'Preços de referência do Scryfall, atualizados uma vez por dia. ', c.uri ? h('a', { href: c.uri, target: '_blank', rel: 'noopener' }, 'Ver no Scryfall') : '')),
        card(h('h2', null, 'Onde é jogada (30 dias)'), h('div', { class: 'tbox' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Formato'), h('th', { class: 'n' }, '% das listas'), h('th', { class: 'n' }, 'Cópias'), h('th', null, 'Arquétipos'))),
          h('tbody', null, uses.map(([f, u]) => h('tr', null, h('td', { class: 'nm' }, h('a', { href: '#/f/' + f }, FNAME[f])), h('td', { class: 'n' }, pct(u[0])), h('td', { class: 'n' }, u[1].toLocaleString('pt-BR')), h('td', null, u[2].map((s, k) => [k ? ', ' : '', h('a', { href: `#/f/${f}/a/${s}` }, s.replace(/-/g, ' '))]))))))))),
      c.img ? h('img', { class: 'cardimg', src: c.img, alt: 'Imagem da carta ' + n, loading: 'lazy' }) : h('div')));
}

async function precos() {
  title('Preços'); const [mv, C] = await Promise.all([get('data/movers.json').catch(() => ({ up: [], down: [] })), cards()]);
  let f = store.get('fmtprecos', 'modern');
  const box = h('div');
  function drawTop() {
    const list = Object.entries(C).filter(([, c]) => c.f[f] && c.usd != null).map(([n, c]) => ({ n, c, use: c.f[f][0] })).sort((a, b) => b.use - a.use).slice(0, 60);
    box.replaceChildren(h('div', { class: 'tbox' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Carta'), h('th', { class: 'n' }, '% das listas'), h('th', { class: 'n' }, 'Papel'), h('th', { class: 'n hide-sm' }, 'MTGO'))),
      h('tbody', null, list.map(({ n, c, use }) => h('tr', null, h('td', { class: 'nm' }, cardLink(n)), h('td', { class: 'n' }, pct(use)), h('td', { class: 'n' }, usd(c.usd)), h('td', { class: 'n hide-sm' }, tix(c.tix))))))));
  }
  const sel = h('select', { 'aria-label': 'Formato', onchange: (e) => { f = e.target.value; store.set('fmtprecos', f); drawTop(); } }, FORMATS.map(([k, n]) => h('option', { value: k, selected: k === f }, n)));
  drawTop();
  $main.replaceChildren(h('div', null, h('h1', null, 'Preços'), h('p', { class: 'lead' }, 'Preço da versão mais barata de cada carta, em papel e no MTGO. A variação compara com 7 dias atrás.')),
    h('div', { class: 'grid2' }, card(h('h2', null, 'Subiram na semana'), moversTable(mv.up.slice(0, 25), C)), card(h('h2', null, 'Caíram na semana'), moversTable(mv.down.slice(0, 25), C))),
    card(h('h2', null, 'Cartas mais jogadas', sel), box));
}

/* ---------- guias ---------- */
async function guias(slugSel) {
  title('Guias de confronto');
  const base = 'static/guias/';
  const [g, side, contra, cont, ed, cons] = await Promise.all(['chant_guia', 'chant_side', 'estudo_contra', 'estudo_contingencias', 'estudo_decks', 'chant_consenso'].map((x) => get(base + x + '.json')));
  await cards();
  const decks = g.slice().sort((a, b) => b.meta - a.meta);
  const cur = decks.find((d) => (ed.find((e) => e.deck === d.deck) || {}).slug === slugSel) || decks[0];
  const slugOf = (d) => (ed.find((e) => e.deck === d) || {}).slug;
  const sd = side.filter((x) => x.deck === cur.deck); const ct = contra.find((x) => x.slug === slugOf(cur.deck)) || {};
  const cs = cont.filter((x) => x.slug === slugOf(cur.deck)).sort((a, b) => a.ordem - b.ordem);
  const kv = (pairs) => h('div', { class: 'kv' }, pairs.filter(([, v]) => v).map(([k, v]) => h('div', null, h('h4', null, k), h('p', null, v))));
  const sw = (acao) => sd.filter((x) => x.acao === acao).map((x) => h('div', { class: 'ln' }, h('b', null, (acao === 'Entra' ? '+' : '−') + x.copias), cardLink(x.carta), h('small')));
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › Guias'), h('h1', null, 'Guia de confrontos: Azorius Chant (Modern)'),
      h('p', { class: 'lead' }, 'Plano de jogo, sideboard e contingências do Azorius Chant contra os decks mais jogados do Modern. Escrito em outubro de 2026 para o Regional da América do Sul e conferido por revisores de regras. O meta citado é o dos Regionais de outono.')),
    card(h('h2', null, 'Escolha o oponente'), h('div', { class: 'opps' }, decks.map((d) => h('button', { 'aria-pressed': String(d === cur), onclick: () => { location.hash = '#/guias/' + slugOf(d.deck); } }, d.deck)))),
    card(h('h2', null, cur.deck, h('span', { class: 'tag gold' }, cur.avaliacao)), h('p', { class: 'crumb' }, pct(cur.meta) + (cur.fonte_meta === 'Regionais' ? ' do campo nos Regionais' : ' do meta online') + (cur.observacao ? '. ' + cur.observacao.replace(/\.+$/, '') + '.' : '')),
      h('div', { class: 'inout' }, h('div', { class: 'i' }, h('h4', null, 'Entra'), h('div', { class: 'deck' }, h('section', null, sw('Entra')))), h('div', { class: 'o' }, h('h4', null, 'Sai'), h('div', { class: 'deck' }, h('section', null, sw('Sai'))))),
      h('div', { style: 'height:.8rem' }), kv([['Seu objetivo', cur.objetivo], ['Erros que custam o jogo', cur.erros]])),
    h('details', { class: 'acc', open: true }, h('summary', null, 'Plano de jogo'), h('div', null, kv([['Como eles ganham', cur.como_ganham], ['Cartas para respeitar', cur.cartas_chave], ['Mão inicial', cur.mao], ['Jogo 1', cur.jogo1], ['Depois do sideboard', cur.pos_side]]))),
    h('details', { class: 'acc' }, h('summary', null, 'Como eles jogam contra você'), h('div', null, kv([['Como tentam vencer', ct.objetivo], ['O que procuram na mão', ct.mulligan], ['Jogo 1', ct.jogo1], ['Depois do sideboard', ct.pos_side], ['Turnos-chave', ct.turnos_chave], ['Erros seus que eles punem', ct.como_punem_erros], ['Trazem do side', ct.side_entra], ['Tiram', ct.side_sai]]))),
    h('details', { class: 'acc' }, h('summary', null, 'Contingências (' + cs.length + ')'), h('div', null, cs.map((x) => h('details', { class: 'acc' }, h('summary', null, x.ordem + '. ' + x.situacao), h('div', null, kv([['Como reconhecer', x.sinal], ['O que fazer', x.resposta], ['Se não tiver a carta', x.plano_b]])))))),
    h('details', { class: 'acc' }, h('summary', null, 'A lista usada no guia'), h('div', null, deckBlock(cons.filter((r) => r.parte === 'Principal').map((r) => [r.copias, r.carta]), cons.filter((r) => r.parte === 'Sideboard').map((r) => [r.copias, r.carta])))));
}

/* ---------- páginas institucionais ---------- */
function prose(t, ...kids) { title(t); $main.replaceChildren(h('div', { class: 'card prose' }, h('h1', null, t), ...kids)); }
const P = (...k) => h('p', null, ...k);
function sobre() {
  prose('Sobre o Painel MTG',
    P('O Painel MTG é um site gratuito, feito por fãs, com o metagame dos formatos competitivos de Magic: The Gathering, as listas dos torneios oficiais do MTGO e o preço das cartas.'),
    h('h2', null, 'De onde vêm os dados'),
    h('ul', null, h('li', null, 'Resultados e listas: páginas públicas de decklists do Magic: The Gathering Online (mtgo.com). O site verifica novos resultados a cada hora.'), h('li', null, 'Dados, imagens e preços das cartas: Scryfall, uma vez por dia. O preço mostrado é o da versão mais barata em inglês.'), h('li', null, 'Arquétipos: o site classifica cada lista por cartas-chave. Listas que não se encaixam em nenhuma regra recebem o nome das cores e de uma carta marcante.')),
    h('h2', null, 'Limitações'),
    h('ul', null, h('li', null, 'Nas ligas, o MTGO publica só parte das listas 5-0, então elas não representam todo o campo.'), h('li', null, 'Torneios presenciais e Commander ainda não estão incluídos.'), h('li', null, 'Preços são referência e não oferta de venda.')),
    h('h2', null, 'Contato'), P('Sugestões, correções e pedidos de remoção: ', h('span', { id: 'contato' }, 'contato a definir'), '.'),
    h('p', { class: 'notice' }, 'Painel MTG é conteúdo de fã não oficial, permitido pela Política de Conteúdo de Fãs. Não é aprovado nem endossado pela Wizards. Partes dos materiais usados são propriedade da Wizards of the Coast. © Wizards of the Coast LLC.'));
}
function privacidade() {
  prose('Política de Privacidade',
    P('Última atualização: 3 de novembro de 2026.'),
    P('O Painel MTG não tem cadastro, não pede dados pessoais e não usa cookies de rastreamento, anúncios ou ferramentas de análise de terceiros.'),
    h('h2', null, 'O que fica no seu navegador'), P('Algumas preferências, como tema claro ou escuro, período do metagame e moeda, ficam salvas no armazenamento local do seu navegador. Elas não saem do seu aparelho, e você pode apagá-las limpando os dados do site no navegador.'),
    h('h2', null, 'Hospedagem e imagens'), P('O site é hospedado no GitHub Pages, que registra dados técnicos de acesso, como endereço IP, para segurança e funcionamento, conforme a política de privacidade do GitHub. As imagens das cartas são carregadas do Scryfall, que também recebe esses dados técnicos ao entregar a imagem.'),
    h('h2', null, 'Nomes de jogadores'), P('Os nomes de usuário exibidos nos resultados são os publicados pelo próprio MTGO nas listas oficiais. Quem quiser a remoção do seu nome de usuário pode pedir pelo contato da página Sobre.'),
    h('h2', null, 'Seus direitos (LGPD)'), P('Como o site não coleta dados pessoais diretamente, não há dados seus guardados por nós. Para qualquer pedido relacionado à LGPD, use o contato da página Sobre.'));
}
function termos() {
  prose('Termos de Uso',
    P('Última atualização: 3 de novembro de 2026. Ao usar o Painel MTG você concorda com estes termos.'),
    h('ul', null,
      h('li', null, 'O site é gratuito e informativo. Metagame, classificações de arquétipo, guias e preços são estimativas e podem conter erros ou atrasos.'),
      h('li', null, 'Preços são de referência, vindos do Scryfall, e não são oferta de venda. Confira sempre com a loja.'),
      h('li', null, 'Magic: The Gathering, nomes de cartas, símbolos e imagens são propriedade da Wizards of the Coast. O site segue a Política de Conteúdo de Fãs da Wizards e não é afiliado a ela.'),
      h('li', null, 'Os dados de cartas e imagens são fornecidos pelo Scryfall, sem vínculo com este site.'),
      h('li', null, 'Os guias de confronto refletem a opinião de quem escreveu, na data indicada.'),
      h('li', null, 'Podemos mudar o site e estes termos a qualquer momento. A data da última atualização fica no topo desta página.')));
}

/* ---------- roteador ---------- */
async function route() {
  const raw = location.hash.replace(/^#\/?/, ''); const [path, qs] = raw.split('?'); const p = path.split('/').map(decodeURIComponent); const params = new URLSearchParams(qs || '');
  tip.hidden = true;
  nav.querySelectorAll('a').forEach((a) => a.toggleAttribute('aria-current', p[0] === 'f' && a.dataset.f === p[1]));
  document.querySelectorAll('.sub a').forEach((a) => { const t = a.getAttribute('href').slice(2); a.toggleAttribute('aria-current', (t === '' && !p[0]) || (t && p[0] === t)); });
  $main.replaceChildren(h('p', { class: 'loading' }, 'Carregando…'));
  try {
    if (!p[0]) await home();
    else if (p[0] === 'f' && FNAME[p[1]]) { if (p[2] === 'a' && p[3]) await archetype(p[1], p[3]); else if (p[2] === 'torneios') await eventsPage(p[1]); else await metagame(p[1], params); }
    else if (p[0] === 'torneios') await eventsPage(null);
    else if (p[0] === 'e' && p[1]) await eventPage(p[1], p[2]);
    else if (p[0] === 'c' && p[1]) await cardPage(p[1]);
    else if (p[0] === 'precos') await precos();
    else if (p[0] === 'guias') await guias(p[1]);
    else if (p[0] === 'sobre') sobre(); else if (p[0] === 'privacidade') privacidade(); else if (p[0] === 'termos') termos();
    else fail('Página não encontrada.');
  } catch (e) { console.error(e); fail(); }
  if (document.activeElement !== q) $main.focus({ preventScroll: true });
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();
get('data/index.json').then((i) => { document.getElementById('upd').textContent = 'Dados atualizados em ' + new Date(i.updated.replace('Z', ':00Z')).toLocaleString('pt-BR') + '.'; }).catch(() => {});
