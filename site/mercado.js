'use strict';
/* Pac-Meta — mercado entre jogadores. Pagamento pelo Mercado Pago, direto para a conta do vendedor;
   o Pac-Meta fica com a comissão (supabase/functions/checkout). Só vendedores aprovados pelo admin anunciam.
   Usa app.js (h, card, $main, usd, CARDS...) e conta.js (sb, ME, PERFIL...). */
const COMISSAO_TXT = '3%';
const ESTADOS = { M: 'Nova (Mint)', NM: 'Quase nova (NM)', SP: 'Pouco jogada (SP)', MP: 'Jogada (MP)', HP: 'Muito jogada (HP)', D: 'Danificada' };
const IDIOMAS = { EN: 'Inglês', PT: 'Português', JP: 'Japonês', ES: 'Espanhol', IT: 'Italiano', DE: 'Alemão', FR: 'Francês', CN: 'Chinês', KO: 'Coreano', RU: 'Russo', Outro: 'Outro' };
const PSTATUS = { aguardando: ['Aguardando pagamento', 'gold'], pago: ['Pago', 'ok'], enviado: ['Enviado', 'ok'], entregue: ['Entregue', 'ok'], cancelado: ['Cancelado', 'bad'], reembolsado: ['Reembolsado', 'bad'] };
const ASTATUS = { ativo: ['Ativo', 'ok'], pausado: ['Pausado', ''], esgotado: ['Esgotado', 'gold'], removido: ['Removido pela moderação', 'bad'] };
const AN_COLS = 'id,vendedor,tipo,carta,deck_ref,titulo,descricao,edicao,estado,idioma,foil,preco,quantidade,envio,frete,retirada,status,criado_em,perfil:profiles(id,nome,cidade,avatar_url)';
const MPQ = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } })();
const reais = (v) => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const refBRL = (n) => { const c = (CARDS || {})[n]; return c && c.usd != null ? usd(c.usd) : null; };

async function chamar(fn, body) {
  const c = await sb(); const { data } = await c.auth.getSession();
  const r = await fetch(SB_URL + '/functions/v1/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + (data.session ? data.session.access_token : SB_KEY) }, body: JSON.stringify(body || {}) });
  let d = {}; try { d = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(d.erro || 'Não deu certo agora. Tente de novo.');
  return d;
}
function mercadoEmBreve() {
  title('Mercado');
  $main.replaceChildren(card(h('h1', null, 'Mercado entre jogadores'), h('p', { class: 'lead' }, 'Em breve: compre e venda cartas avulsas e decks com outros jogadores, com pagamento pelo Mercado Pago. Os vendedores são aprovados pela Pac Deck.')));
}
const mtabs = (cur) => h('nav', { class: 'seg cmdtabs', 'aria-label': 'Seções do mercado' }, [['cartas', 'Cartas', '#/mercado'], ['decks', 'Decks', '#/mercado/decks'], ['procuras', 'Pedidos de compra', '#/mercado/procuras'], ['vender', 'Vender', '#/mercado/vender'], ['pedidos', 'Minhas compras e vendas', '#/mercado/pedidos']].map(([k, t, href]) => h('a', { href, 'aria-current': k === cur ? 'page' : null }, t)));
const mhead = (cur, sub) => h('div', null, h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/mercado' }, 'Mercado'), sub ? ' › ' + sub : ''), h('h1', null, 'Mercado entre jogadores'),
  h('p', { class: 'lead' }, 'Cartas e decks de jogadores aprovados pela Pac Deck. O pagamento é pelo Mercado Pago, com Pix ou cartão, e o dinheiro vai direto para o vendedor.'));

function anuncioLinha(a) {
  const C = CARDS || {}; const ci = a.carta ? C[a.carta] : null; const ref = a.carta ? refBRL(a.carta) : null;
  return h('a', { class: 'card mlist', href: '#/mercado/a/' + a.id },
    ci && ci.img ? h('img', { src: ci.img, alt: '', loading: 'lazy', class: 'mthumb' }) : h('div', { class: 'mthumb ph' }, a.tipo === 'deck' ? 'Deck' : ''),
    h('div', { class: 'mbody' }, h('b', { class: 'ellip' }, a.titulo),
      h('small', { class: 'crumb' }, [a.tipo === 'carta' ? ESTADOS[a.estado] : 'Deck completo', a.tipo === 'carta' ? IDIOMAS[a.idioma] : null, a.foil ? 'Foil' : null, a.edicao || null].filter(Boolean).join(' · ')),
      h('small', { class: 'crumb' }, (a.perfil ? nomeDe(a.perfil) : 'Vendedor') + (a.perfil && a.perfil.cidade ? ' · ' + a.perfil.cidade : '') + ' · ' + [a.retirada ? 'retirada na Pac' : null, a.envio ? 'envio' : null].filter(Boolean).join(' ou '))),
    h('div', { class: 'mprice' }, h('b', null, reais(a.preco)), ref ? h('small', { class: 'crumb', title: 'Preço de referência do Scryfall convertido para real' }, 'ref. ' + ref) : null, a.status === 'esgotado' ? h('span', { class: 'tag gold' }, 'Esgotado') : h('small', { class: 'crumb' }, a.quantidade + ' disp.')));
}

/* ---------- vitrine ---------- */
async function mercadoIndex(tipo, params) {
  if (!CONTAS) return mercadoEmBreve();
  tipo = tipo === 'deck' ? 'deck' : 'carta'; title(tipo === 'deck' ? 'Decks à venda' : 'Cartas à venda');
  const [c] = await Promise.all([sb(), cards()]);
  let q = (params && params.get('q')) || '';
  const box = h('div', { class: 'mgrid' }); const st = h('p', { class: 'crumb', role: 'status' });
  async function load() {
    st.textContent = 'Carregando…';
    let qq = c.from('anuncios').select(AN_COLS).eq('status', 'ativo').eq('tipo', tipo).order('criado_em', { ascending: false }).limit(90);
    if (q) qq = tipo === 'carta' ? qq.ilike('carta', '%' + q.replace(/[%_,()]/g, ' ') + '%') : qq.ilike('titulo', '%' + q.replace(/[%_,()]/g, ' ') + '%');
    const { data, error } = await qq;
    st.textContent = error ? erroTxt(error) : (data.length ? data.length + (data.length > 1 ? ' anúncios' : ' anúncio') : (q ? 'Nada encontrado para "' + q + '".' : 'Ainda não há anúncios aqui.'));
    box.replaceChildren(...(data || []).map(anuncioLinha));
  }
  const busca = h('input', { type: 'search', value: q, placeholder: tipo === 'deck' ? 'Buscar deck ou comandante…' : 'Buscar carta pelo nome em inglês…', 'aria-label': 'Buscar no mercado', class: 'input mbusca' });
  let t; busca.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = busca.value.trim(); history.replaceState(null, '', '#/mercado' + (tipo === 'deck' ? '/decks' : '') + (q ? '?q=' + enc(q) : '')); load(); }, 300); });
  $main.replaceChildren(mhead(tipo === 'deck' ? 'decks' : 'cartas', tipo === 'deck' ? 'Decks' : null), mtabs(tipo === 'deck' ? 'decks' : 'cartas'), card(h('div', { class: 'row between' }, busca, st), h('div', { style: 'height:.8rem' }), box));
  load();
}

