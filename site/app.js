'use strict';
/* Pac-Meta — site estático. Dados em data/ (gerados a cada hora) e static/guias/. */
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
const money = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdRaw = (v) => v == null ? '—' : 'US$ ' + money(v);
/* Preços em real: o preço do Scryfall (US$) convertido pela cotação do dólar em data/fx.json. */
let FX = null;
async function loadFx() { if (FX === null) { try { const d = await get('data/fx.json'); FX = d && d.rate > 0 ? d : false; } catch (e) { FX = false; } } }
const usd = (v) => v == null ? '—' : FX ? 'R$ ' + money(v * FX.rate) : usdRaw(v);
const fxNote = () => FX ? 'Preço em dólar do Scryfall convertido para real (US$ 1 = R$ ' + money(FX.rate) + (FX.date ? ', ' + dat(FX.date) : '') + '). Na loja o valor pode ser outro.' : 'Preços em dólar, do Scryfall.';
const eur = (v) => v == null ? '—' : '€ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tix = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' tix';
const dat = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${+d} ${MESES[+m - 1]} ${y}`; };
const enc = encodeURIComponent;
const fmtOf = (id) => (FORMATS.find(([f]) => id.startsWith(f + '-')) || [''])[0];
const SYM = (v) => 'https://svgs.scryfall.io/card-symbols/' + v.replace(/\//g, '').toUpperCase() + '.svg';
const CNAME = { W: 'branco', U: 'azul', B: 'preto', R: 'vermelho', G: 'verde', C: 'incolor' };
function pips(col) { const s = h('span', { class: 'pips', role: 'img', 'aria-label': 'Cores: ' + (col || 'C').split('').map((c) => CNAME[c] || c).join(', ') }); (col || 'C').split('').forEach((c) => s.append(h('img', { src: SYM(c), alt: '', width: 16, height: 16, loading: 'lazy' }))); return s; }
function record(w, l) { return w == null ? '' : `${w}-${l}`; }
function rankTxt(r, kind) { if (kind === 'league') return '5-0'; return r ? r + 'º' : '—'; }
function card(...kids) { return h('div', { class: 'card' }, ...kids); }
function title(t) { document.title = t + ' · Pac-Meta'; }
function fail(msg) { $main.replaceChildren(h('p', { class: 'empty' }, msg || 'Não consegui carregar estes dados agora. Tente de novo em alguns minutos.')); }
let CARDS = null;
async function cards() { if (!CARDS) { try { CARDS = await get('data/cards.json'); } catch (e) { CARDS = {}; } } return CARDS; }
const TYPES = [['Creature', 'Criaturas'], ['Planeswalker', 'Planeswalkers'], ['Battle', 'Batalhas'], ['Instant', 'Instantâneas'], ['Sorcery', 'Feitiços'], ['Artifact', 'Artefatos'], ['Enchantment', 'Encantamentos'], ['Land', 'Terrenos']];
function typeOf(n) { const t = ((CARDS || {})[n] || {}).type || ''; const f = t.split('//')[0]; for (const [k, v] of TYPES) if (f.includes(k)) return v; return 'Outras'; }
/* Loja parceira: busca a carta pelo nome em inglês na Pac Deck (loja na plataforma LigaMagic). */
const LOJA = 'Pac Deck';
const lojaUrl = (n) => 'https://www.pacdeck.com.br/?view=ecom/itens&busca=' + enc(String(n).split(' // ')[0]) + '&searchExactMatch=1';
const CART = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2l1.6-6.8H6.2"/></svg>';
const ligaUrl = (n) => 'https://www.ligamagic.com.br/?view=cards/card&card=' + enc(String(n).split(' // ')[0]);
const LUPA = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5"/></svg>';
function ligaLink(n, txt) {
  const a = h('a', { class: txt ? 'btn liga' : 'loja-ic', href: ligaUrl(n), target: '_blank', rel: 'noopener', title: 'Consultar preços de ' + n + ' na LigaMagic', 'aria-label': 'Consultar preços de ' + n + ' na LigaMagic' });
  a.innerHTML = LUPA; if (txt) a.append(h('span', null, txt)); return a;
}
function lojaLink(n, txt) {
  const a = h('a', { class: txt ? 'btn loja' : 'loja-ic', href: lojaUrl(n), target: '_blank', rel: 'noopener', title: 'Procurar ' + n + ' na ' + LOJA, 'aria-label': 'Procurar ' + n + ' na loja ' + LOJA });
  a.innerHTML = CART; if (txt) a.append(h('span', null, txt)); return a;
}
function cardLink(n) { const a = h('a', { href: '#/c/' + enc(n), 'data-card': n }, n); return a; }


const CC = { W: '#e9dfb8', U: '#3d86d6', B: '#5b4f63', R: '#d9553f', G: '#3e9b5c', C: '#9c968e' };
function grad(col, art) { const cs = (col || 'C').split('').map((c) => CC[c] || CC.C); if (cs.length === 1) cs.push('#1d2638'); const g = `linear-gradient(135deg, ${cs.join(', ')})`; return art ? `url("${art}"), ${g}` : g; }
function mana(cost) { const w = h('span', { class: 'mana', role: 'img', 'aria-label': 'Custo: ' + (cost || 'sem custo') }); (String(cost || '').match(/\{[^}]+\}/g) || []).forEach((t) => w.append(h('img', { src: SYM(t.slice(1, -1)), alt: '', width: 16, height: 16, loading: 'lazy' }))); return w; }
function fan(names, max) {
  const C = CARDS || {}; const imgs = (names || []).map((n) => C[n]).filter((c) => c && c.img).slice(0, max || 3);
  const w = h('div', { class: 'fan fan' + imgs.length });
  imgs.forEach((c, i) => w.append(h('img', { src: c.img, alt: c.full || '', loading: 'lazy', style: `--i:${i - (imgs.length - 1) / 2}` })));
  return w;
}
function tile(f, a, rank) {
  return h('a', { class: 'tile', href: `#/f/${f}/a/${a.slug}`, style: `--grad:${grad(a.colors)}` },
    h('div', { class: 'art' }, fan(a.key, 3), rank ? h('span', { class: 'rk' }, '#' + rank) : null, h('span', { class: 'pp' }, pips(a.colors)), h('span', { class: 'sh' }, pct(a.share))),
    h('div', { class: 'bd' }, h('b', { class: 'ellip' }, a.name), h('div', { class: 'meter' }, h('i', { style: `width:${Math.min(100, a.share * 4)}%` })),
      h('div', { class: 'pr' }, h('span', null, usd(a.usd)), h('span', null, tix(a.tix))), a.l50 ? h('span', { class: 'l50' }, a.l50 + '× 5-0 nas ligas') : null));
}

/* ---------- prévia da imagem ao passar o mouse ---------- */
const tip = document.getElementById('tip'); const tipImg = tip.querySelector('img');
document.addEventListener('mouseover', (ev) => {
  const a = ev.target.closest('[data-card]'); if (!a || !CARDS) return;
  const c = CARDS[a.dataset.card]; if (!c || !c.img) return;
  if (a.closest('.visual')) return; tipImg.src = c.img; tip.hidden = false;
});
document.addEventListener('mousemove', (ev) => { if (tip.hidden) return; const W = 250, H = 350; let x = ev.clientX + 24; if (x + W > innerWidth - 8) x = ev.clientX - W - 24; if (x < 8) x = 8; const y = Math.max(8, Math.min(ev.clientY - H / 2, innerHeight - H - 8)); tip.style.left = x + 'px'; tip.style.top = y + 'px'; });
document.addEventListener('mouseout', (ev) => { if (ev.target.closest('[data-card]')) tip.hidden = true; });

