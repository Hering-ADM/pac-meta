// Gera o link para o vendedor aprovado ligar a conta Mercado Pago dele ao Pac-Meta.
import { admin, CORS, erro, json, usuario, MP_CLIENT_ID, RETORNO_OAUTH } from '../_shared/comum.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro('Use POST.', 405);
  const u = await usuario(req); if (!u) return erro('Entre na sua conta.', 401);
  const db = admin();
  const { data: p } = await db.from('profiles').select('vendedor').eq('id', u.id).maybeSingle();
  if (!p || p.vendedor !== 'aprovado') return erro('Sua conta ainda não foi aprovada para vender.', 403);
  const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await db.from('mp_estados').delete().lt('criado_em', new Date(Date.now() - 15 * 60e3).toISOString());
  const { error } = await db.from('mp_estados').insert({ state, usuario: u.id });
  if (error) return erro('Não deu para iniciar a ligação. Tente de novo.', 500);
  const url = 'https://auth.mercadopago.com/authorization?' + new URLSearchParams({
    client_id: MP_CLIENT_ID, response_type: 'code', platform_id: 'mp', state, redirect_uri: RETORNO_OAUTH,
  });
  return json({ url });
});