/* ---------- página do anúncio e compra ---------- */
async function anuncioPage(id) {
  if (!CONTAS) return mercadoEmBreve();
  const [c] = await Promise.all([sb(), cards()]);
  const { data: a } = await c.from('anuncios').select(AN_COLS).eq('id', id).maybeSingle();
  if (!a) return fail('Anúncio não encontrado ou fora do ar.');
  title(a.titulo + ' · Mercado');
  const { data: disp } = await c.rpc('disponivel', { a: a.id });
  const C = CARDS || {}; const ci = a.carta ? C[a.carta] : null; const ref = a.carta ? refBRL(a.carta) : null;
  const meu = ME && a.vendedor === ME.id;
  const st = h('p', { class: 'crumb', role: 'status' });
  const qtd = h('input', { class: 'input', type: 'number', min: 1, max: Math.max(1, disp || 1), value: 1, id: 'm-qtd', style: 'max-width:6rem' });
  const ent = h('div', { class: 'checks', role: 'radiogroup', 'aria-label': 'Entrega' },
    a.retirada ? h('label', null, h('input', { type: 'radio', name: 'ent', value: 'retirada', checked: true }), ' Retirar na Pac Deck (sem frete)') : null,
    a.envio ? h('label', null, h('input', { type: 'radio', name: 'ent', value: 'envio', checked: !a.retirada }), ' Envio pelo vendedor (' + (Number(a.frete) ? 'frete ' + reais(a.frete) : 'frete grátis') + ')') : null);
  const end = {}; const fld = (k, label, attrs) => { end[k] = h('input', { class: 'input', id: 'e-' + k, autocomplete: (attrs || {}).ac || 'off', maxlength: (attrs || {}).max || 120, inputmode: (attrs || {}).im || null }); return h('div', { class: 'fld' }, h('label', { for: 'e-' + k }, label), end[k]); };
  const endBox = h('div', { class: 'endgrid', hidden: true }, fld('nome', 'Nome de quem recebe', { ac: 'name', max: 80 }), fld('cep', 'CEP', { ac: 'postal-code', max: 9, im: 'numeric' }), fld('rua', 'Rua', { ac: 'address-line1' }), fld('numero', 'Número', { max: 12 }), fld('complemento', 'Complemento', { ac: 'address-line2', max: 60 }), fld('bairro', 'Bairro', { max: 60 }), fld('cidade', 'Cidade', { ac: 'address-level2', max: 60 }), fld('uf', 'UF', { ac: 'address-level1', max: 2 }), fld('telefone', 'Telefone', { ac: 'tel', max: 20, im: 'tel' }));
  const totalEl = h('b', { class: 'mtotal' });
  const entrega = () => (ent.querySelector('input:checked') || {}).value || 'retirada';
  function recalc() { const n = Math.max(1, Math.min(Number(qtd.value) || 1, disp || 1)); const fr = entrega() === 'envio' ? Number(a.frete) : 0; totalEl.textContent = reais(n * Number(a.preco) + fr); endBox.hidden = entrega() !== 'envio'; }
  qtd.addEventListener('input', recalc); ent.addEventListener('change', recalc); recalc();
  const comprar = h('button', { class: 'btn pri big', type: 'button', disabled: !disp || meu || null, onclick: async () => {
    if (!ME) { sessionStorageSet('volta', location.hash); location.hash = '#/entrar'; return; }
    comprar.disabled = true; st.textContent = 'Abrindo o pagamento…';
    try {
      const body = { anuncio: a.id, quantidade: Number(qtd.value) || 1, entrega: entrega() };
      if (body.entrega === 'envio') body.endereco = Object.fromEntries(Object.entries(end).map(([k, el]) => [k, el.value]));
      const d = await chamar('checkout', body);
      location.href = d.url;
    } catch (e) { st.textContent = e.message; comprar.disabled = false; }
  } }, meu ? 'Este anúncio é seu' : (disp ? 'Pagar com Mercado Pago' : 'Esgotado'));
  $main.replaceChildren(
    mhead(a.tipo === 'deck' ? 'decks' : 'cartas', a.titulo),
    h('div', { class: 'split' },
      h('div', { style: 'display:grid;gap:1.2rem' },
        card(h('h2', null, a.titulo),
          h('div', { class: 'tags' }, a.tipo === 'carta' ? h('span', { class: 'tag' }, ESTADOS[a.estado]) : h('span', { class: 'tag' }, 'Deck completo'), a.tipo === 'carta' ? h('span', { class: 'tag' }, IDIOMAS[a.idioma]) : null, a.foil ? h('span', { class: 'tag gold' }, 'Foil') : null, a.edicao ? h('span', { class: 'tag' }, a.edicao) : null),
          h('div', { class: 'pricebox', style: 'margin-top:1rem' }, h('div', null, h('small', null, 'Preço do vendedor'), h('b', null, reais(a.preco))), ref ? h('div', null, h('small', null, 'Referência (Scryfall)'), h('b', null, ref)) : h('div', null, h('small', null, 'Disponível'), h('b', null, disp || 0))),
          a.descricao ? h('p', { class: 'prose', style: 'white-space:pre-line' }, a.descricao) : null,
          h('p', { class: 'crumb' }, a.carta ? h('a', { href: '#/c/' + enc(a.carta) }, 'Ver a carta no Pac-Meta') : null, a.deck_ref ? h('a', { href: '#/commander/deck/' + a.deck_ref }, 'Ver a lista do deck') : null)),
        card(h('h2', null, 'Comprar'),
          meu ? h('p', { class: 'notice' }, 'Este é o seu anúncio. ', h('a', { href: '#/mercado/editar/' + a.id }, 'Editar')) : null,
          h('div', { class: 'form' },
            h('div', { class: 'fld' }, h('label', { for: 'm-qtd' }, 'Quantidade (' + (disp || 0) + ' disponível)'), qtd),
            h('fieldset', { class: 'fld' }, h('legend', null, 'Entrega'), ent), endBox,
            h('div', { class: 'row between' }, h('span', null, 'Total: ', totalEl), comprar), st,
            h('p', { class: 'crumb' }, 'Você paga na página do Mercado Pago, com Pix ou cartão. O valor vai para o vendedor, que tem 3 dias úteis para enviar ou deixar a carta na Pac Deck. Se o pedido não chegar, você abre uma reclamação no próprio Mercado Pago. ', h('a', { href: '#/termos' }, 'Regras do mercado'), '.')))),
      card(h('h3', null, 'Vendedor'), h('div', { class: 'row' }, avatar(a.perfil, 40), h('div', null, h('a', { href: '#/mercado/vendedor/' + a.vendedor }, h('b', null, nomeDe(a.perfil))), h('br'), h('small', { class: 'crumb' }, a.perfil && a.perfil.cidade || ''))),
        ci && ci.img ? h('img', { class: 'cardimg', src: ci.img, alt: 'Imagem da carta ' + a.carta, loading: 'lazy', style: 'margin-top:1rem' }) : null)));
}