/* ---------- tema ---------- */
const root = document.documentElement; const saved = store.get('tema', ''); if (saved) root.dataset.theme = saved;
document.getElementById('theme').addEventListener('click', () => { const dark = (root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'; root.dataset.theme = dark ? 'light' : 'dark'; store.set('tema', root.dataset.theme); });

/* ---------- navegação de formatos ---------- */
const nav = document.getElementById('fmt-nav');
FORMATS.forEach(([f, n]) => nav.append(h('a', { href: '#/f/' + f, 'data-f': f }, n)));
nav.append(h('a', { href: '#/commander', 'data-f': 'commander' }, 'Commander'));

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
  let mv = { up: [], down: [] }; try { mv = await get('data/movers.json'); } catch (e) {}
  $main.replaceChildren(
    h('div', null, h('h1', null, 'Metagame de Magic, atualizado a cada hora'), h('p', { class: 'lead' }, 'Os arquétipos mais jogados de cada formato, as listas dos torneios do MTGO e o preço de cada deck em papel e online.')),
    ...idx.formats.map((f) => h('section', { class: 'fsec' },
      h('header', null, h('h2', null, h('a', { href: '#/f/' + f.id }, 'Metagame ' + f.name)), h('span', { class: 'crumb' }, f.decks30 + ' listas e ' + f.events30 + ' torneios em 30 dias · ', h('a', { href: '#/f/' + f.id }, 'ver todos os decks →'))),
      h('div', { class: 'tiles row6' }, f.top.map((a, i) => tile(f.id, a, i + 1))))),
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
  const [m] = await Promise.all([get(`data/${f}/meta.json`), cards()]); title('Metagame ' + m.name);
  let days = params.get('d') || store.get('dias', '14'); if (!m.windows[days]) days = '14';
  let money = store.get('moeda', 'usd'); let sortK = 'share', sortD = -1; let view = store.get('vista', 'blocos');
  Object.values(m.windows).forEach((w) => w.rows.forEach((r) => { r.trend = r.prev == null ? null : r.share - r.prev; }));
  const body = h('div');
  function draw() {
    const w = m.windows[days]; const rows = w.rows.slice().sort((a, b) => ((a[sortK] ?? -1) > (b[sortK] ?? -1) ? 1 : (a[sortK] ?? -1) < (b[sortK] ?? -1) ? -1 : 0) * sortD);
    const mx = Math.max(1, ...w.rows.map((r) => r.share));
    const th = (k, t, cls) => h('th', { class: cls, 'aria-sort': sortK === k ? (sortD === 1 ? 'ascending' : 'descending') : null }, h('button', { class: 'sortb', onclick: () => { if (sortK === k) sortD = -sortD; else { sortK = k; sortD = k === 'name' ? 1 : -1; } draw(); } }, t + (sortK === k ? (sortD === 1 ? ' ↑' : ' ↓') : '')));
    const table = h('div', { class: 'tbox' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, th('name', 'Arquétipo'), th('share', 'Meta', 'n'), th('trend', 'Tendência', 'n hide-sm'), th('decks', 'Listas', 'n hide-sm'), th('top8', 'Top 8', 'n hide-sm'), th('l50', '5-0', 'n hide-sm'), th('usd', 'Papel', 'n'), th('tix', 'MTGO', 'n hide-sm'))),
      h('tbody', null, rows.map((r) => h('tr', null,
        h('td', { class: 'nm' }, h('a', { href: `#/f/${f}/a/${r.slug}` }, pips(r.colors), r.name), h('br'), h('small', null, r.key.join(' · '))),
        h('td', { class: 'n' }, h('span', { class: 'bar', style: `width:${Math.max(2, r.share / mx * 4.5)}rem` }), pct(r.share)),
        h('td', { class: 'n hide-sm ' + (r.trend == null ? '' : r.trend >= 0 ? 'up' : 'down') }, r.trend == null ? '—' : (r.trend >= 0 ? '▲ +' : '▼ ') + pct(r.trend)),
        h('td', { class: 'n hide-sm' }, r.decks), h('td', { class: 'n hide-sm' }, r.top8 || '—'), h('td', { class: 'n hide-sm' }, r.l50 ? h('a', { href: `#/f/${f}/5-0?a=${r.slug}` }, r.l50) : '—'), h('td', { class: 'n' }, usd(r.usd)), h('td', { class: 'n hide-sm' }, tix(r.tix)))))));
    body.replaceChildren(
      h('div', { class: 'stats', style: 'margin:0 0 1rem' }, h('div', { class: 'stat' }, h('b', null, w.decks), h('small', null, 'listas')), h('div', { class: 'stat' }, h('b', null, w.events), h('small', null, 'torneios')), h('div', { class: 'stat' }, h('b', null, w.rows.length), h('small', null, 'arquétipos'))),
      view === 'blocos' ? h('div', null, h('div', { class: 'tiles' }, w.rows.slice(0, 24).map((r, i) => tile(f, r, i + 1))), w.rows.length > 24 ? h('h2', { style: 'margin:1.6rem 0 .6rem' }, 'Todos os arquétipos') : null, w.rows.length > 24 ? table : null) : table);
  }
  const mkseg = (label, opts, cur, cb) => { const sg = h('div', { class: 'seg', role: 'group', 'aria-label': label }, opts.map(([k, t]) => h('button', { 'aria-pressed': String(k === cur), onclick: (e) => { sg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); cb(k); draw(); } }, t))); return sg; };
  draw();
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', m.name), h('h1', null, 'Metagame de ' + m.name),
      h('p', { class: 'lead' }, 'Participação de cada arquétipo nas listas publicadas dos torneios do MTGO. A tendência compara com o período anterior de mesmo tamanho. O preço é o da lista típica, com a versão mais barata de cada carta.')),
    h('div', { class: 'row between' }, h('div', { class: 'row' }, mkseg('Período', [['7', '7 dias'], ['14', '14 dias'], ['30', '30 dias']], days, (k) => { days = k; store.set('dias', k); }), mkseg('Visualização', [['blocos', 'Blocos'], ['tabela', 'Tabela']], view, (k) => { view = k; store.set('vista', k); })), h('span', { class: 'row' }, h('a', { href: `#/f/${f}/5-0` }, 'Listas 5-0 →'), h('a', { href: `#/f/${f}/torneios` }, 'Torneios →'))),
    body);
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

