// Cria o pedido e a preferência de pagamento no Mercado Pago, em nome do vendedor, com a comissão do Pac-Meta.
import { admin, COMISSAO, CORS, dinheiro, erro, FUNCOES, json, MP_TESTE, SITE, tokenDoVendedor, usuario } from '../_shared/comum.ts';

const UF = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;
const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro('Use POST.', 405);
  const u = await usuario(req); if (!u) return erro('Entre na sua conta para comprar.', 401);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return erro('Pedido inválido.'); }
  const id = Number(b.anuncio), qtd = Math.floor(Number(b.quantidade || 1)), entrega = b.entrega === 'envio' ? 'envio' : 'retirada';
  if (!id || qtd < 1 || qtd > 99) return erro('Quantidade inválida.');
  const db = admin();
  const { data: a } = await db.from('anuncios').select('*').eq('id', id).maybeSingle();
  if (!a || a.status !== 'ativo') return erro('Este anúncio não está mais disponível.');
  if (a.vendedor === u.id) return erro('Você não pode comprar o seu próprio anúncio.');
  if (entrega === 'envio' && !a.envio) return erro('Este vendedor não faz envio. Escolha retirada na Pac Deck.');
  if (entrega === 'retirada' && !a.retirada) return erro('Este vendedor só faz envio.');
  const { data: vend } = await db.from('profiles').select('vendedor').eq('id', a.vendedor).maybeSingle();
  if (!vend || vend.vendedor !== 'aprovado') return erro('Este vendedor não está vendendo no momento.');
  const { data: disp } = await db.rpc('disponivel', { a: id });
  if ((disp ?? 0) < qtd) return erro(disp ? `Só há ${disp} disponível agora.` : 'Esgotado no momento.');

  let endereco = null;
  if (entrega === 'envio') {
    const e = (b.endereco || {}) as Record<string, unknown>;
    endereco = { nome: txt(e.nome, 80), cep: txt(e.cep, 9).replace(/\D/g, ''), rua: txt(e.rua, 120), numero: txt(e.numero, 12), complemento: txt(e.complemento, 60), bairro: txt(e.bairro, 60), cidade: txt(e.cidade, 60), uf: txt(e.uf, 2).toUpperCase(), telefone: txt(e.telefone, 20) };
    if (!endereco.nome || endereco.cep.length !== 8 || !endereco.rua || !endereco.numero || !endereco.cidade || !UF.test(endereco.uf)) return erro('Preencha o endereço completo (nome, CEP, rua, número, cidade e UF).');
  }
  const frete = entrega === 'envio' ? dinheiro(Number(a.frete)) : 0;
  const total = dinheiro(Number(a.preco) * qtd + frete);
  const comissao = dinheiro(total * COMISSAO);

  let seller;
  try { seller = await tokenDoVendedor(a.vendedor); } catch (err) { console.error(err); return erro('O vendedor precisa religar o Mercado Pago. Tente mais tarde.'); }

  const expira = new Date(Date.now() + 30 * 60e3);
  const { data: ped, error: pe } = await db.from('pedidos').insert({
    anuncio: id, comprador: u.id, vendedor: a.vendedor, titulo: a.titulo, quantidade: qtd, preco_unit: a.preco,
    frete, total, comissao, entrega, endereco, expira_em: expira.toISOString(),
  }).select('id').single();
  if (pe || !ped) { console.error(pe); return erro('Não deu para criar o pedido. Tente de novo.', 500); }

  const volta = `${SITE}/?mp=retorno&pedido=${ped.id}`;
  const items = [{ id: `anuncio-${id}`, title: a.titulo.slice(0, 120), description: `Pac-Meta · ${a.estado} · ${a.idioma}${a.foil ? ' · foil' : ''}`, category_id: 'others', quantity: qtd, unit_price: Number(a.preco), currency_id: 'BRL' }];
  if (frete > 0) items.push({ id: `frete-${id}`, title: 'Frete', description: 'Envio pelo vendedor', category_id: 'others', quantity: 1, unit_price: frete, currency_id: 'BRL' });
  const pref = {
    items, marketplace_fee: comissao, external_reference: String(ped.id),
    payer: { email: u.email },
    notification_url: `${FUNCOES}/mp-webhook?pedido=${ped.id}`,
    back_urls: { success: volta, pending: volta, failure: volta }, auto_return: 'approved',
    expires: true, expiration_date_to: expira.toISOString(),
    statement_descriptor: 'PACMETA',
  };
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST', headers: { 'Authorization': `Bearer ${seller.access_token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `pedido-${ped.id}` },
    body: JSON.stringify(pref),
  });
  const d = await r.json();
  if (!r.ok || !d.id) {
    console.error('preferência recusada', r.status, d);
    await db.from('pedidos').update({ status: 'cancelado', mp_status: 'preferencia_recusada' }).eq('id', ped.id);
    return erro('O Mercado Pago não aceitou o pagamento agora. Tente de novo em instantes.', 502);
  }
  await db.from('pedidos').update({ mp_preferencia: d.id }).eq('id', ped.id);
  return json({ pedido: ped.id, url: MP_TESTE ? (d.sandbox_init_point || d.init_point) : d.init_point });
});