/* ---------- vender ---------- */
async function venderPage(params) {
  if (!CONTAS) return mercadoEmBreve();
  title('Vender'); const c = await sb(); await cards();
  if (!ME) { $main.replaceChildren(mhead('vender', 'Vender'), mtabs('vender'), card(h('h2', null, 'Vender no Pac-Meta'), P('Para vender, entre na sua conta e peça aprovação. Os vendedores são aprovados pela Pac Deck.'), precisaLogin())); return; }
  const v = PERFIL.vendedor || 'nenhum'; const st = h('p', { class: 'crumb', role: 'status' });
  const retorno = MPQ.get('mp'); const aviso = { ligado: 'Mercado Pago ligado! Agora você já pode anunciar.', cancelado: 'A ligação com o Mercado Pago foi cancelada.', expirou: 'O link expirou. Tente ligar de novo.', erro: 'Não deu para ligar o Mercado Pago. Tente de novo.' }[retorno];
  const blocos = [mhead('vender', 'Vender'), mtabs('vender'), aviso ? h('p', { class: 'notice' }, aviso) : null];
  if (v === 'nenhum' || v === 'recusado') {
    const msg = h('textarea', { rows: 4, maxlength: 500, id: 'v-msg', placeholder: 'Ex.: jogo o Bhell às quintas, quero vender cartas avulsas de Commander.' });
    const cidade = h('input', { class: 'input', id: 'v-cidade', maxlength: 60, value: PERFIL.cidade || '' });
    blocos.push(card(h('h2', null, 'Quero vender'), v === 'recusado' ? h('p', { class: 'notice' }, 'Seu pedido anterior não foi aprovado. Você pode mandar um novo com mais detalhes.') : null,
      P('Só vendem no Pac-Meta jogadores aprovados pela Pac Deck. Conte quem você é e o que pretende vender. Depois de aprovado, você liga a sua conta do Mercado Pago, que é onde recebe o dinheiro das vendas.'),
      h('form', { class: 'form', onsubmit: async (e) => { e.preventDefault(); if (msg.value.trim().length < 10) { st.textContent = 'Conte um pouco mais sobre você.'; return; }
        const { error } = await c.from('profiles').update({ vendedor: 'pedido', vendedor_msg: msg.value.trim(), cidade: cidade.value.trim() }).eq('id', ME.id);
        if (error) { st.textContent = erroTxt(error); return; } PERFIL.vendedor = 'pedido'; venderPage(params); } },
        h('div', { class: 'fld' }, h('label', { for: 'v-cidade' }, 'Cidade'), cidade), h('div', { class: 'fld' }, h('label', { for: 'v-msg' }, 'Sobre você e o que quer vender'), msg),
        h('p', { class: 'crumb' }, 'Ao pedir, você concorda com as ', h('a', { href: '#/termos', target: '_blank' }, 'regras do mercado'), ', incluindo a comissão de ' + COMISSAO_TXT + ' do Pac-Meta sobre cada venda.'),
        h('div', { class: 'row' }, h('button', { class: 'btn pri' }, 'Pedir para vender')), st)));
  } else if (v === 'pedido') {
    blocos.push(card(h('h2', null, 'Pedido em análise'), P('Seu pedido para vender foi enviado. Assim que for aprovado, esta página mostra o próximo passo: ligar a sua conta do Mercado Pago.')));
  } else if (v === 'bloqueado') {
    blocos.push(card(h('h2', null, 'Vendas bloqueadas'), P('Sua conta não pode vender no momento. Para saber mais, escreva para ', mail(), '.')));
  } else {
    const { data: ligado } = await c.rpc('mp_ligado');
    if (!ligado) {
      const b = h('button', { class: 'btn pri', onclick: async () => { b.disabled = true; try { const d = await chamar('mp-conectar'); location.href = d.url; } catch (e) { st.textContent = e.message; b.disabled = false; } } }, 'Ligar minha conta do Mercado Pago');
      blocos.push(card(h('h2', null, 'Ligue o Mercado Pago'), P('Você foi aprovado para vender. Falta ligar a sua conta do Mercado Pago: é nela que o dinheiro das vendas cai, já com a comissão de ' + COMISSAO_TXT + ' do Pac-Meta e a taxa do Mercado Pago descontadas.'), h('div', { class: 'row' }, b), st));
    } else {
      const { data: meus } = await c.from('anuncios').select(AN_COLS).eq('vendedor', ME.id).order('criado_em', { ascending: false });
      blocos.push(card(h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, 'Meus anúncios'), h('a', { class: 'btn pri', href: '#/mercado/novo' + (params && params.get('carta') ? '?carta=' + enc(params.get('carta')) : '') }, 'Novo anúncio')),
        (meus || []).length ? h('div', { class: 'tbox' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Anúncio'), h('th', { class: 'n' }, 'Preço'), h('th', { class: 'n' }, 'Qtd'), h('th', null, 'Status'), h('th', null, ''))),
          h('tbody', null, meus.map((a) => h('tr', null, h('td', { class: 'nm' }, h('a', { href: '#/mercado/a/' + a.id }, a.titulo)), h('td', { class: 'n' }, reais(a.preco)), h('td', { class: 'n' }, a.quantidade),
            h('td', null, h('span', { class: 'tag ' + ASTATUS[a.status][1] }, ASTATUS[a.status][0])),
            h('td', { class: 'row' }, a.status !== 'removido' ? h('a', { class: 'btn', href: '#/mercado/editar/' + a.id }, 'Editar') : null,
              a.status === 'ativo' || a.status === 'pausado' ? h('button', { class: 'btn', onclick: async () => { const { error } = await c.from('anuncios').update({ status: a.status === 'ativo' ? 'pausado' : 'ativo' }).eq('id', a.id); if (error) alertTxt(error); else venderPage(params); } }, a.status === 'ativo' ? 'Pausar' : 'Reativar') : null))))))
          : P('Você ainda não tem anúncios. ', h('a', { href: '#/mercado/novo' }, 'Criar o primeiro'), '.'),
        h('p', { class: 'crumb' }, 'Cada venda cai na sua conta do Mercado Pago, com a taxa do Mercado Pago e a comissão de ' + COMISSAO_TXT + ' do Pac-Meta já descontadas. Você tem 3 dias úteis para enviar ou deixar a carta na Pac Deck.')));
    }
  }
  $main.replaceChildren(...blocos.filter(Boolean));
}
function alertTxt(e) { const s = document.querySelector('[role=status]'); if (s) s.textContent = erroTxt(e); }

