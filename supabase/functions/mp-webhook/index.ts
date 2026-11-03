// Notificações do Mercado Pago: confere a assinatura, busca o pagamento na conta do vendedor e atualiza o pedido.
import { admin, MP_WEBHOOK_SECRET, tokenDoVendedor } from '../_shared/comum.ts';

async function hmacHex(chave: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const ok = () => new Response('ok', { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok();
  const url = new URL(req.url);
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  const tipo = body.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const dataId = String(url.searchParams.get('data.id') || body?.data?.id || '');
  if (tipo !== 'payment' || !dataId) return ok();

  // assinatura: manifest "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" com HMAC-SHA256 da chave secreta
  const sig = req.headers.get('x-signature') || '', rid = req.headers.get('x-request-id') || '';
  const parts = Object.fromEntries(sig.split(',').map((p) => p.trim().split('=').map((x) => x.trim())));
  const manifest = `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};request-id:${rid};ts:${parts.ts};`;
  if (!MP_WEBHOOK_SECRET || !parts.v1 || (await hmacHex(MP_WEBHOOK_SECRET, manifest)) !== parts.v1) {
    console.warn('assinatura inválida', { dataId, rid });
    return new Response('assinatura inválida', { status: 401 });
  }

  const db = admin();
  const pedidoId = Number(url.searchParams.get('pedido'));
  const { data: ped } = await db.from('pedidos').select('*').eq('id', pedidoId).maybeSingle();
  if (!ped) return ok();
  let pay;
  try {
    const c = await tokenDoVendedor(ped.vendedor);
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${c.access_token}` } });
    if (!r.ok) { console.error('pagamento não encontrado', r.status); return new Response('erro', { status: 500 }); }
    pay = await r.json();
  } catch (err) { console.error(err); return new Response('erro', { status: 500 }); }
  // o pagamento precisa ser deste pedido e no valor certo
  if (String(pay.external_reference) !== String(ped.id)) { console.warn('referência diferente', pay.external_reference, ped.id); return ok(); }
  if (pay.status === 'approved' && Math.abs(Number(pay.transaction_amount) - Number(ped.total)) > 0.01) {
    console.error('valor diferente do pedido', pay.transaction_amount, ped.total);
    return ok();
  }
  const { data: res, error } = await db.rpc('confirmar_pagamento', { p: ped.id, pagamento: Number(pay.id), st: String(pay.status) });
  if (error) { console.error(error); return new Response('erro', { status: 500 }); }
  console.log('pedido', ped.id, pay.status, res);
  return ok();
});