function curveOf(main) {
  const C = CARDS || {}; const b = [0, 0, 0, 0, 0, 0, 0];
  main.forEach(([q, n]) => { const c = C[n]; if (!c || (c.type || '').split('//')[0].includes('Land') || c.cmc == null) return; b[Math.min(6, Math.round(c.cmc))] += q; });
  const mx = Math.max(1, ...b);
  return h('div', { class: 'curve', role: 'img', 'aria-label': 'Curva de mana: ' + b.map((v, i) => (i === 6 ? '6+' : i) + ': ' + v).join(', ') }, b.map((v, i) => h('div', null, h('span', null, v || ''), h('i', { style: `height:${v / mx * 4}rem` }), h('span', null, i === 6 ? '6+' : i))));
}
function deckBlock(main, side, opts = {}) {
  const C = CARDS || {}; const groups = {};
  main.forEach(([q, n]) => { (groups[typeOf(n)] = groups[typeOf(n)] || []).push([q, n]); });
  const order = TYPES.map((t) => t[1]).concat('Outras');
  const secs = order.filter((t) => groups[t]).map((t) => [t, groups[t]]); if (opts.first) secs.unshift(opts.first); if (side && side.length) secs.push(['Sideboard', side]);
  let view = store.get('vistadeck', 'lista');
  const box = h('div');
  const tot = (l, f) => l.reduce((s, [q, n]) => s + (C[n] && C[n][f] != null ? q * C[n][f] : 0), 0);
  function draw() {
    if (view === 'visual') {
      box.replaceChildren(h('div', { class: 'visual' }, secs.map(([t, l]) => [h('h3', null, t + ' (' + l.reduce((s, x) => s + x[0], 0) + ')'), l.map(([q, n]) => h('a', { href: '#/c/' + enc(n), 'data-card': n, 'aria-label': q + ' ' + n }, C[n] && C[n].img ? h('img', { src: C[n].img, alt: n, loading: 'lazy' }) : h('div', { class: 'ph' }, n), h('span', { class: 'qb' }, q + 'x')))])));
    } else {
      box.replaceChildren(h('table', { class: 'dt' }, h('thead', null, h('tr', null, h('th', null, 'Qtd'), h('th', null, 'Carta'), h('th', { class: 'hide-sm' }, 'Custo'), h('th', { class: 'n' }, 'Papel'), h('th', { class: 'n hide-sm' }, 'MTGO'), h('th', { class: 'lj' }, h('span', { class: 'sr-only' }, 'Loja')))),
        h('tbody', null, secs.map(([t, l], k) => [k ? h('tr', { class: 'sp' }, h('td', { colspan: 6 })) : null, h('tr', null, h('th', { colspan: 6 }, t + ' (' + l.reduce((s, x) => s + x[0], 0) + ')')),
          l.map(([q, n]) => h('tr', null, h('td', { class: 'q' }, q), h('td', null, cardLink(n)), h('td', { class: 'c hide-sm' }, mana((C[n] || {}).cost)), h('td', { class: 'n' }, C[n] && C[n].usd != null ? usd(q * C[n].usd) : '—'), h('td', { class: 'n hide-sm' }, C[n] && C[n].tix != null ? tix(q * C[n].tix) : '—'), h('td', { class: 'lj' }, lojaLink(n), ligaLink(n))))]))));
    }
  }
  const sg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Modo de ver a lista' }, [['lista', 'Lista'], ['visual', 'Visual']].map(([k, t]) => h('button', { 'aria-pressed': String(k === view), onclick: (e) => { view = k; store.set('vistadeck', k); sg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, t)));
  draw();
  const all = main.concat(side || [], opts.first ? opts.first[1] : []);
  const typeRows = secs.filter(([t]) => t !== 'Sideboard').map(([t, l]) => h('div', { class: 'ln' }, h('b', null, l.reduce((s, x) => s + x[0], 0)), h('span', null, t), h('small')));
  return h('div', { class: 'dl' },
    h('div', { style: 'display:grid;gap:.8rem;min-width:0' }, h('div', { class: 'row between' }, sg, opts.export || null), box),
    h('aside', { class: 'side-box' },
      card(h('h3', null, 'Preço do deck'), h('div', { class: 'pricebox' }, h('div', null, h('small', null, 'Papel'), h('b', null, usd(tot(all, 'usd')))), h('div', null, h('small', null, 'MTGO'), h('b', null, tix(tot(all, 'tix'))))), h('p', { class: 'crumb', style: 'margin:.5rem 0 0' }, 'Versão mais barata de cada carta, pelo Scryfall. ' + fxNote())),
      card(h('h3', null, 'Comprar as cartas'), h('p', { class: 'crumb', style: 'margin:0' }, 'Na lista, o carrinho abre a carta na loja ', h('a', { href: 'https://www.pacdeck.com.br/?view=ecom/home', target: '_blank', rel: 'noopener' }, LOJA), ' e a lupa mostra os preços dela nas lojas do Brasil, na ', h('a', { href: 'https://www.ligamagic.com.br/', target: '_blank', rel: 'noopener' }, 'LigaMagic'), '.')),
      card(h('h3', null, 'Curva de mana'), curveOf(main)),
      card(h('h3', null, 'Tipos'), h('div', { class: 'deck' }, h('section', null, typeRows)))));
}
function exportRow(main, side, name, cmd) {
  const ln = (l) => l.map(([q, n]) => q + ' ' + n).join('\n');
  const txt = (cmd && cmd.length ? 'Commander\n' + ln(cmd) + '\n\nDeck\n' : '') + ln(main) + (side && side.length ? '\n\nSideboard\n' + ln(side) : '');
  const st = h('span', { class: 'crumb', role: 'status' });
  return h('div', { class: 'row' },
    h('button', { class: 'btn pri', onclick: () => { navigator.clipboard.writeText(txt).then(() => { st.textContent = 'Lista copiada.'; }, () => { st.textContent = 'Não deu para copiar; use o botão de baixar.'; }); } }, 'Copiar lista'),
    h('button', { class: 'btn', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/plain' })), download: (name || 'deck').replace(/[^\w-]+/g, '_') + '.txt' }); document.body.append(a); a.click(); a.remove(); } }, 'Baixar .txt'), st);
}

async function archetype(f, s) {
  const [a] = await Promise.all([get(`data/${f}/arch/${s}.json`), cards()]); title(a.name + ' · ' + FNAME[f]);
  const col = (await get(`data/${f}/meta.json`).catch(() => ({ windows: {} })));
  const row = Object.values(col.windows).flatMap((w) => w.rows).find((r) => r.slug === s) || {};
  let guide = null; if (f === 'modern') { try { guide = (await get('static/guias/decks_modern.json')).decks.find((x) => x.slug === s); } catch (e) {} }
  let view = 'tipica';
  const box = h('div');
  const statsT = (list, label) => h('div', { class: 'tbox' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, label), h('th', { class: 'n' }, 'Em % das listas'), h('th', { class: 'n' }, 'Cópias (média)'))), h('tbody', null, list.map((x) => h('tr', null, h('td', null, cardLink(x.card)), h('td', { class: 'n' }, pct(x.pct, 0)), h('td', { class: 'n' }, x.avg.toLocaleString('pt-BR')))))));
  function draw() { box.replaceChildren(view === 'tipica' ? deckBlock(a.main, a.side, { export: exportRow(a.main, a.side, a.name) }) : h('div', { class: 'grid2' }, statsT(a.main_stats, 'Principal'), statsT(a.side_stats, 'Sideboard'))); }
  const seg = h('div', { class: 'seg', role: 'group' }, [['tipica', 'Lista típica'], ['stats', 'Cartas e frequência']].map(([k, t]) => h('button', { 'aria-pressed': String(k === view), onclick: (e) => { view = k; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, t)));
  draw();
  $main.replaceChildren(
    h('div', { class: 'banner', style: `--grad:${grad(row.colors, a.art)}` }, fan(a.key || row.key, 5), h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/f/' + f }, FNAME[f]), ' › ', a.name), h('h1', null, pips(row.colors), a.name),
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', null, pct(a.share)), h('small', null, 'do meta em 30 dias')), h('div', { class: 'stat' }, h('b', null, a.decks), h('small', null, 'listas')), h('div', { class: 'stat' }, h('b', null, usd(a.usd)), h('small', null, 'papel')), h('div', { class: 'stat' }, h('b', null, tix(a.tix)), h('small', null, 'MTGO'))))),
    guide ? h('div', { class: 'notice row between' }, h('span', null, 'Este deck tem guia: o que ele faz, como ganha, cartas-chave e turnos decisivos.'), h('a', { class: 'btn pri', href: '#/guias/modern/' + s }, 'Abrir o guia')) : null,
    card(h('div', { class: 'row between' }, seg, h('small', { class: 'crumb' }, 'Lista típica: junta as ' + a.decks + ' listas dos últimos 30 dias, cada carta com o número médio de cópias.')), h('div', { style: 'height:1rem' }), box),
    (() => { const ls = a.recent.filter((r) => r.kind === 'league'); return ls.length ? card(h('h2', null, 'Listas 5-0 nas ligas', h('a', { href: `#/f/${f}/5-0?a=${s}` }, 'ver todas (' + (a.l50 || ls.length) + ') →')), h('div', { class: 'tbox' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Data'), h('th', null, 'Jogador'), h('th', { class: 'n' }, 'Papel'))), h('tbody', null, ls.slice(0, 12).map((r) => h('tr', null, h('td', null, dat(r.date)), h('td', { class: 'nm' }, h('a', { href: `#/e/${r.ev}/${r.i}` }, r.player)), h('td', { class: 'n' }, usd(r.usd)))))))) : null; })(),
    card(h('h2', null, 'Listas recentes de torneios'), h('div', { class: 'tbox' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, h('th', null, 'Data'), h('th', null, 'Jogador'), h('th', null, 'Torneio'), h('th', { class: 'n' }, 'Resultado'), h('th', { class: 'n hide-sm' }, 'Preço'))),
      h('tbody', null, a.recent.filter((r) => r.kind !== 'league').map((r) => h('tr', null, h('td', null, dat(r.date)), h('td', { class: 'nm' }, h('a', { href: `#/e/${r.ev}/${r.i}` }, r.player)), h('td', null, h('a', { href: '#/e/' + r.ev }, r.evname)), h('td', { class: 'n' }, r.kind === 'league' ? '5-0' : (r.rank ? r.rank + 'º' : '') + (r.w != null ? ' (' + record(r.w, r.l) + ')' : '')), h('td', { class: 'n hide-sm' }, usd(r.usd)))))))));
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
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/e/' + e.id }, e.name), ' › ', d.player), h('h1', null, d.arch), h('p', { class: 'lead' }, 'por ' + d.player + ' · ' + rankTxt(d.rank, e.kind) + (d.wins != null && e.kind !== 'league' ? ' (' + record(d.wins, d.losses) + ')' : '') + ' · ' + dat(e.date) + ' · ', h('a', { href: `#/f/${e.format}/a/${d.aslug}` }, 'ver o arquétipo'))),
    card(deckBlock(d.main, d.side, { export: exportRow(d.main, d.side, d.arch + '-' + d.player) })));
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
          h('tbody', null, h('tr', null, h('td', null, FX ? 'Papel, mais barata (R$)' : 'Papel, mais barata (US$)'), h('td', { class: 'n price' }, usd(c.usd)), h('td', { class: 'n' }, ch(c.usd, c.usd7))), FX ? h('tr', null, h('td', null, 'Papel, mais barata (US$)'), h('td', { class: 'n' }, usdRaw(c.usd)), h('td', { class: 'n' }, '')) : null, h('tr', null, h('td', null, 'Papel, mais barata (EUR)'), h('td', { class: 'n' }, eur(c.eur)), h('td', { class: 'n' }, '')), h('tr', null, h('td', null, 'MTGO'), h('td', { class: 'n' }, tix(c.tix)), h('td', { class: 'n' }, ch(c.tix, c.tix7)))))),
          h('div', { class: 'row', style: 'margin:.9rem 0 .5rem' }, lojaLink(n, 'Procurar na ' + LOJA), ligaLink(n, 'Preços na LigaMagic')),
          h('p', { class: 'crumb' }, 'Preços de referência do Scryfall, atualizados uma vez por dia. ' + (FX ? fxNote() + ' ' : ''), c.uri ? h('a', { href: c.uri, target: '_blank', rel: 'noopener' }, 'Ver no Scryfall') : '')),
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
      h('tbody', null, list.map(({ n, c, use }) => h('tr', null, h('td', { class: 'nm' }, cardLink(n), ' ', lojaLink(n), ligaLink(n)), h('td', { class: 'n' }, pct(use)), h('td', { class: 'n' }, usd(c.usd)), h('td', { class: 'n hide-sm' }, tix(c.tix))))))));
  }
  const sel = h('select', { 'aria-label': 'Formato', onchange: (e) => { f = e.target.value; store.set('fmtprecos', f); drawTop(); } }, FORMATS.map(([k, n]) => h('option', { value: k, selected: k === f }, n)));
  drawTop();
  $main.replaceChildren(h('div', null, h('h1', null, 'Preços'), h('p', { class: 'lead' }, 'Preço da versão mais barata de cada carta, em papel e no MTGO. A variação compara com 7 dias atrás.')),
    h('div', { class: 'grid2' }, card(h('h2', null, 'Subiram na semana'), moversTable(mv.up.slice(0, 25), C)), card(h('h2', null, 'Caíram na semana'), moversTable(mv.down.slice(0, 25), C))),
    card(h('h2', null, 'Cartas mais jogadas', sel), box));
}