async function anuncioForm(id, params) {
  if (!CONTAS) return mercadoEmBreve();
  const [c] = await Promise.all([sb(), cards()]);
  if (!ME) { location.hash = '#/mercado/vender'; return; }
  let a = { tipo: 'carta', carta: (params && params.get('carta')) || '', deck_ref: '', titulo: '', descricao: '', edicao: '', estado: 'NM', idioma: 'EN', foil: false, preco: '', quantidade: 1, envio: true, frete: 0, retirada: true };
  if (id) { const { data } = await c.from('anuncios').select('*').eq('id', id).maybeSingle(); if (!data || (data.vendedor !== ME.id && !isAdmin())) return fail('Anúncio não encontrado.'); a = data; }
  title(id ? 'Editar anúncio' : 'Novo anúncio');
  const C = CARDS || {}; const st = h('p', { class: 'crumb', role: 'status' });
  const dl = h('datalist', { id: 'cartas-dl' }, Object.keys(C).slice(0, 5000).map((n) => h('option', { value: n })));
  const decksIx = await get('data/commander/index.json').catch(() => ({ decks: [] }));
  const el = {
    tipo: h('select', { id: 'f-tipo' }, [['carta', 'Carta avulsa'], ['deck', 'Deck completo']].map(([k, t]) => h('option', { value: k, selected: a.tipo === k }, t))),
    carta: h('input', { class: 'input', id: 'f-carta', list: 'cartas-dl', value: a.carta || '', maxlength: 160, placeholder: 'Nome em inglês, ex.: Sol Ring' }),
    deck_ref: h('select', { id: 'f-deck' }, h('option', { value: '' }, 'Nenhum (descrevo a lista abaixo)'), decksIx.decks.map((d) => h('option', { value: d.slug, selected: a.deck_ref === d.slug }, d.nome + (d.jogador ? ' · ' + d.jogador : '')))),
    titulo: h('input', { class: 'input', id: 'f-titulo', value: a.titulo || '', maxlength: 120 }),
    edicao: h('input', { class: 'input', id: 'f-edicao', value: a.edicao || '', maxlength: 60, placeholder: 'Ex.: Commander Masters' }),
    estado: h('select', { id: 'f-estado' }, Object.entries(ESTADOS).map(([k, t]) => h('option', { value: k, selected: a.estado === k }, t))),
    idioma: h('select', { id: 'f-idioma' }, Object.entries(IDIOMAS).map(([k, t]) => h('option', { value: k, selected: a.idioma === k }, t))),
    foil: h('input', { type: 'checkbox', id: 'f-foil', checked: !!a.foil }),
    preco: h('input', { class: 'input', id: 'f-preco', type: 'number', min: 1, step: '0.01', value: a.preco || '', inputmode: 'decimal' }),
    quantidade: h('input', { class: 'input', id: 'f-qtd', type: 'number', min: 0, max: 999, value: a.quantidade }),
    envio: h('input', { type: 'checkbox', id: 'f-envio', checked: !!a.envio }),
    frete: h('input', { class: 'input', id: 'f-frete', type: 'number', min: 0, step: '0.01', value: a.frete || 0, inputmode: 'decimal' }),
    retirada: h('input', { type: 'checkbox', id: 'f-retirada', checked: !!a.retirada }),
    descricao: h('textarea', { id: 'f-desc', rows: 4, maxlength: 2000 }),
  };
  el.descricao.value = a.descricao || '';
  const ref = h('small', { class: 'help' });
  const recebe = h('small', { class: 'help' });
  const cartaFld = h('div', { class: 'fld' }, h('label', { for: 'f-carta' }, 'Carta'), el.carta, ref, dl);
  const deckFld = h('div', { class: 'fld' }, h('label', { for: 'f-deck' }, 'Lista no Pac-Meta (opcional)'), el.deck_ref);
  const cartaOpts = [h('div', { class: 'fld' }, h('label', { for: 'f-edicao' }, 'Edição (opcional)'), el.edicao), h('div', { class: 'fld' }, h('label', { for: 'f-estado' }, 'Estado'), el.estado), h('div', { class: 'fld' }, h('label', { for: 'f-idioma' }, 'Idioma'), el.idioma), h('label', { class: 'chk' }, el.foil, ' Foil')];
  function upd() {
    const deck = el.tipo.value === 'deck'; cartaFld.hidden = deck; deckFld.hidden = !deck; cartaOpts.forEach((x) => { x.hidden = deck; });
    const n = el.carta.value.trim(); const r = C[n] ? refBRL(n) : null;
    ref.textContent = deck ? '' : (C[n] ? (r ? 'Referência do Scryfall: ' + r + '. ' : '') : (n ? 'Carta não encontrada nas listas do Pac-Meta; confira o nome em inglês.' : ''));
    if (!deck && !el.titulo.dataset.mexeu) el.titulo.value = n;
    if (deck && !el.titulo.dataset.mexeu && el.deck_ref.value) { const d = decksIx.decks.find((x) => x.slug === el.deck_ref.value); if (d) el.titulo.value = 'Deck ' + d.nome; }
    const p = Number(el.preco.value) || 0; recebe.textContent = p ? 'Você recebe cerca de ' + reais(p * 0.97) + ' por unidade, menos a taxa do Mercado Pago.' : '';
    el.frete.disabled = !el.envio.checked;
  }
  el.titulo.addEventListener('input', () => { el.titulo.dataset.mexeu = '1'; });
  ['tipo', 'carta', 'deck_ref', 'preco', 'envio'].forEach((k) => el[k].addEventListener(k === 'tipo' || k === 'deck_ref' || k === 'envio' ? 'change' : 'input', upd)); upd();
  const salvar = async (e) => {
    e.preventDefault(); const deck = el.tipo.value === 'deck';
    const row = { tipo: el.tipo.value, carta: deck ? null : el.carta.value.trim(), deck_ref: deck ? (el.deck_ref.value || null) : null, titulo: el.titulo.value.trim(), edicao: deck ? '' : el.edicao.value.trim(),
      estado: el.estado.value, idioma: el.idioma.value, foil: !deck && el.foil.checked, preco: Number(el.preco.value), quantidade: Math.floor(Number(el.quantidade.value)), envio: el.envio.checked, frete: el.envio.checked ? Number(el.frete.value) || 0 : 0, retirada: el.retirada.checked, descricao: el.descricao.value.trim() };
    if (!deck && !row.carta) { st.textContent = 'Informe a carta.'; el.carta.focus(); return; }
    if (row.titulo.length < 3) { st.textContent = 'Dê um título ao anúncio.'; el.titulo.focus(); return; }
    if (!(row.preco >= 1)) { st.textContent = 'O preço mínimo é R$ 1,00.'; el.preco.focus(); return; }
    if (!row.envio && !row.retirada) { st.textContent = 'Escolha pelo menos uma forma de entrega.'; return; }
    const { data, error } = id ? await c.from('anuncios').update(row).eq('id', id).select('id').single() : await c.from('anuncios').insert({ ...row, vendedor: ME.id }).select('id').single();
    if (error) { st.textContent = erroTxt(error); return; }
    location.hash = '#/mercado/a/' + data.id;
  };
  $main.replaceChildren(mhead('vender', id ? 'Editar anúncio' : 'Novo anúncio'),
    card(h('h2', null, id ? 'Editar anúncio' : 'Novo anúncio'),
      h('form', { class: 'form', onsubmit: salvar, novalidate: true },
        h('div', { class: 'fld' }, h('label', { for: 'f-tipo' }, 'O que você vai vender'), el.tipo), cartaFld, deckFld,
        h('div', { class: 'fld' }, h('label', { for: 'f-titulo' }, 'Título do anúncio'), el.titulo), ...cartaOpts,
        h('div', { class: 'endgrid' }, h('div', { class: 'fld' }, h('label', { for: 'f-preco' }, 'Preço por unidade (R$)'), el.preco, recebe), h('div', { class: 'fld' }, h('label', { for: 'f-qtd' }, 'Quantidade'), el.quantidade)),
        h('fieldset', { class: 'fld' }, h('legend', null, 'Entrega'), h('label', { class: 'chk' }, el.retirada, ' Retirada na Pac Deck'), h('label', { class: 'chk' }, el.envio, ' Envio pelo correio'), h('div', { class: 'fld' }, h('label', { for: 'f-frete' }, 'Frete cobrado (R$, 0 para grátis)'), el.frete)),
        h('div', { class: 'fld' }, h('label', { for: 'f-desc' }, 'Descrição (estado detalhado, o que vem junto, lista do deck…)'), el.descricao),
        h('p', { class: 'crumb' }, 'Anuncie só cartas originais que você tem em mãos. Cartas falsas ou "proxy" são proibidas e levam ao bloqueio da conta.'),
        h('div', { class: 'row' }, h('button', { class: 'btn pri' }, id ? 'Salvar' : 'Publicar anúncio'), h('a', { class: 'btn', href: '#/mercado/vender' }, 'Cancelar')), st)));
}

