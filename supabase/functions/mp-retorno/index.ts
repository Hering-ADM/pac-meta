// O Mercado Pago volta para cá depois que o vendedor autoriza (OAuth). Guarda o token e volta para o site.
import { admin, oauthToken, RETORNO_OAUTH, SITE } from '../_shared/comum.ts';

const volta = (st: string) => Response.redirect(`${SITE}/?mp=${st}#/mercado/vender`, 302);

Deno.serve(async (req) => {
  const q = new URL(req.url).searchParams;
  const code = q.get('code'), state = q.get('state');
  if (!code || !state) return volta('cancelado');
  const db = admin();
  const { data: e } = await db.from('mp_estados').select('*').eq('state', state).maybeSingle();
  await db.from('mp_estados').delete().eq('state', state);
  if (!e || Date.now() - new Date(e.criado_em).getTime() > 15 * 60e3) return volta('expirou');
  try {
    const t = await oauthToken({ grant_type: 'authorization_code', code, redirect_uri: RETORNO_OAUTH });
    // a mesma conta Mercado Pago não pode servir a dois vendedores
    await db.from('mp_contas').delete().eq('mp_user_id', t.user_id).neq('usuario', e.usuario);
    const { error } = await db.from('mp_contas').upsert({
      usuario: e.usuario, mp_user_id: t.user_id, access_token: t.access_token, refresh_token: t.refresh_token,
      public_key: t.public_key || null, expira_em: new Date(Date.now() + t.expires_in * 1000).toISOString(), ligado_em: new Date().toISOString(),
    });
    if (error) throw error;
    return volta('ligado');
  } catch (err) {
    console.error(err);
    return volta('erro');
  }
});
