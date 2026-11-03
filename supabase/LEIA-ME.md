# Mercado do Pac-Meta: como ativar

O mercado usa o **Supabase** (contas, banco de dados e funções de servidor) e o **Mercado Pago** (pagamentos com repasse direto ao vendedor e comissão de 3% para o Pac-Meta). Enquanto `SB_URL` e `SB_KEY` estiverem vazios em `site/conta.js`, o site mostra o mercado como "em breve".

## 1. Supabase
1. Crie o projeto `pac-meta` em supabase.com (região São Paulo).
2. **SQL Editor › New query**: cole `supabase/schema.sql` inteiro e clique em **Run**.
3. **Authentication › URL Configuration**: Site URL `https://pacmeta.com.br`; Redirect URLs `https://pacmeta.com.br/**`.
4. **Authentication › Providers**: e-mail já vem ligado. Google: precisa de um cliente OAuth do Google Cloud (pode ficar para depois).
5. **Project Settings › API**: copie a *Project URL* e a chave *anon public* para `SB_URL` e `SB_KEY` em `site/conta.js`.

## 2. Mercado Pago
1. Em mercadopago.com.br/developers, com a conta que vai receber as comissões, crie uma aplicação (Checkout Pro, modelo marketplace / Split de Pagamentos 1:1).
2. **URL de redirecionamento** da aplicação: `https://<projeto>.supabase.co/functions/v1/mp-retorno`.
3. **Webhooks**: URL `https://<projeto>.supabase.co/functions/v1/mp-webhook`, evento *Pagamentos*. Guarde a chave secreta da assinatura.
4. Anote o **Client ID** e o **Client Secret** da aplicação.

## 3. Funções do servidor
Em **Edge Functions**, crie `mp-conectar`, `mp-retorno`, `checkout` e `mp-webhook` com o código de `supabase/functions/` (cada uma usa `_shared/comum.ts`). Em `mp-retorno` e `mp-webhook`, desligue "Verify JWT". Em **Edge Functions › Secrets**:

| Nome | Valor |
|---|---|
| `MP_CLIENT_ID` | Client ID da aplicação |
| `MP_CLIENT_SECRET` | Client Secret |
| `MP_WEBHOOK_SECRET` | chave secreta dos webhooks |
| `SITE_URL` | `https://pacmeta.com.br` |
| `COMISSAO` | `0.03` |
| `MP_TESTE` | `1` enquanto estiver testando com contas de teste; apague para valer |

## 4. Admin
Entre no site com `joaohhp2003@gmail.com` e rode no SQL Editor a última linha comentada de `schema.sql` para virar administrador.

## 5. Teste antes de abrir
Com `MP_TESTE=1` e as contas de teste do Mercado Pago (um vendedor e um comprador de teste), faça uma compra completa: aprovar vendedor → ligar Mercado Pago → anunciar → comprar → ver o pedido como "Pago" → marcar enviado → confirmar recebimento.