/* ---------- minhas compras e vendas ---------- */
async function pedidosPage(params) {
  if (!CONTAS) return mercadoEmBreve();
  title('Minhas compras e vendas'); const c = await sb();
  if (!ME) { $main.replaceChildren(mhead('pedidos', 'Pedidos'), mtabs('pedidos'), card(precisaLogin('Entre para ver suas compras e vendas.'))); return; }
  const cols = 'id,anuncio,titulo,quantidade,preco_unit,frete,total,comissao,entrega,endereco,status,rastreio,criado_em,pago_em,comprador,vendedor,cp:profiles!pedidos_comprador_fkey(id,nome,cidade),vd:profiles!pedidos_vendedor_fkey(id,nome,cidade)';
  const [{ data: compras }, { data: vendas }] = await Promise.all([
    c.from('pedidos').select(cols).eq('comprador', ME.id).neq('status', 'aguardando').order('criado_em', { ascending: false }).limit(100),
    c.from('pedidos').select(cols).eq('vendedor', ME.id).neq('status', 'aguardando').order('criado_em', { ascending: false }).limit(100)]);
  const pid = Number(MPQ.get('pedido') || (params && params.get('pago')));
  let aviso = null;
  if (MPQ.get('mp') === 'retorno' && pid) {
    const { data: p } = await c.from('pedidos').select('status').eq('id', pid).maybeSingle();
    aviso = p && p.status === 'pago' ? 'Pagamento aprovado! O vendedor já foi avisado e tem 3 dias úteis para enviar ou deixar na Pac Deck.' : 'Recebemos o seu retorno do Mercado Pago. Se você pagou com Pix ou boleto, a confirmação pode levar alguns minutos e o pedido aparece aqui assim que for aprovado.';
  }
  const st = h('p', { class: 'crumb', role: 'status' });
  const mudar = async (p, row) => { const { error } = await c.from('pedidos').update(row).eq('id', p.id); if (error) st.textContent = erroTxt(error); else pedidosPage(params); };
  const linha = (p, lado) => {
    const s = PSTATUS[p.status]; const outro = lado === 'compra' ? p.vd : p.cp;
    const acoes = [];
    if (lado === 'venda' && p.status === 'pago') {
      const ras = h('input', { class: 'input', placeholder: p.entrega === 'envio' ? 'Código de rastreio' : 'Observação (opcional)', maxlength: 60, style: 'max-width:12rem' });
      acoes.push(ras, h('button', { class: 'btn pri', onclick: () => mudar(p, { status: 'enviado', rastreio: ras.value.trim() }) }, p.entrega === 'envio' ? 'Marcar como enviado' : 'Deixei na Pac Deck'));
    }
    if (lado === 'compra' && (p.status === 'pago' || p.status === 'enviado')) acoes.push(h('button', { class: 'btn pri', onclick: () => mudar(p, { status: 'entregue' }) }, 'Confirmar que recebi'));
    const e = p.endereco;
    return h('div', { class: 'card pedido' },
      h('div', { class: 'row between' }, h('b', null, p.quantidade + '× ' + p.titulo), h('span', { class: 'tag ' + s[1] }, s[0])),
      h('small', { class: 'crumb' }, 'Pedido #' + p.id + ' · ' + new Date(p.criado_em).toLocaleDateString('pt-BR') + ' · ' + (lado === 'compra' ? 'vendedor ' : 'comprador ') + nomeDe(outro) + ' · ' + (p.entrega === 'envio' ? 'envio' : 'retirada na Pac Deck')),
      h('div', { class: 'row' }, h('span', null, 'Total ', h('b', null, reais(p.total))), lado === 'venda' ? h('small', { class: 'crumb' }, 'comissão Pac-Meta ' + reais(p.comissao) + ' · taxa do Mercado Pago à parte') : null, p.rastreio ? h('small', { class: 'crumb' }, 'Rastreio/obs.: ' + p.rastreio) : null),
      lado === 'venda' && e ? h('small', { class: 'crumb' }, 'Enviar para: ' + [e.nome, e.rua + ', ' + e.numero + (e.complemento ? ' ' + e.complemento : ''), e.bairro, e.cidade + '/' + e.uf, 'CEP ' + e.cep, e.telefone].filter(Boolean).join(' · ')) : null,
      acoes.length ? h('div', { class: 'row' }, ...acoes) : null);
  };
  $main.replaceChildren(mhead('pedidos', 'Pedidos'), mtabs('pedidos'), aviso ? h('p', { class: 'notice' }, aviso) : '', st,
    h('div', { class: 'grid2' },
      card(h('h2', null, 'Compras'), (compras || []).length ? h('div', { class: 'pedidos' }, compras.map((p) => linha(p, 'compra'))) : P('Nenhuma compra ainda. ', h('a', { href: '#/mercado' }, 'Ver o mercado'), '.')),
      card(h('h2', null, 'Vendas'), (vendas || []).length ? h('div', { class: 'pedidos' }, vendas.map((p) => linha(p, 'venda'))) : P(PERFIL.vendedor === 'aprovado' ? 'Nenhuma venda ainda.' : 'Para vender, peça aprovação em ', PERFIL.vendedor === 'aprovado' ? null : h('a', { href: '#/mercado/vender' }, 'Vender'), PERFIL.vendedor === 'aprovado' ? null : '.'))),
    h('p', { class: 'crumb' }, 'Problema com um pedido? Primeiro fale com a outra parte. Se não resolver, abra uma reclamação no Mercado Pago (que cuida de estornos) ou escreva para ', mail(), '.'));
}

