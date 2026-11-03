// Pac-Meta: utilidades das funções do mercado (Supabase Edge Functions, Deno).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

export const SITE = (Deno.env.get('SITE_URL') || 'https://pacmeta.com.br').replace(/\/$/, '');
export const COMISSAO = Number(Deno.env.get('COMISSAO') || '0.03');           // 3%
export const MP_CLIENT_ID = Deno.env.get('MP_CLIENT_ID') || '';
export const MP_CLIENT_SECRET = Deno.env.get('MP_CLIENT_SECRET') || '';
export const MP_WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET') || '';
export const MP_TESTE = Deno.env.get('MP_TESTE') === '1';                     // credenciais de teste do Mercado Pago
export const FUNCOES = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
export const RETORNO_OAUTH = `${FUNCOES}/mp-retorno`;

export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

export const CORS = {
  'Access-Control-Allow-Origin': SITE,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
export const erro = (msg: string, status = 400) => json({ erro: msg }, status);

// usuário logado a partir do token do site
export async function usuario(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data.user || null;
}

// troca/renova o token do vendedor no Mercado Pago
export async function oauthToken(params: Record<string, string>) {
  const r = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ client_id: MP_CLIENT_ID, client_secret: MP_CLIENT_SECRET, ...params, ...(MP_TESTE ? { test_token: 'true' } : {}) }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error('Mercado Pago recusou o token: ' + (d.message || r.status));
  return d as { access_token: string; refresh_token: string; user_id: number; public_key?: string; expires_in: number };
}

// token válido do vendedor (renova se faltar menos de 7 dias para vencer)
export async function tokenDoVendedor(vendedor: string) {
  const db = admin();
  const { data: c } = await db.from('mp_contas').select('*').eq('usuario', vendedor).maybeSingle();
  if (!c) throw new Error('O vendedor não ligou o Mercado Pago.');
  if (new Date(c.expira_em).getTime() - Date.now() > 7 * 86400e3) return c;
  const t = await oauthToken({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
  const novo = { access_token: t.access_token, refresh_token: t.refresh_token, expira_em: new Date(Date.now() + t.expires_in * 1000).toISOString() };
  await db.from('mp_contas').update(novo).eq('usuario', vendedor);
  return { ...c, ...novo };
}

export const dinheiro = (v: number) => Math.round(v * 100) / 100;
