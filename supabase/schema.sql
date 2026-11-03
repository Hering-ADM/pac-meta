-- Pac-Meta: contas e mercado entre jogadores (pagamento pelo Mercado Pago, direto para o vendedor).
-- Rode este arquivo inteiro no Supabase: painel do projeto › SQL Editor › New query › colar › Run.
-- Pode rodar de novo sem perder dados: tudo usa "if not exists" / "or replace".

-- ---------- perfis ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '' check (char_length(nome) <= 60),
  bio text not null default '' check (char_length(bio) <= 400),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  cidade text not null default '' check (char_length(cidade) <= 60),
  papel text not null default 'leitor' check (papel in ('leitor', 'admin')),
  -- vendedor: nenhum → pedido (pediu para vender) → aprovado / recusado / bloqueado (decisão do admin)
  vendedor text not null default 'nenhum' check (vendedor in ('nenhum', 'pedido', 'aprovado', 'recusado', 'bloqueado')),
  vendedor_msg text not null default '' check (char_length(vendedor_msg) <= 500),
  criado_em timestamptz not null default now()
);
alter table public.profiles add column if not exists cidade text not null default '' check (char_length(cidade) <= 60);
alter table public.profiles add column if not exists vendedor text not null default 'nenhum' check (vendedor in ('nenhum', 'pedido', 'aprovado', 'recusado', 'bloqueado'));
alter table public.profiles add column if not exists vendedor_msg text not null default '' check (char_length(vendedor_msg) <= 500);

create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 60),
    case when coalesce(new.raw_user_meta_data->>'avatar_url', '') ~ '^https://' then new.raw_user_meta_data->>'avatar_url' end
  ) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users for each row execute function public.novo_usuario();

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and papel = 'admin');
$$;

-- a pessoa só pode: editar nome/bio/cidade e pedir para vender (nenhum/recusado → pedido). Papel e aprovação, só o admin.
create or replace function public.protege_perfil() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or public.eh_admin() then return new; end if;
  new.papel := old.papel;
  if new.vendedor is distinct from old.vendedor then
    if not (new.vendedor = 'pedido' and old.vendedor in ('nenhum', 'recusado')) then new.vendedor := old.vendedor; end if;
  end if;
  return new;
end $$;
drop trigger if exists protege_papel on public.profiles;
drop trigger if exists protege_perfil on public.profiles;
create trigger protege_perfil before update on public.profiles for each row execute function public.protege_perfil();

-- ---------- conta Mercado Pago do vendedor (privada: só as funções do servidor leem) ----------
create table if not exists public.mp_contas (
  usuario uuid primary key references public.profiles (id) on delete cascade,
  mp_user_id bigint not null unique,
  access_token text not null,
  refresh_token text not null,
  public_key text,
  expira_em timestamptz not null,
  ligado_em timestamptz not null default now()
);
create table if not exists public.mp_estados (     -- "state" do OAuth, válido por 15 minutos
  state text primary key,
  usuario uuid not null references public.profiles (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create or replace function public.eh_vendedor(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = u and vendedor = 'aprovado')
     and exists (select 1 from public.mp_contas where usuario = u);
$$;

-- o próprio vendedor só consegue saber se está ligado
create or replace function public.mp_ligado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mp_contas where usuario = auth.uid());
$$;

-- ---------- anúncios ----------
create table if not exists public.anuncios (
  id bigint generated always as identity primary key,
  vendedor uuid not null references public.profiles (id) on delete cascade,
  tipo text not null check (tipo in ('carta', 'deck')),
  carta text check (carta is null or char_length(carta) <= 160),       -- nome em inglês (tipo carta)
  deck_ref text check (deck_ref is null or char_length(deck_ref) <= 80), -- slug do deck de Commander (opcional)
  titulo text not null check (char_length(titulo) between 3 and 120),
  descricao text not null default '' check (char_length(descricao) <= 2000),
  edicao text not null default '' check (char_length(edicao) <= 60),
  estado text not null default 'NM' check (estado in ('M', 'NM', 'SP', 'MP', 'HP', 'D')),
  idioma text not null default 'EN' check (idioma in ('EN', 'PT', 'JP', 'ES', 'IT', 'DE', 'FR', 'CN', 'KO', 'RU', 'Outro')),
  foil boolean not null default false,
  preco numeric(10, 2) not null check (preco >= 1 and preco <= 100000),
  quantidade int not null default 1 check (quantidade between 0 and 999),
  envio boolean not null default true,
  frete numeric(8, 2) not null default 0 check (frete >= 0 and frete <= 500),
  retirada boolean not null default true,                               -- retirada na Pac Deck
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'esgotado', 'removido')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (envio or retirada),
  check (tipo <> 'carta' or carta is not null)
);
create index if not exists anuncios_carta on public.anuncios (lower(carta)) where status = 'ativo';
create index if not exists anuncios_ativos on public.anuncios (status, criado_em desc);