/* ---------- pedidos de compra ---------- */
async function procurasPage() {
  if (!CONTAS) return mercadoEmBreve();
  title('Pedidos de compra'); const [c] = await Promise.all([sb(), cards()]);
  const { data } = await c.from('procuras').select('id,usuario,carta,quantidade,preco_max,obs,status,criado_em,perfil:profiles(id,nome,cidade)').eq('status', 'aberto').order('criado_em', { ascending: false }).limit(150);
  const st = h('p', { class: 'crumb', role: 'status' });
  let form;
  if (!ME) form = precisaLogin('Entre para anunciar que procura uma carta.');
  else {
    const carta = h('input', { class: 'input', id: 'pr-carta', list: 'cartas-dl2', maxlength: 160, placeholder: 'Nome em inglês' });
    const qtd = h('input', { class: 'input', id: 'pr-qtd', type: 'number', min: 1, max: 99, value: 1 });
    const pmax = h('input', { class: 'input', id: 'pr-max', type: 'number', min: 1, step: '0.01', placeholder: 'Opcional' });
    const obs = h('input', { class: 'input', id: 'pr-obs', maxlength: 300, placeholder: 'Ex.: só em inglês, aceito SP' });
    form = h('form', { class: 'form', onsubmit: async (e) => { e.preventDefault(); if (carta.value.trim().length < 2) { st.textContent = 'Informe a carta.'; return; }
      const { error } = await c.from('procuras').insert({ usuario: ME.id, carta: carta.value.trim(), quantidade: Number(qtd.value) || 1, preco_max: Number(pmax.value) || null, obs: obs.value.trim() });
      if (error) st.textContent = erroTxt(error); else procurasPage(); } },
      h('datalist', { id: 'cartas-dl2' }, Object.keys(CARDS || {}).slice(0, 5000).map((n) => h('option', { value: n }))),
      h('div', { class: 'endgrid' }, h('div', { class: 'fld' }, h('label', { for: 'pr-carta' }, 'Carta que você procura'), carta), h('div', { class: 'fld' }, h('label', { for: 'pr-qtd' }, 'Quantidade'), qtd), h('div', { class: 'fld' }, h('label', { for: 'pr-max' }, 'Pago até (R$ por unidade)'), pmax)),
      h('div', { class: 'fld' }, h('label', { for: 'pr-obs' }, 'Observação'), obs), h('div', { class: 'row' }, h('button', { class: 'btn pri' }, 'Publicar pedido')), st);
  }
  const vend = ME && PERFIL && PERFIL.vendedor === 'aprovado';
  $main.replaceChildren(mhead('procuras', 'Pedidos de compra'), mtabs('procuras'),
    card(h('h2', null, 'Procuro esta carta'), h('p', { class: 'crumb' }, 'Anuncie o que você procura. Vendedores aprovados veem a lista e podem criar o anúncio para você comprar.'), form),
    card(h('h2', null, 'Pedidos abertos'), (data || []).length ? h('div', { class: 'tbox' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Carta'), h('th', { class: 'n' }, 'Qtd'), h('th', { class: 'n' }, 'Paga até'), h('th', { class: 'hide-sm' }, 'Quem procura'), h('th', null, ''))),
      h('tbody', null, data.map((p) => h('tr', null, h('td', { class: 'nm' }, (CARDS || {})[p.carta] ? cardLink(p.carta) : p.carta, p.obs ? h('br') : null, p.obs ? h('small', { class: 'crumb' }, p.obs) : null), h('td', { class: 'n' }, p.quantidade), h('td', { class: 'n' }, p.preco_max ? reais(p.preco_max) : '—'),
        h('td', { class: 'hide-sm' }, nomeDe(p.perfil) + (p.perfil && p.perfil.cidade ? ' · ' + p.perfil.cidade : '')),
        h('td', null, ME && p.usuario === ME.id ? h('button', { class: 'btn', onclick: async () => { const { error } = await c.from('procuras').update({ status: 'fechado' }).eq('id', p.id); if (error) st.textContent = erroTxt(error); else procurasPage(); } }, 'Encerrar')
          : vend ? h('a', { class: 'btn', href: '#/mercado/novo?carta=' + enc(p.carta) }, 'Tenho, anunciar') : null)))))) : P('Nenhum pedido aberto.')));
}

