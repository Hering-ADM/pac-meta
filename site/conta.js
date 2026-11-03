'use strict';
/* Pac-Meta — contas (Supabase): login com Google ou e-mail, perfil e pedido para vender no mercado.
   Usa as funções de app.js (h, card, $main, get, ...). O mercado fica em mercado.js.
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
  if (/^(Só |Este anúncio|Pedidos são|Mudança de status|Você tem pedidos|O vendedor|Você não pode|Quantidade|Preencha|Esgotado|Este vendedor|Sua conta|Entre na sua conta|Não deu|O Mercado Pago)/.test(m)) return m;
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
    P('Com uma conta você compra no mercado entre jogadores, anuncia o que procura e, depois de aprovado, vende as suas cartas. O resto do site continua aberto para todo mundo.'),
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
const VEND = { nenhum: ['Ainda não vende', ''], pedido: ['Pedido em análise', 'gold'], aprovado: ['Vendedor aprovado', 'ok'], recusado: ['Pedido recusado', 'bad'], bloqueado: ['Vendas bloqueadas', 'bad'] };
async function contaPage() {
  title('Minha conta'); const c = await sb(); if (!c) return semContas();
  if (!ME) { $main.replaceChildren(card(h('h1', null, 'Minha conta'), precisaLogin())); return; }
  const st = h('p', { class: 'crumb', role: 'status' });
  const nome = h('input', { class: 'input', id: 'p-nome', maxlength: 60, value: PERFIL.nome || '' });
  const cidade = h('input', { class: 'input', id: 'p-cidade', maxlength: 60, value: PERFIL.cidade || '', placeholder: 'Ex.: São Paulo, SP' });
  const bio = h('textarea', { id: 'p-bio', rows: 3, maxlength: 400 }); bio.value = PERFIL.bio || '';
  const v = VEND[PERFIL.vendedor || 'nenhum'];
  $main.replaceChildren(
    h('div', { class: 'row between' }, h('div', { class: 'row' }, avatar(PERFIL, 48), h('div', null, h('h1', { style: 'margin:0' }, nomeDe(PERFIL)), h('p', { class: 'crumb', style: 'margin:0' }, ME.email))),
      h('div', { class: 'row' }, isAdmin() ? h('a', { class: 'btn', href: '#/admin' }, 'Painel do admin') : null, h('button', { class: 'btn', onclick: async () => { await c.auth.signOut(); location.hash = '#/'; } }, 'Sair'))),
    h('div', { class: 'grid2' },
      card(h('h2', null, 'Mercado'), h('p', null, h('span', { class: 'tag ' + v[1] }, v[0])),
        h('div', { class: 'row' }, h('a', { class: 'btn pri', href: '#/mercado/pedidos' }, 'Minhas compras e vendas'), h('a', { class: 'btn', href: '#/mercado/vender' }, PERFIL.vendedor === 'aprovado' ? 'Meus anúncios' : 'Quero vender'), h('a', { class: 'btn', href: '#/mercado/procuras' }, 'Pedidos de compra'))),
      card(h('h2', null, 'Perfil'),
        h('form', { class: 'form', onsubmit: async (e) => { e.preventDefault(); const row = { nome: nome.value.trim(), cidade: cidade.value.trim(), bio: bio.value.trim() }; const { error } = await c.from('profiles').update(row).eq('id', ME.id); st.textContent = error ? erroTxt(error) : 'Perfil salvo.'; if (!error) { Object.assign(PERFIL, row); drawAccountButton(); } } },
          h('div', { class: 'fld' }, h('label', { for: 'p-nome' }, 'Nome (aparece nos seus anúncios)'), nome),
          h('div', { class: 'fld' }, h('label', { for: 'p-cidade' }, 'Cidade'), cidade),
          h('div', { class: 'fld' }, h('label', { for: 'p-bio' }, 'Sobre você'), bio),
          h('div', { class: 'row' }, h('button', { class: 'btn pri' }, 'Salvar perfil')), st))),
    card(h('h2', null, 'Excluir conta'), h('p', { class: 'crumb' }, 'Apaga seu login, perfil, anúncios e pedidos de compra. Compras e vendas já feitas ficam registradas sem o seu endereço, porque a lei exige guardar o histórico das transações. Quem tem pedido em andamento precisa concluir a entrega antes. Não dá para desfazer.'),
      h('button', { class: 'btn danger', onclick: async (e) => {
        const b = e.currentTarget; if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Clique de novo para confirmar a exclusão'; return; }
        const { error } = await c.rpc('excluir_minha_conta'); if (error) { b.textContent = erroTxt(error); return; }
        await c.auth.signOut(); location.hash = '#/'; } }, 'Excluir minha conta')));
}

/* carrega a sessão depois que app.js também carregou, para o botão do topo */
if (CONTAS) setTimeout(sb, 0);