create or replace function public.regras_anuncio() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  if new.quantidade = 0 and new.status = 'ativo' then new.status := 'esgotado'; end if;
  if auth.uid() is null or public.eh_admin() or current_setting('pacmeta.interno', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then
    new.vendedor := auth.uid();
    if not public.eh_vendedor(auth.uid()) then raise exception 'Só vendedores aprovados, com o Mercado Pago ligado, podem anunciar.'; end if;
  else
    new.vendedor := old.vendedor;
    if old.status = 'removido' then raise exception 'Este anúncio foi removido pela moderação.'; end if;
    if new.status = 'removido' and old.status <> 'removido' then new.status := 'pausado'; end if;
  end if;
  if new.quantidade = 0 and new.status = 'ativo' then new.status := 'esgotado'; end if;
  if tg_op = 'UPDATE' and new.quantidade > 0 and old.status = 'esgotado' and new.status = 'esgotado' then new.status := 'ativo'; end if;
  return new;
end $$;
drop trigger if exists regras_anuncio on public.anuncios;
create trigger regras_anuncio before insert or update on public.anuncios for each row execute function public.regras_anuncio();

-- ---------- pedidos de compra ("procuro esta carta") ----------
create table if not exists public.procuras (
  id bigint generated always as identity primary key,
  usuario uuid not null references public.profiles (id) on delete cascade,
  carta text not null check (char_length(carta) between 2 and 160),
  quantidade int not null default 1 check (quantidade between 1 and 99),
  preco_max numeric(10, 2) check (preco_max is null or (preco_max > 0 and preco_max <= 100000)),
  obs text not null default '' check (char_length(obs) <= 300),
  status text not null default 'aberto' check (status in ('aberto', 'fechado', 'removido')),
  criado_em timestamptz not null default now()
);
create index if not exists procuras_abertas on public.procuras (status, criado_em desc);

-- ---------- pedidos (compras) ----------
-- criados só pela função "checkout" (servidor); comprador e vendedor só atualizam o andamento da entrega.
create table if not exists public.pedidos (
  id bigint generated always as identity primary key,
  anuncio bigint not null references public.anuncios (id),
  comprador uuid not null references public.profiles (id),
  vendedor uuid not null references public.profiles (id),
  titulo text not null,
  quantidade int not null check (quantidade >= 1),
  preco_unit numeric(10, 2) not null,
  frete numeric(8, 2) not null default 0,
  total numeric(10, 2) not null,
  comissao numeric(10, 2) not null,
  entrega text not null check (entrega in ('envio', 'retirada')),
  endereco jsonb,                                        -- só para envio
  status text not null default 'aguardando' check (status in ('aguardando', 'pago', 'enviado', 'entregue', 'cancelado', 'reembolsado')),
  rastreio text not null default '' check (char_length(rastreio) <= 60),
  mp_preferencia text,
  mp_pagamento bigint,
  mp_status text,
  expira_em timestamptz not null default now() + interval '30 minutes',
  criado_em timestamptz not null default now(),
  pago_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index if not exists pedidos_comprador on public.pedidos (comprador, criado_em desc);
create index if not exists pedidos_vendedor on public.pedidos (vendedor, criado_em desc);

create or replace function public.regras_pedido() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  if auth.uid() is null or public.eh_admin() or current_setting('pacmeta.interno', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then raise exception 'Pedidos são criados pelo checkout.'; end if;
  -- só o status muda, e só nestes passos: vendedor marca enviado (com rastreio); comprador marca entregue
  if (new.anuncio, new.comprador, new.vendedor, new.quantidade, new.total, new.comissao, new.entrega, new.mp_pagamento)
     is distinct from (old.anuncio, old.comprador, old.vendedor, old.quantidade, old.total, old.comissao, old.entrega, old.mp_pagamento)
     or new.endereco is distinct from old.endereco then
    raise exception 'Só o andamento da entrega pode ser alterado.';
  end if;
  if new.status is distinct from old.status then
    if not ((auth.uid() = old.vendedor and old.status = 'pago' and new.status = 'enviado')
         or (auth.uid() = old.comprador and old.status in ('pago', 'enviado') and new.status = 'entregue')) then
      raise exception 'Mudança de status não permitida.';
    end if;
  end if;
  if new.rastreio is distinct from old.rastreio and auth.uid() <> old.vendedor then new.rastreio := old.rastreio; end if;
  return new;
end $$;
drop trigger if exists regras_pedido on public.pedidos;
create trigger regras_pedido before insert or update on public.pedidos for each row execute function public.regras_pedido();

-- quanto ainda dá para comprar de um anúncio (desconta pedidos aguardando pagamento que ainda não expiraram)
create or replace function public.disponivel(a bigint) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, an.quantidade - coalesce((select sum(p.quantidade) from public.pedidos p
           where p.anuncio = an.id and p.status = 'aguardando' and p.expira_em > now()), 0))::int
  from public.anuncios an where an.id = a;
$$;

-- confirma o pagamento de um pedido (só o servidor chama): marca pago e baixa o estoque uma única vez
create or replace function public.confirmar_pagamento(p bigint, pagamento bigint, st text) returns text
language plpgsql security definer set search_path = public as $$
declare ped public.pedidos;
begin
  select * into ped from public.pedidos where id = p for update;
  if not found then return 'pedido inexistente'; end if;
  perform set_config('pacmeta.interno', '1', true);
  update public.pedidos set mp_pagamento = pagamento, mp_status = st where id = p;
  if st = 'approved' and ped.status = 'aguardando' then
    update public.pedidos set status = 'pago', pago_em = now() where id = p;
    update public.anuncios set quantidade = greatest(0, quantidade - ped.quantidade) where id = ped.anuncio;
    return 'pago';
  elsif st in ('refunded', 'charged_back') and ped.status not in ('cancelado', 'reembolsado') then
    update public.pedidos set status = 'reembolsado' where id = p;
    return 'reembolsado';
  elsif st in ('cancelled', 'rejected') and ped.status = 'aguardando' then
    update public.pedidos set status = 'cancelado' where id = p;
    return 'cancelado';
  end if;
  return 'sem mudança';
end $$;
revoke all on function public.confirmar_pagamento(bigint, bigint, text) from public, anon, authenticated;

-- ---------- favoritos ----------
create table if not exists public.favorites (
  usuario uuid not null references public.profiles (id) on delete cascade,
  tipo text not null check (tipo in ('deck', 'carta', 'lista')),
  ref text not null check (char_length(ref) <= 200),
  titulo text not null default '' check (char_length(titulo) <= 120),
  criado_em timestamptz not null default now(),
  primary key (usuario, tipo, ref)
);

-- ---------- segurança por linha (RLS) ----------
alter table public.profiles enable row level security;
alter table public.mp_contas enable row level security;   -- sem políticas: ninguém lê pelo site, só o servidor
alter table public.mp_estados enable row level security;  -- idem
revoke all on public.mp_contas, public.mp_estados from anon, authenticated;
alter table public.anuncios enable row level security;
alter table public.procuras enable row level security;
alter table public.pedidos enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "perfis: todos leem" on public.profiles;
create policy "perfis: todos leem" on public.profiles for select using (true);
drop policy if exists "perfis: dono edita" on public.profiles;
create policy "perfis: dono edita" on public.profiles for update using (id = auth.uid() or public.eh_admin());

drop policy if exists "anuncios: ler" on public.anuncios;
create policy "anuncios: ler" on public.anuncios for select using (status in ('ativo', 'esgotado') or vendedor = auth.uid() or public.eh_admin());
drop policy if exists "anuncios: vendedor cria" on public.anuncios;
create policy "anuncios: vendedor cria" on public.anuncios for insert with check (vendedor = auth.uid() and public.eh_vendedor(auth.uid()));
drop policy if exists "anuncios: vendedor ou admin edita" on public.anuncios;
create policy "anuncios: vendedor ou admin edita" on public.anuncios for update using (vendedor = auth.uid() or public.eh_admin());

drop policy if exists "procuras: ler" on public.procuras;
create policy "procuras: ler" on public.procuras for select using (status = 'aberto' or usuario = auth.uid() or public.eh_admin());
drop policy if exists "procuras: logado cria" on public.procuras;
create policy "procuras: logado cria" on public.procuras for insert with check (usuario = auth.uid());
drop policy if exists "procuras: dono ou admin edita" on public.procuras;
create policy "procuras: dono ou admin edita" on public.procuras for update using (usuario = auth.uid() or public.eh_admin());

drop policy if exists "pedidos: partes leem" on public.pedidos;
create policy "pedidos: partes leem" on public.pedidos for select using (comprador = auth.uid() or vendedor = auth.uid() or public.eh_admin());
drop policy if exists "pedidos: partes atualizam" on public.pedidos;
create policy "pedidos: partes atualizam" on public.pedidos for update using (comprador = auth.uid() or vendedor = auth.uid() or public.eh_admin());

drop policy if exists "favoritos: só o dono" on public.favorites;
create policy "favoritos: só o dono" on public.favorites for all using (usuario = auth.uid()) with check (usuario = auth.uid());

-- ---------- excluir a própria conta (LGPD) ----------
-- quem tem pedido em andamento precisa concluir antes; pedidos concluídos ficam guardados (obrigação fiscal), sem o endereço.
create or replace function public.excluir_minha_conta() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if exists (select 1 from public.pedidos where (comprador = auth.uid() or vendedor = auth.uid()) and status in ('pago', 'enviado')) then
    raise exception 'Você tem pedidos em andamento. Conclua a entrega antes de excluir a conta.';
  end if;
  perform set_config('pacmeta.interno', '1', true);
  update public.pedidos set endereco = null where comprador = auth.uid() or vendedor = auth.uid();
  update public.anuncios set status = 'removido' where vendedor = auth.uid();
  perform set_config('pacmeta.interno', '', true);
  delete from public.mp_contas where usuario = auth.uid();
  update public.profiles set nome = 'Conta excluída', bio = '', avatar_url = null, cidade = '', vendedor = 'bloqueado', vendedor_msg = '' where id = auth.uid();
  delete from public.favorites where usuario = auth.uid();
  delete from public.procuras where usuario = auth.uid();
  -- o login é apagado; o perfil anônimo fica só para manter o histórico de pedidos
  if not exists (select 1 from public.pedidos where comprador = auth.uid() or vendedor = auth.uid()) then
    delete from auth.users where id = auth.uid();
  else
    update auth.users set email = 'excluido-' || id || '@pacmeta.invalid', raw_user_meta_data = '{}'::jsonb, encrypted_password = '' where id = auth.uid();
  end if;
end $$;
revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;

-- ---------- tornar o João administrador ----------
-- Depois de entrar no site pela primeira vez com joaohhp2003@gmail.com, rode:
-- update public.profiles set papel = 'admin', vendedor = 'aprovado' where id = (select id from auth.users where email = 'joaohhp2003@gmail.com');