/* ---------- vendedor ---------- */
async function vendedorPage(id) {
  if (!CONTAS) return mercadoEmBreve();
  const [c] = await Promise.all([sb(), cards()]);
  const [{ data: p }, { data: ads }] = await Promise.all([c.from('profiles').select('id,nome,cidade,bio,avatar_url,criado_em,vendedor').eq('id', id).maybeSingle(), c.from('anuncios').select(AN_COLS).eq('vendedor', id).eq('status', 'ativo').order('criado_em', { ascending: false }).limit(90)]);
  if (!p) return fail('Vendedor não encontrado.');
  title(nomeDe(p) + ' · Mercado');
  $main.replaceChildren(mhead('cartas', nomeDe(p)),
    h('div', { class: 'card author' }, avatar(p, 64), h('div', null, h('h2', { style: 'margin:0' }, nomeDe(p)), h('p', { class: 'crumb', style: 'margin:.2rem 0' }, [p.cidade, 'no Pac-Meta desde ' + new Date(p.criado_em).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), p.vendedor === 'aprovado' ? 'vendedor aprovado pela Pac Deck' : null].filter(Boolean).join(' · ')), p.bio ? h('p', { style: 'margin:.3rem 0 0' }, p.bio) : null)),
    card(h('h2', null, 'Anúncios'), (ads || []).length ? h('div', { class: 'mgrid' }, ads.map(anuncioLinha)) : P('Nenhum anúncio ativo.')));
}

/* ---------- na página de cada carta ---------- */
async function anunciosDaCarta(n) {
  if (!CONTAS) return null;
  const c = await sb(); if (!c) return null;
  const { data } = await c.from('anuncios').select(AN_COLS).eq('status', 'ativo').eq('tipo', 'carta').eq('carta', n).order('preco').limit(20);
  const vend = ME && PERFIL && PERFIL.vendedor === 'aprovado';
  return card(h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, 'À venda por jogadores'), h('a', { class: 'btn', href: vend ? '#/mercado/novo?carta=' + enc(n) : '#/mercado/vender' }, 'Vender esta carta')),
    (data || []).length ? h('div', { class: 'mgrid', style: 'margin-top:.8rem' }, data.map(anuncioLinha)) : h('p', { class: 'crumb' }, 'Nenhum jogador está vendendo esta carta agora. ', h('a', { href: '#/mercado/procuras' }, 'Anuncie que você procura'), '.'));
}