async function ligas(f, params) {
  f = f || store.get('fmt50', 'modern'); store.set('fmt50', f);
  title('Listas 5-0 de ' + FNAME[f]);
  const [list] = await Promise.all([get(`data/${f}/league.json`).catch(() => []), cards()]);
  let arch = (params && params.get('a')) || '', q = '', page = 0; const PER = 60;
  const box = h('div'); const info = h('p', { class: 'crumb', role: 'status' });
  const archs = [...new Map(list.map((x) => [x.aslug, x.arch])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cnt = {}; list.forEach((x) => { cnt[x.aslug] = (cnt[x.aslug] || 0) + 1; });
  function draw() {
    const t = q.trim().toLowerCase();
    const rows = list.filter((x) => (!arch || x.aslug === arch) && (!t || (x.player + ' ' + x.arch).toLowerCase().includes(t)));
    const view = rows.slice(page * PER, (page + 1) * PER);
    info.textContent = rows.length + ' listas 5-0' + (arch ? ' de ' + (archs.find((a) => a[0] === arch) || [])[1] : '') + ' nos últimos 30 dias.';
    const C = CARDS || {};
    box.replaceChildren(
      h('div', { class: 'tbox' }, h('table', { class: 't' },
        h('thead', null, h('tr', null, h('th', null, 'Data'), h('th', null, 'Deck'), h('th', { class: 'hide-sm' }, 'Cartas-chave'), h('th', null, 'Jogador'), h('th', { class: 'n' }, 'Papel'), h('th', { class: 'n hide-sm' }, 'MTGO'))),
        h('tbody', null, view.map((x) => h('tr', null,
          h('td', null, dat(x.date)),
          h('td', { class: 'nm' }, h('a', { href: `#/f/${f}/a/${x.aslug}` }, pips(x.col), x.arch), h('br'), h('a', { class: 'crumb', href: `#/e/${x.ev}/${x.i}` }, 'ver esta lista →')),
          h('td', { class: 'hide-sm' }, h('span', { class: 'thumbs' }, x.key.map((n) => C[n] && C[n].img ? h('img', { src: C[n].img, alt: n, title: n, 'data-card': n, loading: 'lazy' }) : null))),
          h('td', null, x.player), h('td', { class: 'n' }, usd(x.usd)), h('td', { class: 'n hide-sm' }, tix(x.tix))))))),
      rows.length > PER ? h('div', { class: 'row', style: 'margin-top:.8rem' },
        h('button', { class: 'btn', disabled: page === 0, onclick: () => { page--; draw(); scrollTo(0, 0); } }, '← Anteriores'),
        h('span', { class: 'crumb' }, 'Página ' + (page + 1) + ' de ' + Math.ceil(rows.length / PER)),
        h('button', { class: 'btn', disabled: (page + 1) * PER >= rows.length, onclick: () => { page++; draw(); scrollTo(0, 0); } }, 'Próximas →')) : null);
  }
  const fsel = h('select', { 'aria-label': 'Formato', onchange: (e) => { location.hash = '#/f/' + e.target.value + '/5-0'; } }, FORMATS.map(([k, n]) => h('option', { value: k, selected: k === f }, n)));
  const asel = h('select', { 'aria-label': 'Arquétipo', onchange: (e) => { arch = e.target.value; page = 0; draw(); } }, h('option', { value: '' }, 'Todos os arquétipos'), archs.map(([k, n]) => h('option', { value: k, selected: k === arch }, n + ' (' + cnt[k] + ')')));
  const qi = h('input', { class: 'input', type: 'search', placeholder: 'Jogador ou deck', 'aria-label': 'Buscar jogador ou deck', oninput: (e) => { q = e.target.value; page = 0; draw(); } });
  draw();
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/f/' + f }, FNAME[f]), ' › Listas 5-0'), h('h1', null, 'Listas 5-0 de ' + FNAME[f]),
      h('p', { class: 'lead' }, 'Listas que fizeram 5 vitórias e 0 derrotas nas ligas do MTGO e foram publicadas pela Wizards. O MTGO divulga só parte das listas 5-0 de cada dia.')),
    card(h('div', { class: 'row' }, fsel, asel, qi), info, box));
}

/* ---------- guias ---------- */
async function guiasIndex() {
  title('Guias de decks');
  const [g] = await Promise.all([get('static/guias/decks_modern.json'), cards()]);
  const ds = g.decks.slice().sort((a, b) => b.meta - a.meta);
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › Guias'), h('h1', null, 'Guias de decks'),
      h('p', { class: 'lead' }, 'Um guia para cada deck: o que ele faz, como ganha, as cartas-chave, a mão que procura, os turnos decisivos e uma lista de referência. Por enquanto, os decks do Modern; os outros formatos entram aos poucos.')),
    h('section', { class: 'fsec' }, h('header', null, h('h2', null, 'Modern'), h('span', { class: 'crumb' }, ds.length + ' guias · pesquisa de outubro de 2026')),
      h('div', { class: 'tiles' }, ds.map((d) => h('a', { class: 'tile', href: '#/guias/modern/' + d.slug, style: `--grad:${grad('')}` },
        h('div', { class: 'art' }, fan(d.cartas_chave.split(',').map((x) => x.trim()), 3), h('span', { class: 'sh' }, pct(d.meta))),
        h('div', { class: 'bd' }, h('b', { class: 'ellip' }, d.name), h('div', { class: 'pr' }, h('span', null, 'Guia do deck'), h('span', null, '→'))))))),
    card(h('h2', null, 'Guia de confronto do Azorius Chant'), h('p', { class: 'lead', style: 'margin:0 0 .6rem' }, 'Plano de jogo, sideboard e contingências do Azorius Chant contra cada um desses decks.'), h('a', { class: 'btn pri', href: '#/guias/chant' }, 'Abrir o guia do Chant')));
}

