'use strict';
/* Pac-Meta — contas (Supabase): login com Google ou e-mail, perfil, artigos com aprovação,
   comentários moderados e favoritos. Usa as funções de app.js (h, card, $main, get, ...).
   Para ligar: preencha SB_URL e SB_KEY com a URL e a chave pública (anon) do projeto Supabase.
   A chave "anon" é pública por natureza; a segurança vem das regras em supabase/schema.sql. */
const SB_URL = '';
const SB_KEY = '';
const SB_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js';
const CONTAS = !!(SB_URL && SB_KEY);

let _sb = null, ME = null, PERFIL = null;
const acct = { ready: null };
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); }); }
async function sb() {
  if (!CONTAS) return null;
  if (!acct.ready) acct.ready = (async () => {
    await loadScript(SB_LIB);
    _sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data } = await _sb.auth.getSession(); await setUser(data.session ? data.session.user : null);
    _sb.auth.onAuthStateChange(async (ev, session) => {
      await setUser(session ? session.user : null);
      if (ev === 'PASSWORD_RECOVERY') location.hash = '#/conta/nova-senha';
      else if (ev === 'SIGNED_IN' && /^#\/entrar/.test(location.hash)) location.hash = sessionStorageGet('volta') || '#/conta';
    });
    // depois do retorno do login (?code=...), limpa a URL
    if (/[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname + (location.hash || '#/conta'));
    return _sb;
  })().catch((e) => { console.error(e); acct.ready = null; return null; });
  return acct.ready;
}
function sessionStorageGet(k) { try { const v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch (e) { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
async function setUser(u) {
  ME = u; PERFIL = null;
  if (u) { const { data } = await _sb.from('profiles').select('*').eq('id', u.id).maybeSingle(); PERFIL = data || { id: u.id, nome: '', bio: '', papel: 'leitor' }; }
  drawAccountButton();
}
const isAdmin = () => !!(PERFIL && PERFIL.papel === 'admin');
const nomeDe = (p) => (p && p.nome) || 'Jogador';

/* ---------- botão no topo ---------- */
function drawAccountButton() {
  const slot = document.getElementById('acct'); if (!slot) return;
  if (!CONTAS) { slot.replaceChildren(); return; }
  if (!ME) { slot.replaceChildren(h('a', { class: 'acct-btn', href: '#/entrar' }, 'Entrar')); return; }
  slot.replaceChildren(h('a', { class: 'acct-btn me', href: '#/conta', title: 'Minha conta' }, avatar(PERFIL, 26), h('span', { class: 'hide-sm' }, nomeDe(PERFIL).split(' ')[0])));
}
function avatar(p, size) {
  const n = nomeDe(p);
  if (p && p.avatar_url) return h('img', { class: 'av', src: p.avatar_url, alt: '', width: size, height: size, referrerpolicy: 'no-referrer', loading: 'lazy' });
  return h('span', { class: 'av av-l', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px`, 'aria-hidden': 'true' }, n.trim()[0] ? n.trim()[0].toUpperCase() : '?');
}
function precisaLogin(msg) {
  sessionStorageSet('volta', location.hash);
  return h('div', { class: 'notice row between' }, h('span', null, msg || 'Entre na sua conta para continuar.'), h('a', { class: 'btn pri', href: '#/entrar' }, 'Entrar ou criar conta'));
}
function semContas() { fail('As contas do Pac-Meta ainda estão sendo ativadas. Volte em breve.'); }
const erroTxt = (e) => {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/User already registered/i.test(m)) return 'Já existe uma conta com esse e-mail. Use "Entrar".';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (/check constraint|violates/i.test(m)) return 'Algum campo está fora do tamanho permitido. Confira e tente de novo.';
  return 'Não deu certo: ' + m;
};

/* ---------- entrar / criar conta ---------- */
async function entrarPage() {
  title('Entrar'); if (!CONTAS) return semContas();
  const c = await sb(); if (ME) { location.hash = '#/conta'; return; }
  let modo = 'entrar';
  const st = h('p', { class: 'crumb', role: 'status' });
  const email = h('input', { class: 'input', type: 'email', id: 'l-email', autocomplete: 'email', required: true });
  const senha = h('input', { class: 'input', type: 'password', id: 'l-senha', autocomplete: 'current-password', minlength: 8, required: true });
  const nome = h('input', { class: 'input', id: 'l-nome', autocomplete: 'name', maxlength: 60 });
  const nomeFld = h('div', { class: 'fld', hidden: true }, h('label', { for: 'l-nome' }, 'Nome (aparece nos seus artigos e comentários)'), nome);
  const termos = h('label', { class: 'chk', hidden: true }, h('input', { type: 'checkbox', id: 'l-termos' }), ' Li e aceito os ', h('a', { href: '#/termos', target: '_blank' }, 'Termos de Uso'), ' e a ', h('a', { href: '#/privacidade', target: '_blank' }, 'Política de Privacidade'), '.');
  const btn = h('button', { class: 'btn pri', type: 'submit' }, 'Entrar');
  const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': 'Entrar ou criar conta' }, [['entrar', 'Entrar'], ['criar', 'Criar conta']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(k === modo), onclick: () => setModo(k) }, t)));
  function setModo(k) {
    modo = k; tabs.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(['entrar', 'criar'][i] === k)));
    nomeFld.hidden = termos.hidden = k !== 'criar'; btn.textContent = k === 'criar' ? 'Criar conta' : 'Entrar';
    senha.autocomplete = k === 'criar' ? 'new-password' : 'current-password'; st.textContent = '';
  }
  const form = h('form', { class: 'form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); st.textContent = '';
    if (!email.value.trim() || !/.+@.+\..+/.test(email.value)) { st.textContent = 'Informe um e-mail válido.'; email.focus(); return; }
    if (senha.value.length < 8) { st.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; senha.focus(); return; }
    btn.disabled = true;
    try {
      if (modo === 'criar') {
        if (!termos.querySelector('input').checked) { st.textContent = 'Para criar a conta, aceite os Termos e a Política de Privacidade.'; return; }
        const { data, error } = await c.auth.signUp({ email: email.value.trim(), password: senha.value, options: { data: { full_name: nome.value.trim() }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) st.textContent = 'Conta criada! Enviamos um link para ' + email.value.trim() + '. Clique nele para confirmar e entrar.';
      } else {
        const { error } = await c.auth.signInWithPassword({ email: email.value.trim(), password: senha.value }); if (error) throw error;
      }
    } catch (err) { st.textContent = erroTxt(err); } finally { btn.disabled = false; }
  } },
    tabs,
    h('div', { class: 'fld' }, h('label', { for: 'l-email' }, 'E-mail'), email),
    h('div', { class: 'fld' }, h('label', { for: 'l-senha' }, 'Senha'), senha),
    nomeFld, termos,
    h('div', { class: 'row between' }, btn, h('button', { type: 'button', class: 'linkbtn', onclick: async () => {
      if (!/.+@.+\..+/.test(email.value)) { st.textContent = 'Digite seu e-mail acima e clique de novo em "Esqueci a senha".'; email.focus(); return; }
      const { error } = await c.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
      st.textContent = error ? erroTxt(error) : 'Se houver uma conta com esse e-mail, enviamos um link para criar uma senha nova.';
    } }, 'Esqueci a senha')), st);
  $main.replaceChildren(h('div', { class: 'card prose auth' },
    h('h1', null, 'Entrar no Pac-Meta'),
    P('Com uma conta você escreve artigos, comenta, salva decks e cartas e tem uma página de autor. O resto do site continua aberto para todo mundo.'),
    h('button', { class: 'btn google', type: 'button', onclick: async () => {
      const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
      if (error) st.textContent = erroTxt(error);
    } }, googleIcon(), 'Continuar com Google'),
    h('div', { class: 'ou' }, h('span', null, 'ou com e-mail')), form));
}
function googleIcon() { const s = h('span', { class: 'gi', 'aria-hidden': 'true' }); s.innerHTML = '<svg viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>'; return s; }

async function novaSenhaPage() {
  title('Nova senha'); const c = await sb(); if (!c) return semContas();
  if (!ME) { $main.replaceChildren(card(precisaLogin('O link expirou. Peça um novo em "Esqueci a senha".'))); return; }
  const st = h('p', { class: 'crumb', role: 'status' });
  const s1 = h('input', { class: 'input', type: 'password', id: 'n1', autocomplete: 'new-password', minlength: 8 });
  $main.replaceChildren(h('div', { class: 'card prose auth' }, h('h1', null, 'Criar uma senha nova'),
    h('form', { class: 'form', onsubmit: async (e) => { e.preventDefault(); if (s1.value.length < 8) { st.textContent = 'Use pelo menos 8 caracteres.'; return; }
      const { error } = await c.auth.updateUser({ password: s1.value }); st.textContent = error ? erroTxt(error) : 'Senha alterada.'; if (!error) setTimeout(() => { location.hash = '#/conta'; }, 900); } },
      h('div', { class: 'fld' }, h('label', { for: 'n1' }, 'Senha nova (mínimo 8 caracteres)'), s1), h('button', { class: 'btn pri' }, 'Salvar senha'), st)));
}

/* ---------- minha conta ---------- */
const STATUS = { rascunho: ['Rascunho', ''], pendente: ['Aguardando aprovação', 'gold'], aprovado: ['Publicado', 'ok'], recusado: ['Precisa de ajustes', 'bad'] };
async function contaPage() {
  title('Minha conta'); const c = await sb(); if (!c) return semContas();
  if (!ME) { $main.replaceChildren(card(h('h1', null, 'Minha conta'), precisaLogin())); return; }
  const [{ data: arts }, { data: favs }] = await Promise.all([
    c.from('articles').select('id,titulo,status,nota_revisao,atualizado_em').eq('autor', ME.id).order('atualizado_em', { ascending: false }),
    c.from('favorites').select('tipo,ref,titulo,criado_em').eq('usuario', ME.id).order('criado_em', { ascending: false })]);
  const st = h('p', { class: 'crumb', role: 'status' });
  const nome = h('input', { class: 'input', id: 'p-nome', maxlength: 60, value: PERFIL.nome || '' });
  const bio = h('textarea', { id: 'p-bio', rows: 3, maxlength: 400 }); bio.value = PERFIL.bio || '';
  const favGroups = [['deck', 'Decks'], ['lista', 'Listas'], ['carta', 'Cartas']];
  $main.replaceChildren(
    h('div', { class: 'row between' }, h('div', { class: 'row' }, avatar(PERFIL, 48), h('div', null, h('h1', { style: 'margin:0' }, nomeDe(PERFIL)), h('p', { class: 'crumb', style: 'margin:0' }, ME.email))),
      h('div', { class: 'row' }, isAdmin() ? h('a', { class: 'btn', href: '#/admin' }, 'Revisão (admin)') : null, h('a', { class: 'btn', href: '#/autor/' + ME.id }, 'Ver meu perfil público'), h('button', { class: 'btn', onclick: async () => { await c.auth.signOut(); location.hash = '#/'; } }, 'Sair'))),
    h('div', { class: 'grid2' },
      card(h('h2', null, 'Meus artigos', h('a', { href: '#/artigos/novo' }, 'escrever novo')),
        (arts || []).length ? h('ul', { class: 'mylist' }, arts.map((a) => h('li', null,
          h('div', null, h('a', { href: a.status === 'aprovado' ? '#/artigos/u/' + a.id : '#/artigos/editar/' + a.id }, a.titulo), ' ', h('span', { class: 'tag ' + STATUS[a.status][1] }, STATUS[a.status][0])),
          a.status === 'recusado' && a.nota_revisao ? h('small', { class: 'crumb' }, 'Revisão: ' + a.nota_revisao) : null))) : h('p', { class: 'crumb' }, 'Você ainda não escreveu nenhum artigo. ', h('a', { href: '#/artigos/novo' }, 'Escrever o primeiro'), '.')),
      card(h('h2', null, 'Salvos'),
        (favs || []).length ? favGroups.filter(([t]) => favs.some((f) => f.tipo === t)).map(([t, n]) => [h('h3', null, n), h('ul', { class: 'mylist' }, favs.filter((f) => f.tipo === t).map((f) => h('li', null, h('a', { href: favHref(f) }, f.titulo || f.ref), ' ', h('button', { class: 'linkbtn', onclick: async (e) => { await c.from('favorites').delete().match({ usuario: ME.id, tipo: f.tipo, ref: f.ref }); e.target.closest('li').remove(); } }, 'remover'))))])
          : h('p', { class: 'crumb' }, 'Use o botão "Salvar" nas páginas de deck, lista e carta para guardar aqui.'))),
    card(h('h2', null, 'Perfil público'),
      h('form', { class: 'form', onsubmit: async (e) => { e.preventDefault(); const { error } = await c.from('profiles').update({ nome: nome.value.trim(), bio: bio.value.trim() }).eq('id', ME.id); st.textContent = error ? erroTxt(error) : 'Perfil salvo.'; if (!error) { PERFIL.nome = nome.value.trim(); PERFIL.bio = bio.value.trim(); drawAccountButton(); } } },
        h('div', { class: 'fld' }, h('label', { for: 'p-nome' }, 'Nome'), nome),
        h('div', { class: 'fld' }, h('label', { for: 'p-bio' }, 'Sobre você (aparece na sua página de autor)'), bio),
        h('div', { class: 'row' }, h('button', { class: 'btn pri' }, 'Salvar perfil')), st)),
    card(h('h2', null, 'Excluir conta'), h('p', { class: 'crumb' }, 'Apaga sua conta, seu perfil, seus artigos, comentários e itens salvos. Não dá para desfazer.'),
      h('button', { class: 'btn danger', onclick: async (e) => {
        const b = e.currentTarget; if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Clique de novo para confirmar a exclusão'; return; }
        const { error } = await c.rpc('excluir_minha_conta'); if (error) { b.textContent = erroTxt(error); return; }
        await c.auth.signOut(); location.hash = '#/'; } }, 'Excluir minha conta')));
}
function favHref(f) { if (f.tipo === 'deck') { const [fm, s] = f.ref.split('/'); return `#/f/${fm}/a/${s}`; } if (f.tipo === 'lista') return '#/e/' + f.ref; return '#/c/' + enc(f.ref); }

/* ---------- botão Salvar (favoritos) ---------- */
function saveButton(tipo, ref, titulo) {
  if (!CONTAS) return null;
  const b = h('button', { class: 'btn save', type: 'button', 'aria-pressed': 'false' }, h('span', { 'aria-hidden': 'true' }, '☆'), h('span', null, 'Salvar'));
  const set = (on) => { b.setAttribute('aria-pressed', String(on)); b.firstChild.textContent = on ? '★' : '☆'; b.lastChild.textContent = on ? 'Salvo' : 'Salvar'; };
  sb().then(async (c) => { if (c && ME) { const { data } = await c.from('favorites').select('ref').match({ usuario: ME.id, tipo, ref }).maybeSingle(); set(!!data); } });
  b.addEventListener('click', async () => {
    const c = await sb(); if (!c) return;
    if (!ME) { sessionStorageSet('volta', location.hash); location.hash = '#/entrar'; return; }
    const on = b.getAttribute('aria-pressed') === 'true'; set(!on);
    const { error } = on ? await c.from('favorites').delete().match({ usuario: ME.id, tipo, ref }) : await c.from('favorites').insert({ usuario: ME.id, tipo, ref, titulo: (titulo || ref).slice(0, 120) });
    if (error) set(on);
  });
  return b;
}

/* ---------- artigos da comunidade ---------- */
const TEMAS = ['Metagame', 'Guia de deck', 'Relato de torneio', 'Preços e mercado', 'Iniciantes', 'Outro'];
async function communityArticles() {
  const c = await sb(); if (!c) return [];
  const { data } = await c.from('articles').select('id,titulo,resumo,tema,publicado_em,perfil:profiles(id,nome)').eq('status', 'aprovado').order('publicado_em', { ascending: false }).limit(60);
  return (data || []).map((a) => ({ slug: 'u/' + a.id, titulo: a.titulo, resumo: a.resumo, data: (a.publicado_em || '').slice(0, 10), autor: nomeDe(a.perfil), autorId: a.perfil && a.perfil.id, tags: [a.tema] }));
}
async function artigoComunidade(id) {
  const c = await sb(); if (!c) return semContas();
  await cards();
  const { data: a } = await c.from('articles').select('*,perfil:profiles(id,nome,avatar_url,bio)').eq('id', id).maybeSingle();
  if (!a) return fail('Artigo não encontrado ou ainda não publicado.');
  title(a.titulo);
  const aviso = a.status !== 'aprovado' ? h('p', { class: 'notice' }, 'Prévia: este artigo está com status "' + STATUS[a.status][0] + '" e só você' + (isAdmin() ? ' e a revisão' : '') + ' consegue vê-lo.') : null;
  $main.replaceChildren(
    h('article', { class: 'card prose artigo' },
      h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/artigos' }, 'Artigos')), aviso,
      h('div', { class: 'tags' }, h('span', { class: 'tag' }, a.tema), h('span', { class: 'tag' }, 'Comunidade')),
      h('h1', null, a.titulo), a.resumo ? h('p', { class: 'lead' }, a.resumo) : null,
      h('p', { class: 'crumb byline' }, avatar(a.perfil, 22), ' Por ', h('a', { href: '#/autor/' + a.perfil.id }, nomeDe(a.perfil)), a.publicado_em ? ' · ' + dat(a.publicado_em.slice(0, 10)) : ''),
      md(a.texto)),
    a.status === 'aprovado' ? await commentsBox('u-' + a.id) : null);
}
async function editorArtigo(id) {
  title(id ? 'Editar artigo' : 'Escrever artigo'); const c = await sb(); if (!c) return enviarArtigo();
  if (!ME) { $main.replaceChildren(h('div', { class: 'card prose' }, h('h1', null, 'Escrever um artigo'), P('Para escrever e enviar um artigo, entre na sua conta. Todo texto é lido antes de ser publicado.'), precisaLogin())); return; }
  let a = { titulo: '', resumo: '', tema: 'Metagame', texto: '', status: 'rascunho' };
  if (id) { const { data } = await c.from('articles').select('*').eq('id', id).maybeSingle(); if (!data || (data.autor !== ME.id && !isAdmin())) return fail('Artigo não encontrado.'); a = data; }
  if (a.status === 'aprovado' && !isAdmin()) return fail('Este artigo já foi publicado. Para mudar algo, escreva para ' + EMAIL + '.');
  const st = h('p', { class: 'crumb', role: 'status' });
  const titulo = h('input', { class: 'input', id: 'a-titulo', maxlength: 120, value: a.titulo });
  const resumo = h('textarea', { id: 'a-resumo', rows: 2, maxlength: 300 }); resumo.value = a.resumo;
  const tema = h('select', { id: 'a-tema' }, TEMAS.map((t) => h('option', { value: t, selected: t === a.tema }, t)));
  const texto = h('textarea', { id: 'a-texto', rows: 20, maxlength: 40000, class: 'mono' }); texto.value = a.texto;
  const count = h('small', { class: 'help' });
  const prev = h('div', { class: 'prose artigo preview', hidden: true });
  const upd = () => { const w = (texto.value.trim().match(/\S+/g) || []).length; count.textContent = w + ' palavras'; };
  texto.addEventListener('input', upd); upd();
  async function salvar(status) {
    if (titulo.value.trim().length < 5) { st.textContent = 'O título precisa ter pelo menos 5 caracteres.'; titulo.focus(); return; }
    if (texto.value.trim().length < 200) { st.textContent = 'O texto está curto demais (mínimo de 200 caracteres).'; texto.focus(); return; }
    const row = { titulo: titulo.value.trim(), resumo: resumo.value.trim(), tema: tema.value, texto: texto.value.trim(), status };
    const q = id ? c.from('articles').update(row).eq('id', id).select('id').single() : c.from('articles').insert({ ...row, autor: ME.id }).select('id').single();
    const { data, error } = await q; if (error) { st.textContent = erroTxt(error); return; }
    if (!id) { id = data.id; history.replaceState(null, '', '#/artigos/editar/' + id); }
    st.textContent = status === 'pendente' ? 'Enviado para aprovação. Você recebe a resposta aqui em "Minha conta".' : 'Rascunho salvo.';
    if (status === 'pendente') setTimeout(() => { location.hash = '#/conta'; }, 1200);
  }
  $main.replaceChildren(h('div', { class: 'card prose editor' },
    h('div', { class: 'crumb' }, h('a', { href: '#/' }, 'Início'), ' › ', h('a', { href: '#/artigos' }, 'Artigos'), ' › ', id ? 'Editar' : 'Escrever'),
    h('h1', null, id ? 'Editar artigo' : 'Escrever um artigo'),
    a.status === 'recusado' && a.nota_revisao ? h('p', { class: 'notice' }, h('b', null, 'Pedido da revisão: '), a.nota_revisao) : null,
    P('Seu texto é lido por ' + AUTOR + ' antes de ser publicado. O texto precisa ser seu e inédito. Use ## para subtítulos, - para listas, **negrito** e o nome das cartas em inglês entre colchetes duplos, como [[Lightning Bolt]].'),
    h('div', { class: 'form' },
      h('div', { class: 'fld' }, h('label', { for: 'a-titulo' }, 'Título'), titulo),
      h('div', { class: 'fld' }, h('label', { for: 'a-resumo' }, 'Resumo em uma ou duas frases'), resumo),
      h('div', { class: 'fld' }, h('label', { for: 'a-tema' }, 'Tema'), tema),
      h('div', { class: 'fld' }, h('label', { for: 'a-texto' }, 'Texto'), count, texto, prev),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: (e) => { const on = prev.hidden; prev.hidden = !on; texto.hidden = on; if (on) prev.replaceChildren(h('h1', null, titulo.value), md(texto.value)); e.currentTarget.textContent = on ? 'Voltar a editar' : 'Ver prévia'; } }, 'Ver prévia'),
        h('button', { class: 'btn', type: 'button', onclick: () => salvar('rascunho') }, 'Salvar rascunho'),
        h('button', { class: 'btn pri', type: 'button', onclick: () => salvar('pendente') }, 'Enviar para aprovação')), st)));
}

/* ---------- comentários ---------- */
async function commentsBox(artigo) {
  if (!CONTAS) return null;
  const c = await sb(); if (!c) return null;
  const { data } = await c.from('comments').select('id,texto,status,criado_em,autor,perfil:profiles(id,nome,avatar_url)').eq('artigo', artigo).order('criado_em');
  const list = h('div', { class: 'comments' });
  const draw = (rows) => list.replaceChildren(...(rows.length ? rows.map((k) => h('div', { class: 'cmt' }, avatar(k.perfil, 30), h('div', null,
    h('div', { class: 'crumb' }, h('a', { href: '#/autor/' + (k.perfil && k.perfil.id) }, nomeDe(k.perfil)), ' · ' + new Date(k.criado_em).toLocaleDateString('pt-BR'), k.status === 'pendente' ? h('span', { class: 'tag gold' }, 'aguardando moderação') : null),
    h('p', null, k.texto)))) : [h('p', { class: 'crumb' }, 'Ainda não há comentários.')]));
  const rows = data || []; draw(rows);
  let form;
  if (!ME) form = precisaLogin('Entre na sua conta para comentar.');
  else {
    const ta = h('textarea', { rows: 3, maxlength: 2000, 'aria-label': 'Seu comentário' }); const st = h('p', { class: 'crumb', role: 'status' });
    form = h('form', { class: 'form', onsubmit: async (e) => { e.preventDefault(); if (ta.value.trim().length < 2) return;
      const { data: k, error } = await c.from('comments').insert({ artigo, autor: ME.id, texto: ta.value.trim() }).select('id,texto,status,criado_em,autor').single();
      if (error) { st.textContent = erroTxt(error); return; }
      rows.push({ ...k, perfil: PERFIL }); draw(rows); ta.value = ''; st.textContent = 'Comentário enviado. Ele aparece para todos depois da moderação.'; } },
      ta, h('div', { class: 'row' }, h('button', { class: 'btn pri' }, 'Comentar')), st);
  }
  return card(h('h2', null, 'Comentários'), list, form);
}

/* ---------- perfil do autor ---------- */
async function autorPage(id) {
  const c = await sb(); if (!c) return semContas();
  const [{ data: p }, { data: arts }] = await Promise.all([c.from('profiles').select('id,nome,bio,avatar_url,criado_em').eq('id', id).maybeSingle(), c.from('articles').select('id,titulo,resumo,tema,publicado_em').eq('autor', id).eq('status', 'aprovado').order('publicado_em', { ascending: false })]);
  if (!p) return fail('Autor não encontrado.');
  title(nomeDe(p));
  $main.replaceChildren(
    h('div', { class: 'card author' }, avatar(p, 72), h('div', null, h('h1', { style: 'margin:0' }, nomeDe(p)), h('p', { class: 'crumb', style: 'margin:.2rem 0' }, 'No Pac-Meta desde ' + new Date(p.criado_em).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })), p.bio ? h('p', { style: 'margin:.4rem 0 0' }, p.bio) : null)),
    h('h2', null, 'Artigos publicados'),
    (arts || []).length ? h('div', { class: 'arts' }, arts.map((a) => h('a', { class: 'card art-card', href: '#/artigos/u/' + a.id }, h('div', { class: 'tags' }, h('span', { class: 'tag' }, a.tema)), h('h2', null, a.titulo), h('p', null, a.resumo), h('small', { class: 'crumb' }, dat((a.publicado_em || '').slice(0, 10))))))
      : h('p', { class: 'crumb' }, 'Nenhum artigo publicado ainda.'));
}

/* ---------- revisão (admin) ---------- */
async function adminPage() {
  title('Revisão'); const c = await sb(); if (!c) return semContas();
  if (!isAdmin()) return fail('Esta área é só para a revisão do site.');
  const [{ data: arts }, { data: cms }] = await Promise.all([
    c.from('articles').select('id,titulo,resumo,tema,texto,atualizado_em,perfil:profiles(id,nome)').eq('status', 'pendente').order('atualizado_em'),
    c.from('comments').select('id,artigo,texto,criado_em,perfil:profiles(id,nome)').eq('status', 'pendente').order('criado_em')]);
  const artBox = (a) => {
    const nota = h('textarea', { rows: 2, maxlength: 1000, placeholder: 'O que precisa mudar (aparece para o autor)', 'aria-label': 'Nota para o autor' }); const st = h('p', { class: 'crumb', role: 'status' });
    const act = async (status) => { if (status === 'recusado' && !nota.value.trim()) { st.textContent = 'Escreva o que o autor precisa ajustar.'; nota.focus(); return; }
      const { error } = await c.from('articles').update({ status, nota_revisao: status === 'recusado' ? nota.value.trim() : '' }).eq('id', a.id);
      st.textContent = error ? erroTxt(error) : (status === 'aprovado' ? 'Publicado.' : 'Devolvido ao autor com a sua nota.'); };
    return h('details', { class: 'acc' }, h('summary', null, a.titulo + ' · ' + nomeDe(a.perfil)),
      h('div', null, h('p', { class: 'crumb' }, a.tema + ' · enviado em ' + new Date(a.atualizado_em).toLocaleString('pt-BR')), a.resumo ? h('p', { class: 'lead' }, a.resumo) : null,
        h('div', { class: 'prose artigo preview' }, md(a.texto)),
        h('div', { class: 'form' }, nota, h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: () => act('aprovado') }, 'Aprovar e publicar'), h('button', { class: 'btn', onclick: () => act('recusado') }, 'Pedir ajustes'), h('a', { class: 'btn', href: '#/artigos/editar/' + a.id }, 'Editar')), st)));
  };
  const cmtBox = (k) => { const st = h('span', { class: 'crumb', role: 'status' }); const act = async (status) => { const { error } = await c.from('comments').update({ status }).eq('id', k.id); st.textContent = error ? erroTxt(error) : (status === 'aprovado' ? 'Aprovado.' : 'Recusado.'); };
    return h('div', { class: 'cmt' }, h('div', null, h('div', { class: 'crumb' }, nomeDe(k.perfil) + ' em ', h('a', { href: k.artigo.startsWith('u-') ? '#/artigos/u/' + k.artigo.slice(2) : '#/artigos/' + k.artigo }, k.artigo)), h('p', null, k.texto),
      h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: () => act('aprovado') }, 'Aprovar'), h('button', { class: 'btn', onclick: () => act('recusado') }, 'Recusar'), st))); };
  $main.replaceChildren(h('h1', null, 'Revisão'),
    card(h('h2', null, 'Artigos aguardando aprovação (' + (arts || []).length + ')'), (arts || []).length ? arts.map(artBox) : h('p', { class: 'crumb' }, 'Nada na fila.')),
    card(h('h2', null, 'Comentários aguardando moderação (' + (cms || []).length + ')'), (cms || []).length ? h('div', { class: 'comments' }, cms.map(cmtBox)) : h('p', { class: 'crumb' }, 'Nada na fila.')));
}

/* carrega a sessão depois que app.js também carregou, para o botão do topo */
if (CONTAS) setTimeout(sb, 0);