/* ---------- painel do admin ---------- */
async function adminPage() {
  title('Painel do admin'); const c = await sb(); if (!c) return semContas();
  if (!isAdmin()) return fail('Esta área é só para a administração do site.');
  const [{ data: pedidosV }, { data: vendedores }, { data: ads }, { data: peds }] = await Promise.all([
    c.from('profiles').select('id,nome,cidade,vendedor_msg,criado_em').eq('vendedor', 'pedido').order('criado_em'),
    c.from('profiles').select('id,nome,cidade,vendedor').in('vendedor', ['aprovado', 'bloqueado']).order('nome'),
    c.from('anuncios').select(AN_COLS).order('criado_em', { ascending: false }).limit(60),
    c.from('pedidos').select('id,titulo,quantidade,total,comissao,status,entrega,criado_em,cp:profiles!pedidos_comprador_fkey(nome),vd:profiles!pedidos_vendedor_fkey(nome)').neq('status', 'aguardando').order('criado_em', { ascending: false }).limit(60)]);
  const st = h('p', { class: 'crumb', role: 'status' });
  const setV = async (id, v) => { const { error } = await c.from('profiles').update({ vendedor: v }).eq('id', id); if (error) st.textContent = erroTxt(error); else adminPage(); };
  const comTotal = (peds || []).filter((p) => ['pago', 'enviado', 'entregue'].includes(p.status)).reduce((s, p) => s + Number(p.comissao), 0);
  $main.replaceChildren(h('h1', null, 'Painel do admin'), st,
    h('div', { class: 'statrow' },
      h('div', { class: 'card stat-c' }, h('small', null, 'Pedidos para vender'), h('b', null, (pedidosV || []).length)),
      h('div', { class: 'card stat-c' }, h('small', null, 'Vendedores aprovados'), h('b', null, (vendedores || []).filter((v) => v.vendedor === 'aprovado').length)),
      h('div', { class: 'card stat-c' }, h('small', null, 'Comissões (últimos 60 pedidos)'), h('b', null, reais(comTotal)))),
    card(h('h2', null, 'Pedidos para vender'), (pedidosV || []).length ? h('div', { class: 'pedidos' }, pedidosV.map((p) => h('div', { class: 'card pedido' }, h('b', null, nomeDe(p)), h('small', { class: 'crumb' }, (p.cidade || 'cidade não informada') + ' · pediu em ' + new Date(p.criado_em).toLocaleDateString('pt-BR')), h('p', { style: 'white-space:pre-line;margin:.3rem 0' }, p.vendedor_msg),
      h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: () => setV(p.id, 'aprovado') }, 'Aprovar'), h('button', { class: 'btn', onclick: () => setV(p.id, 'recusado') }, 'Recusar'))))) : P('Nenhum pedido novo.')),
    card(h('h2', null, 'Vendedores'), (vendedores || []).length ? h('div', { class: 'tbox' }, h('table', { class: 't' }, h('tbody', null, vendedores.map((v) => h('tr', null, h('td', { class: 'nm' }, h('a', { href: '#/mercado/vendedor/' + v.id }, nomeDe(v))), h('td', null, v.cidade), h('td', null, h('span', { class: 'tag ' + (v.vendedor === 'aprovado' ? 'ok' : 'bad') }, v.vendedor === 'aprovado' ? 'Aprovado' : 'Bloqueado')),
      h('td', null, h('button', { class: 'btn', onclick: () => setV(v.id, v.vendedor === 'aprovado' ? 'bloqueado' : 'aprovado') }, v.vendedor === 'aprovado' ? 'Bloquear' : 'Desbloquear'))))))) : P('Nenhum vendedor ainda.')),
    card(h('h2', null, 'Anúncios recentes'), (ads || []).length ? h('div', { class: 'tbox' }, h('table', { class: 't' }, h('tbody', null, ads.map((a) => h('tr', null, h('td', { class: 'nm' }, h('a', { href: '#/mercado/a/' + a.id }, a.titulo)), h('td', null, nomeDe(a.perfil)), h('td', { class: 'n' }, reais(a.preco)), h('td', null, h('span', { class: 'tag ' + ASTATUS[a.status][1] }, ASTATUS[a.status][0])),
      h('td', null, a.status !== 'removido' ? h('button', { class: 'btn danger', onclick: async () => { const { error } = await c.from('anuncios').update({ status: 'removido' }).eq('id', a.id); if (error) st.textContent = erroTxt(error); else adminPage(); } }, 'Tirar do ar') : null)))))) : P('Nenhum anúncio.')),
    card(h('h2', null, 'Pedidos recentes'), (peds || []).length ? h('div', { class: 'tbox' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Item'), h('th', null, 'Comprador → vendedor'), h('th', { class: 'n' }, 'Total'), h('th', { class: 'n' }, 'Comissão'), h('th', null, 'Status'))),
      h('tbody', null, peds.map((p) => h('tr', null, h('td', null, p.id), h('td', { class: 'nm' }, p.quantidade + '× ' + p.titulo), h('td', null, nomeDe(p.cp) + ' → ' + nomeDe(p.vd)), h('td', { class: 'n' }, reais(p.total)), h('td', { class: 'n' }, reais(p.comissao)), h('td', null, h('span', { class: 'tag ' + PSTATUS[p.status][1] }, PSTATUS[p.status][0]))))))) : P('Nenhum pedido ainda.')));
}

/* volta do Mercado Pago (?mp=retorno&pedido=…) ou da ligação de conta (?mp=ligado) */
if (MPQ.get('mp') === 'retorno' && !/^#\/mercado\/pedidos/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/mercado/pedidos');