async function guiaDeck(f, s) {
  const [g] = await Promise.all([get('static/guias/decks_modern.json'), cards()]);
  const d = g.decks.find((x) => x.slug === s); if (!d) return fail('Ainda não há guia para esse deck.');
  title('Guia: ' + d.name);
  const keys = d.cartas_chave.split(',').map((x) => x.trim());
  const kv = (pairs) => h('div', { class: 'kv' }, pairs.filter(([, v]) => v).map(([k, v]) => h('div', null, h('h4', null, k), h('p', null, v))));
  const l = d.lista;
  $main.replaceChildren(
    h('div', { class: 'banner', style: `--grad:${grad('')}` }, fan(keys, 5), h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/guias' }, 'Guias'), ' › Modern'), h('h1', null, d.name),
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', null, pct(d.meta)), h('small', null, 'do campo nos Regionais de outubro')), h('div', { class: 'stat' }, h('b', null, 'Confiança ' + (d.confianca || '—')), h('small', null, 'da pesquisa'))))),
    card(h('h2', null, 'O deck'), h('p', { class: 'prose', style: 'margin:0' }, d.resumo)),
    card(h('h2', null, 'Como joga'), kv([['Como ganha', d.como_ganham], ['A mão que procura', d.mulligan], ['Turnos-chave', d.turnos]])),
    card(h('h2', null, 'Cartas-chave'), h('div', { class: 'opps' }, keys.map((n) => h('a', { class: 'btn', href: '#/c/' + enc(n), 'data-card': n }, n)))),
    card(h('h2', null, 'Contra decks de controle'), h('p', { class: 'crumb', style: 'margin:0 0 .6rem' }, 'Estudo feito contra o Azorius Chant, que é o controle mais jogado do formato.'), kv([['Plano', d.vs_controle], ['O que entra do sideboard', d.side_vs_controle]])),
    card(h('h2', null, 'Lista de referência', h('small', null, [l.jogador, l.colocacao, l.evento, l.data ? dat(l.data) : ''].filter(Boolean).join(' · '))), deckBlock(l.main, l.side, { export: exportRow(l.main, l.side, d.name) }), l.fonte && /^https?:/.test(l.fonte) ? h('p', { class: 'crumb' }, h('a', { href: l.fonte, target: '_blank', rel: 'noopener' }, 'Fonte da lista')) : null),
    h('div', { class: 'row' }, h('a', { class: 'btn', href: `#/f/modern/a/${d.slug}` }, 'Metagame e listas recentes deste deck'), h('a', { class: 'btn', href: '#/guias/chant/' + d.study }, 'Como o Azorius Chant enfrenta este deck')));
}

async function guiaChant(slugSel) {
  title('Guia do Azorius Chant');
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
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/guias' }, 'Guias'), ' › Azorius Chant contra cada deck'), h('h1', null, 'Azorius Chant: plano contra cada deck do Modern'),
      h('p', { class: 'lead' }, 'Plano de jogo, sideboard e contingências do Azorius Chant contra os decks mais jogados do Modern. Escrito em outubro de 2026 para o Regional da América do Sul e conferido por revisores de regras. O meta citado é o dos Regionais de outono.')),
    card(h('h2', null, 'Escolha o oponente'), h('div', { class: 'opps' }, decks.map((d) => h('button', { 'aria-pressed': String(d === cur), onclick: () => { location.hash = '#/guias/chant/' + slugOf(d.deck); } }, d.deck)))),
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
const AUTOR = 'João Hering', EMAIL = 'joaohhp2003@gmail.com';
const mail = () => h('a', { href: 'mailto:' + EMAIL }, EMAIL);
function sobre() {
  prose('Sobre o Pac-Meta',
    P('O Pac-Meta é um site gratuito, feito por fã e criado por ' + AUTOR + ', com o metagame dos formatos competitivos de Magic: The Gathering, as listas dos torneios oficiais do MTGO e o preço das cartas.'),
    h('h2', null, 'De onde vêm os dados'),
    h('ul', null, h('li', null, 'Resultados e listas: páginas públicas de decklists do Magic: The Gathering Online (mtgo.com). O site verifica novos resultados a cada hora.'), h('li', null, 'Dados, imagens e preços das cartas: Scryfall, uma vez por dia. O preço mostrado é o da versão mais barata em inglês, em dólar, convertido para real pela cotação do dia.'), h('li', null, 'Arquétipos: o site classifica cada lista por cartas-chave. Listas que não se encaixam em nenhuma regra recebem o nome das cores e de uma carta marcante.')),
    h('h2', null, 'Limitações'),
    h('ul', null, h('li', null, 'Nas ligas, o MTGO publica só parte das listas 5-0, então elas não representam todo o campo.'), h('li', null, 'Torneios presenciais ainda não estão incluídos. As listas de Commander são escolhidas a dedo, porque o MTGO não publica resultados do formato.'), h('li', null, 'Preços são referência e não oferta de venda.')),
    h('h2', null, 'Contato'), P('Sugestões, correções e pedidos de remoção: fale com ' + AUTOR + ' pelo e-mail ', mail(), '.'),
    h('p', { class: 'notice' }, 'Pac-Meta é conteúdo de fã não oficial, permitido pela Política de Conteúdo de Fãs. Não é aprovado nem endossado pela Wizards. Partes dos materiais usados são propriedade da Wizards of the Coast. © Wizards of the Coast LLC.'));
}
function privacidade() {
  prose('Política de Privacidade',
    P('Última atualização: 3 de novembro de 2026.'),
    P('O Pac-Meta não tem cadastro, não pede dados pessoais e não usa cookies de rastreamento, anúncios ou ferramentas de análise de terceiros.'),
    h('h2', null, 'O que fica no seu navegador'), P('Algumas preferências, como tema claro ou escuro, período do metagame e moeda, ficam salvas no armazenamento local do seu navegador. Elas não saem do seu aparelho, e você pode apagá-las limpando os dados do site no navegador.'),
    h('h2', null, 'Hospedagem e imagens'), P('O site é hospedado no GitHub Pages, que registra dados técnicos de acesso, como endereço IP, para segurança e funcionamento, conforme a política de privacidade do GitHub. As imagens das cartas são carregadas do Scryfall, que também recebe esses dados técnicos ao entregar a imagem.'),
    h('h2', null, 'Nomes de jogadores'), P('Os nomes de usuário exibidos nos resultados são os publicados pelo próprio MTGO nas listas oficiais. Quem quiser a remoção do seu nome de usuário pode pedir pelo e-mail ', mail(), '.'),
    h('h2', null, 'Seus direitos (LGPD)'), P('Como o site não coleta dados pessoais diretamente, não há dados seus guardados por nós. Para qualquer pedido relacionado à LGPD, escreva para ', mail(), '.'),
    h('h2', null, 'Responsável'), P('O Pac-Meta foi criado e é mantido por ' + AUTOR + '. Contato: ', mail(), '.'));
}
function termos() {
  prose('Termos de Uso',
    P('Última atualização: 3 de novembro de 2026. Ao usar o Pac-Meta você concorda com estes termos.'),
    P('O Pac-Meta foi criado e é mantido por ' + AUTOR + '. Dúvidas, correções e pedidos sobre estes termos: ', mail(), '.'),
    h('ul', null,
      h('li', null, 'O site é gratuito e informativo. Metagame, classificações de arquétipo, guias e preços são estimativas e podem conter erros ou atrasos.'),
      h('li', null, 'Preços são de referência: valores do Scryfall em dólar convertidos para real pela cotação do dia. Não são oferta de venda. Confira sempre com a loja.'),
      h('li', null, 'Magic: The Gathering, nomes de cartas, símbolos e imagens são propriedade da Wizards of the Coast. O site segue a Política de Conteúdo de Fãs da Wizards e não é afiliado a ela.'),
      h('li', null, 'Os dados de cartas e imagens são fornecidos pelo Scryfall, sem vínculo com este site.'),
      h('li', null, 'Os guias de confronto refletem a opinião de quem escreveu, na data indicada.'),
      h('li', null, 'Podemos mudar o site e estes termos a qualquer momento. A data da última atualização fica no topo desta página.')),
    h('h2', null, 'Contato'), P(AUTOR + ': ', mail(), '.'));
}



/* ---------- Commander (listas enviadas à mão, em data/commander) ---------- */
const CMD_TABS = [['bhell', 'Bhell'], ['cedh', 'cEDH'], ['comunidade', 'Comunidade']];
function cmdTile(d) {
  return h('a', { class: 'tile', href: '#/commander/deck/' + d.slug, style: `--grad:${grad(d.colors, d.art)}` },
    h('div', { class: 'art' }, fan(d.cmd, 2), h('span', { class: 'pp' }, pips(d.colors)), d.categoria === 'bhell' && d.colocacao ? h('span', { class: 'rk' }, d.colocacao + 'º') : null),
    h('div', { class: 'bd' }, h('b', { class: 'ellip' }, d.nome), h('small', { class: 'ellip crumb' }, d.jogador || d.autor || d.cmd.join(' + ')), h('div', { class: 'pr' }, h('span', null, usd(d.usd)), h('span', null, d.cards + ' cartas'))));
}
async function commanderIndex(tab) {
  tab = CMD_TABS.some(([k]) => k === tab) ? tab : 'bhell';
  const tname = CMD_TABS.find(([k]) => k === tab)[1]; title(tname + ' · Commander');
  const [ix] = await Promise.all([get('data/commander/index.json').catch(() => ({ decks: [] })), cards()]);
  const ds = ix.decks.filter((d) => (d.categoria || 'comunidade') === tab).sort((a, b) => (b.data || '').localeCompare(a.data || '') || (a.colocacao || 99) - (b.colocacao || 99) || a.nome.localeCompare(b.nome));
  const n = (k) => ix.decks.filter((d) => (d.categoria || 'comunidade') === k).length;
  const tabs = h('nav', { class: 'seg cmdtabs', 'aria-label': 'Seções de Commander' }, CMD_TABS.map(([k, t]) => h('a', { href: '#/commander/' + k, 'aria-current': k === tab ? 'page' : null }, t, n(k) ? h('small', null, n(k)) : null)));
  const vazio = (titulo, texto) => card(h('h2', null, titulo), h('p', { class: 'lead', style: 'margin:0' }, texto));
  let body;
  if (tab === 'bhell') {
    const evs = []; const by = {};
    ds.forEach((d) => { const k = (d.data || '') + '|' + (d.evento || 'Bhell'); if (!by[k]) { by[k] = { data: d.data, nome: d.evento || 'Bhell', decks: [] }; evs.push(by[k]); } by[k].decks.push(d); });
    body = evs.length ? evs.map((e) => card(h('h2', null, e.nome + (e.data ? ' · ' + dat(e.data) : ''), h('span', { class: 'crumb' }, e.decks.length + (e.decks.length > 1 ? ' decks' : ' deck'))),
      h('div', { class: 'tbox' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Pos.'), h('th', null, 'Jogador'), h('th', null, 'Comandante'), h('th', { class: 'n' }, 'Preço'))),
        h('tbody', null, e.decks.map((d) => h('tr', null, h('td', null, d.colocacao ? d.colocacao + 'º' : '—'), h('td', { class: 'nm' }, d.jogador || '—'),
          h('td', null, h('a', { href: '#/commander/deck/' + d.slug }, pips(d.colors), d.nome)), h('td', { class: 'n' }, usd(d.usd)))))))))
      : vazio('Os resultados do Bhell entram em breve', 'Toda semana, os decks do campeonato de quinta-feira da Pac Deck aparecem aqui, com a colocação de cada jogador.');
  } else if (tab === 'cedh') {
    body = ds.length ? h('div', { class: 'tiles' }, ds.map(cmdTile)) : vazio('As listas de cEDH entram em breve', 'Aqui ficam os decks de Commander competitivo (cEDH), com preço em reais e as cartas ligadas à Pac Deck e à LigaMagic.');
  } else {
    body = ds.length ? h('div', { class: 'tiles' }, ds.map(cmdTile)) : vazio('Os decks da comunidade entram em breve', h('span', null, 'Em breve, qualquer pessoa vai poder subir o próprio deck de Commander aqui. Enquanto isso, mande sua lista pela página de ', h('a', { href: '#/sugestoes' }, 'Sugestões'), '.'));
  }
  const intro = { bhell: 'O Bhell é o campeonato semanal de Commander da Pac Deck, toda quinta-feira. Aqui ficam os decks de cada rodada, com a colocação dos jogadores.', cedh: 'Decks de Commander competitivo (cEDH), escolhidos a dedo.', comunidade: 'Decks de Commander montados pela comunidade.' }[tab];
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/commander' }, 'Commander'), ' › ', tname), h('h1', null, 'Commander'), h('p', { class: 'lead' }, intro)),
    tabs, ...[].concat(body));
}
async function commanderDeck(s) {
  const [d] = await Promise.all([get('data/commander/' + s + '.json'), cards()]); title(d.nome + ' · Commander');
  $main.replaceChildren(
    h('div', { class: 'banner', style: `--grad:${grad(d.colors, d.art)}` }, fan(d.cmd, 2), h('div', null,
      h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/commander' }, 'Commander'), ' › ', h('a', { href: '#/commander/' + (d.categoria || 'comunidade') }, (CMD_TABS.find(([k]) => k === (d.categoria || 'comunidade')) || [, ''])[1]), ' › ', d.nome),
      h('h1', null, pips(d.colors), d.nome),
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', null, d.cmd.join(' + ')), h('small', null, d.cmd.length > 1 ? 'comandantes' : 'comandante')), h('div', { class: 'stat' }, h('b', null, d.cards), h('small', null, 'cartas')), h('div', { class: 'stat' }, h('b', null, usd(d.usd)), h('small', null, 'papel'))))),
    (d.descricao || d.autor || d.jogador) ? card(d.descricao ? h('p', { class: 'prose', style: 'margin:0' }, d.descricao) : null, (d.autor || d.jogador) ? h('p', { class: 'crumb', style: 'margin:.5rem 0 0' }, d.categoria === 'bhell' ? (d.jogador || d.autor) + (d.colocacao ? ' · ' + d.colocacao + 'º lugar' : '') + ' no ' + (d.evento || 'Bhell') + (d.data ? ' de ' + dat(d.data) : '') : 'Lista de ' + (d.autor || d.jogador) + (d.data ? ' · ' + dat(d.data) : '')) : null) : '',
    card(deckBlock(d.main, [], { first: [d.cmdlist.length > 1 ? 'Comandantes' : 'Comandante', d.cmdlist], export: exportRow(d.main, [], d.nome, d.cmdlist) })));
}

/* ---------- formulários que viram e-mail ---------- */
/* O site é estático: os formulários montam um e-mail para o responsável, que recebe e decide. */
function field(f) {
  const id = 'f-' + f.k; const req = f.req ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null;
  let el;
  if (f.type === 'textarea') el = h('textarea', { id, name: f.k, rows: f.rows || 5, required: f.req, maxlength: f.max, placeholder: f.ph || '' });
  else if (f.type === 'select') el = h('select', { id, name: f.k, required: f.req }, h('option', { value: '' }, 'Escolha…'), f.opts.map((o) => h('option', { value: o }, o)));
  else if (f.type === 'checks') return h('fieldset', { class: 'fld' }, h('legend', null, f.label, req), h('div', { class: 'checks' }, f.opts.map((o, i) => h('label', null, h('input', { type: 'checkbox', name: f.k, value: o, id: id + i }), ' ', o))));
  else if (f.type === 'scale') return h('fieldset', { class: 'fld' }, h('legend', null, f.label, req), h('div', { class: 'scale' }, Array.from({ length: 11 }, (_, i) => h('label', null, h('input', { type: 'radio', name: f.k, value: String(i), required: f.req && i === 0 }), h('span', null, i)))), h('div', { class: 'scale-ends' }, h('small', null, 'Nada provável'), h('small', null, 'Muito provável')));
  else el = h('input', { id, name: f.k, type: f.type || 'text', required: f.req, maxlength: f.max, placeholder: f.ph || '', class: 'input' });
  return h('div', { class: 'fld' }, h('label', { for: id }, f.label, req), f.help ? h('small', { class: 'help' }, f.help) : null, el);
}
function mailForm({ fields, subject, intro, sendLabel, done }) {
  const st = h('p', { class: 'crumb', role: 'status' });
  const form = h('form', { class: 'form', novalidate: true }, fields.map(field),
    h('div', { class: 'row' }, h('button', { class: 'btn pri', type: 'submit' }, sendLabel || 'Enviar por e-mail'), h('button', { class: 'btn', type: 'button', onclick: () => copy(false) }, 'Copiar respostas')), st);
  function text() {
    const fd = new FormData(form);
    return fields.map((f) => { const v = f.type === 'checks' ? fd.getAll(f.k).join(', ') : (fd.get(f.k) || '').toString().trim(); return v ? f.label + ':\n' + v : null; }).filter(Boolean).join('\n\n');
  }
  function copy(quiet) { const t = text(); return navigator.clipboard ? navigator.clipboard.writeText(t).then(() => { if (!quiet) st.textContent = 'Respostas copiadas. Cole num e-mail para ' + EMAIL + '.'; return true; }, () => false) : Promise.resolve(false); }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = fields.find((f) => f.req && !(f.type === 'checks' ? new FormData(form).getAll(f.k).length : (new FormData(form).get(f.k) || '').toString().trim()));
    if (bad) { st.textContent = 'Preencha o campo "' + bad.label + '".'; const el = form.querySelector('[name="' + bad.k + '"]'); if (el) el.focus(); return; }
    const t = text(); const subj = typeof subject === 'function' ? subject(new FormData(form)) : subject;
    let body = (intro ? intro + '\n\n' : '') + t;
    if (body.length > 1800) { await copy(true); body = (intro ? intro + '\n\n' : '') + '(O texto completo foi copiado. Cole aqui embaixo antes de enviar.)\n\n'; st.textContent = 'O texto é longo, então copiei tudo: cole no e-mail que abriu antes de enviar.'; }
    else st.textContent = done || 'Abrimos seu programa de e-mail com as respostas. Confira e envie. Se nada abriu, use "Copiar respostas" e mande para ' + EMAIL + '.';
    location.href = 'mailto:' + EMAIL + '?subject=' + enc(subj) + '&body=' + enc(body);
  });
  return form;
}

/* ---------- artigos ---------- */
/* Artigos ficam em static/artigos: index.json lista os publicados e cada um tem um .md.
   Qualquer pessoa pode enviar um texto pelo formulário; só entra aqui o que o responsável aprovar. */
function inline(t) {
  const out = []; const re = /\*\*([^*]+)\*\*|\[\[([^\]]+)\]\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+|#\/[^)\s]*)\)/g; let i = 0, m;
  while ((m = re.exec(t))) { if (m.index > i) out.push(t.slice(i, m.index)); if (m[1]) out.push(h('b', null, m[1])); else if (m[2]) out.push(cardLink(m[2])); else out.push(h('a', m[4].startsWith('#') ? { href: m[4] } : { href: m[4], target: '_blank', rel: 'noopener' }, m[3])); i = re.lastIndex; }
  if (i < t.length) out.push(t.slice(i)); return out;
}
function md(src) {
  const out = []; let list = null;
  for (const raw of src.replace(/\r/g, '').split(/\n{2,}/)) {
    const b = raw.trim(); if (!b) continue;
    const lines = b.split('\n');
    if (/^#{2,3} /.test(b)) { out.push(h(b.startsWith('### ') ? 'h3' : 'h2', null, inline(b.replace(/^#+ /, '')))); continue; }
    if (lines.every((l) => /^- /.test(l))) { out.push(h('ul', null, lines.map((l) => h('li', null, inline(l.slice(2)))))); continue; }
    if (lines.every((l) => /^\d+\. /.test(l))) { out.push(h('ol', null, lines.map((l) => h('li', null, inline(l.replace(/^\d+\. /, '')))))); continue; }
    if (b.startsWith('> ')) { out.push(h('blockquote', null, inline(lines.map((l) => l.replace(/^> ?/, '')).join(' ')))); continue; }
    out.push(h('p', null, inline(lines.join(' '))));
  }
  return out;
}
async function artigosIndex() {
  title('Artigos'); const [ix] = await Promise.all([get('static/artigos/index.json'), cards()]);
  const as = ix.artigos.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › Artigos'), h('h1', null, 'Artigos'),
      h('p', { class: 'lead' }, 'Textos sobre metagame, decks e o jogo competitivo. Qualquer pessoa pode enviar um artigo; os textos são lidos e aprovados antes de entrar no site.')),
    h('div', { class: 'arts' }, as.map((a) => h('a', { class: 'card art-card', href: '#/artigos/' + a.slug },
      h('div', { class: 'tags' }, (a.tags || []).map((t) => h('span', { class: 'tag' }, t))),
      h('h2', null, a.titulo), h('p', null, a.resumo), h('small', { class: 'crumb' }, (a.autor || 'Equipe Pac-Meta') + ' · ' + dat(a.data))))),
    card(h('h2', null, 'Escreva para o Pac-Meta'), h('p', { class: 'lead', style: 'margin:0 0 .7rem' }, 'Tem um guia, uma análise de metagame ou um relato de torneio? Mande seu texto. Ele é lido antes de ser publicado, e você recebe uma resposta por e-mail.'), h('a', { class: 'btn pri', href: '#/artigos/enviar' }, 'Enviar um artigo')));
}
async function artigoPage(slug) {
  const [ix] = await Promise.all([get('static/artigos/index.json'), cards()]);
  const a = ix.artigos.find((x) => x.slug === slug); if (!a) return fail('Artigo não encontrado.');
  const r = await fetch('static/artigos/' + slug + '.md', { cache: 'no-cache' }); if (!r.ok) return fail();
  const txt = await r.text(); title(a.titulo);
  const outros = ix.artigos.filter((x) => x.slug !== slug).slice(0, 3);
  $main.replaceChildren(
    h('article', { class: 'card prose artigo' },
      h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/artigos' }, 'Artigos')),
      h('div', { class: 'tags' }, (a.tags || []).map((t) => h('span', { class: 'tag' }, t))),
      h('h1', null, a.titulo), h('p', { class: 'lead' }, a.resumo), h('p', { class: 'crumb' }, 'Por ' + (a.autor || 'Equipe Pac-Meta') + ' · ' + dat(a.data)),
      md(txt)),
    outros.length ? card(h('h2', null, 'Leia também'), h('ul', { class: 'links' }, outros.map((x) => h('li', null, h('a', { href: '#/artigos/' + x.slug }, x.titulo))))) : null);
}
function enviarArtigo() {
  title('Enviar um artigo');
  $main.replaceChildren(h('div', { class: 'card prose' },
    h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/artigos' }, 'Artigos'), ' › Enviar'),
    h('h1', null, 'Enviar um artigo'),
    P('Qualquer pessoa pode escrever para o Pac-Meta. Todo texto é lido por ' + AUTOR + ' antes de ser publicado: ele pode aprovar, pedir ajustes ou recusar, e responde pelo e-mail que você informar.'),
    h('h2', null, 'Antes de enviar'),
    h('ul', null, h('li', null, 'O texto precisa ser seu e inédito. Não copie artigos, listas comentadas ou imagens de outros sites.'), h('li', null, 'Escreva em português, de forma clara. Entre 400 e 2.000 palavras costuma funcionar bem.'), h('li', null, 'Use ## para os subtítulos e - no começo da linha para listas. Para citar uma carta, escreva o nome em inglês entre colchetes duplos, como [[Lightning Bolt]].'), h('li', null, 'Ao enviar, você autoriza o Pac-Meta a publicar o texto com o seu nome, com revisão de ortografia e formatação.')),
    mailForm({ subject: (fd) => 'Artigo para o Pac-Meta: ' + (fd.get('titulo') || ''), intro: 'Olá! Segue um artigo para avaliação.', sendLabel: 'Enviar para aprovação',
      fields: [
        { k: 'nome', label: 'Seu nome (como deve aparecer no artigo)', req: true, max: 80 },
        { k: 'email', label: 'Seu e-mail para resposta', type: 'email', req: true, max: 120 },
        { k: 'titulo', label: 'Título', req: true, max: 120 },
        { k: 'resumo', label: 'Resumo em uma ou duas frases', type: 'textarea', rows: 2, req: true, max: 300 },
        { k: 'tema', label: 'Tema', type: 'select', req: true, opts: ['Metagame', 'Guia de deck', 'Relato de torneio', 'Preços e mercado', 'Iniciantes', 'Outro'] },
        { k: 'texto', label: 'Texto do artigo', type: 'textarea', rows: 16, req: true, help: 'Se o texto for longo, ele é copiado e você cola no e-mail que abrir.' },
      ] })));
}

/* ---------- sugestões ---------- */
function sugestoes() {
  title('Sugestões e ideias');
  $main.replaceChildren(h('div', { class: 'card prose' },
    h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › Sugestões'),
    h('h1', null, 'O que podemos melhorar?'),
    P('Conte o que você usa no Pac-Meta, o que atrapalha e o que gostaria de ver aqui. Leva uns 2 minutos. As respostas vão por e-mail para ' + AUTOR + ' e ajudam a decidir o que fazer a seguir. Nenhum campo é guardado no site.'),
    mailForm({ subject: 'Sugestões para o Pac-Meta', intro: 'Respostas da pesquisa de sugestões do Pac-Meta:',
      fields: [
        { k: 'formatos', label: 'Quais formatos você joga?', type: 'checks', opts: FORMATS.map((f) => f[1]).concat('Commander', 'Outro') },
        { k: 'usa', label: 'O que você mais usa no site?', type: 'checks', opts: ['Metagame', 'Listas dos torneios', 'Listas 5-0', 'Preços', 'Guias', 'Artigos', 'Busca de cartas'] },
        { k: 'nota', label: 'De 0 a 10, quanto você recomendaria o Pac-Meta a um amigo?', type: 'scale' },
        { k: 'melhorar', label: 'O que está ruim, confuso ou faltando?', type: 'textarea', rows: 4, req: true },
        { k: 'ideias', label: 'Que ideia nova você gostaria de ver?', type: 'textarea', rows: 4 },
        { k: 'email', label: 'Seu e-mail (opcional, se quiser resposta)', type: 'email', max: 120 },
      ] })));
}

/* ---------- trabalhe conosco ---------- */
function trabalhe() {
  title('Trabalhe conosco');
  const areas = [
    ['Artigos e guias', 'Escrever guias de decks, análises de metagame e textos para quem está começando.'],
    ['Revisão de arquétipos', 'Ajudar a classificar as listas nos arquétipos certos e manter as regras em dia quando o formato muda.'],
    ['Guias de confronto', 'Montar planos de jogo e sideboard para os decks mais jogados, como o guia do Azorius Chant.'],
    ['Desenvolvimento', 'Melhorar o site: páginas novas, gráficos, desempenho e acessibilidade.'],
    ['Redes sociais e vídeo', 'Levar os dados do metagame para Instagram, YouTube, TikTok e comunidades.'],
    ['Parcerias', 'Lojas, organizadores de torneio e criadores de conteúdo que queiram trabalhar junto.'],
  ];
  $main.replaceChildren(
    h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › Trabalhe conosco'), h('h1', null, 'Trabalhe conosco'),
      h('p', { class: 'lead' }, 'O Pac-Meta é um projeto de fã que está crescendo. Se você gosta de Magic competitivo e quer participar, conte o que sabe fazer. As condições de cada colaboração são combinadas diretamente por e-mail.')),
    h('div', { class: 'grid3' }, areas.map(([t, d]) => card(h('h3', null, t), h('p', { class: 'crumb', style: 'margin:0' }, d)))),
    h('div', { class: 'card prose' }, h('h2', null, 'Candidate-se'), P('Preencha o formulário. Ele abre um e-mail para ' + AUTOR + ' com suas respostas, e o retorno vem pelo e-mail que você informar.'),
      mailForm({ subject: (fd) => 'Trabalhe conosco: ' + (fd.get('area') || '') + ' · ' + (fd.get('nome') || ''), intro: 'Olá! Quero colaborar com o Pac-Meta.', sendLabel: 'Enviar candidatura',
        fields: [
          { k: 'nome', label: 'Nome', req: true, max: 80 },
          { k: 'email', label: 'E-mail', type: 'email', req: true, max: 120 },
          { k: 'cidade', label: 'Cidade e estado', max: 80 },
          { k: 'area', label: 'Área de interesse', type: 'select', req: true, opts: areas.map((a) => a[0]).concat('Outra') },
          { k: 'experiencia', label: 'Conte sua experiência com Magic e com a área escolhida', type: 'textarea', rows: 5, req: true },
          { k: 'links', label: 'Links (portfólio, GitHub, redes, artigos)', type: 'textarea', rows: 2 },
          { k: 'tempo', label: 'Quanto tempo por semana você teria?', type: 'select', opts: ['Até 2 horas', '2 a 5 horas', '5 a 10 horas', 'Mais de 10 horas'] },
        ] })));
}

/* ---------- roteador ---------- */
async function route() {
  const raw = location.hash.replace(/^#\/?/, ''); const [path, qs] = raw.split('?'); const p = path.split('/').map(decodeURIComponent); const params = new URLSearchParams(qs || '');
  tip.hidden = true;
  nav.querySelectorAll('a').forEach((a) => a.toggleAttribute('aria-current', (p[0] === 'f' && a.dataset.f === p[1]) || (p[0] === 'commander' && a.dataset.f === 'commander')));
  document.querySelectorAll('.sub a').forEach((a) => { const t = a.getAttribute('href').slice(2); a.toggleAttribute('aria-current', (t === '' && !p[0]) || (t && p[0] === t)); });
  $main.replaceChildren(h('p', { class: 'loading' }, 'Carregando…'));
  try {
    await loadFx();
    if (!p[0]) await home();
    else if (p[0] === 'f' && FNAME[p[1]]) { if (p[2] === 'a' && p[3]) await archetype(p[1], p[3]); else if (p[2] === 'torneios') await eventsPage(p[1]); else if (p[2] === '5-0') await ligas(p[1], params); else await metagame(p[1], params); }
    else if (p[0] === 'commander') { if (p[1] === 'deck' && p[2]) await commanderDeck(p[2]); else if (!p[1] || CMD_TABS.some(([k]) => k === p[1])) await commanderIndex(p[1]); else await commanderDeck(p[1]); }
    else if (p[0] === 'torneios') await eventsPage(null);
    else if (p[0] === '5-0') await ligas(null, params);
    else if (p[0] === 'e' && p[1]) await eventPage(p[1], p[2]);
    else if (p[0] === 'c' && p[1]) await cardPage(p[1]);
    else if (p[0] === 'precos') await precos();
    else if (p[0] === 'guias') { if (p[1] === 'chant') await guiaChant(p[2]); else if (p[1] && p[2]) await guiaDeck(p[1], p[2]); else await guiasIndex(); }
    else if (p[0] === 'artigos') { if (p[1] === 'enviar') enviarArtigo(); else if (p[1]) await artigoPage(p[1]); else await artigosIndex(); }
    else if (p[0] === 'sugestoes') sugestoes(); else if (p[0] === 'trabalhe') trabalhe();
    else if (p[0] === 'sobre') sobre(); else if (p[0] === 'privacidade') privacidade(); else if (p[0] === 'termos') termos();
    else fail('Página não encontrada.');
  } catch (e) { console.error(e); fail(); }
  if (document.activeElement !== q) $main.focus({ preventScroll: true });
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();
get('data/index.json').then((i) => { document.getElementById('upd').textContent = 'Dados atualizados em ' + new Date(i.updated.replace('Z', ':00Z')).toLocaleString('pt-BR') + '.'; }).catch(() => {});
