-- Pac-Meta: contas, artigos com aprovação, comentários moderados e favoritos.
-- Rode este arquivo inteiro no Supabase: painel do projeto › SQL Editor › New query › colar › Run.
-- Pode rodar de novo sem perder dados: tudo usa "if not exists" / "or replace".

-- ---------- perfis ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '' check (char_length(nome) <= 60),
  bio text not null default '' check (char_length(bio) <= 400),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  papel text not null default 'leitor' check (papel in ('leitor', 'admin')),
  criado_em timestamptz not null default now()
);

-- cria o perfil quando a pessoa se cadastra (nome vem do Google ou do e-mail)
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

-- ninguém muda o próprio papel (só pelo SQL Editor)
create or replace function public.protege_papel() returns trigger
language plpgsql as $$
begin
  if new.papel is distinct from old.papel and auth.uid() is not null and not public.eh_admin() then new.papel := old.papel; end if;
  return new;
end $$;
drop trigger if exists protege_papel on public.profiles;
create trigger protege_papel before update on public.profiles for each row execute function public.protege_papel();

-- ---------- artigos ----------
create table if not exists public.articles (
  id bigint generated always as identity primary key,
  autor uuid not null references public.profiles (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 5 and 120),
  resumo text not null default '' check (char_length(resumo) <= 300),
  tema text not null default 'Outro' check (char_length(tema) <= 40),
  texto text not null check (char_length(texto) between 200 and 40000),
  status text not null default 'rascunho' check (status in ('rascunho', 'pendente', 'aprovado', 'recusado')),
  nota_revisao text not null default '' check (char_length(nota_revisao) <= 1000),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  publicado_em timestamptz
);
create index if not exists articles_status on public.articles (status, publicado_em desc);
create index if not exists articles_autor on public.articles (autor);

-- autor só pode mandar para revisão; só admin aprova, recusa e publica
create or replace function public.regras_artigo() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  if auth.uid() is null or public.eh_admin() then
    if new.status = 'aprovado' and new.publicado_em is null then new.publicado_em := now(); end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('rascunho', 'pendente') then new.status := 'pendente'; end if;
    new.nota_revisao := ''; new.publicado_em := null; new.autor := auth.uid();
  else
    if old.status = 'aprovado' then raise exception 'Artigo publicado só pode ser alterado pela revisão.'; end if;
    if new.status not in ('rascunho', 'pendente') then new.status := old.status; end if;
    new.nota_revisao := old.nota_revisao; new.publicado_em := old.publicado_em; new.autor := old.autor;
  end if;
  return new;
end $$;
drop trigger if exists regras_artigo on public.articles;
create trigger regras_artigo before insert or update on public.articles for each row execute function public.regras_artigo();

-- ---------- comentários ----------
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  artigo text not null check (char_length(artigo) <= 120),       -- slug do artigo fixo, ou u-<id> para artigo da comunidade
  autor uuid not null references public.profiles (id) on delete cascade,
  texto text not null check (char_length(texto) between 2 and 2000),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  criado_em timestamptz not null default now()
);
create index if not exists comments_artigo on public.comments (artigo, status, criado_em);

create or replace function public.regras_comentario() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.eh_admin() then
    if tg_op = 'INSERT' then new.status := 'pendente'; new.autor := auth.uid();
    else raise exception 'Comentários só são alterados pela moderação.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists regras_comentario on public.comments;
create trigger regras_comentario before insert or update on public.comments for each row execute function public.regras_comentario();

-- ---------- favoritos ----------
create table if not exists public.favorites (
  usuario uuid not null references public.profiles (id) on delete cascade,
  tipo text not null check (tipo in ('deck', 'carta', 'lista')),
  ref text not null check (char_length(ref) <= 200),             -- deck: formato/slug · carta: nome · lista: evento/índice
  titulo text not null default '' check (char_length(titulo) <= 120),
  criado_em timestamptz not null default now(),
  primary key (usuario, tipo, ref)
);

-- ---------- segurança por linha (RLS) ----------
alter table public.profiles enable row level security;
alter table public.articles enable row level security;
alter table public.comments enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "perfis: todos leem" on public.profiles;
create policy "perfis: todos leem" on public.profiles for select using (true);
drop policy if exists "perfis: dono edita" on public.profiles;
create policy "perfis: dono edita" on public.profiles for update using (id = auth.uid() or public.eh_admin());

drop policy if exists "artigos: ler" on public.articles;
create policy "artigos: ler" on public.articles for select using (status = 'aprovado' or autor = auth.uid() or public.eh_admin());
drop policy if exists "artigos: autor cria" on public.articles;
create policy "artigos: autor cria" on public.articles for insert with check (autor = auth.uid());
drop policy if exists "artigos: autor ou admin edita" on public.articles;
create policy "artigos: autor ou admin edita" on public.articles for update using (autor = auth.uid() or public.eh_admin());
drop policy if exists "artigos: autor ou admin apaga" on public.articles;
create policy "artigos: autor ou admin apaga" on public.articles for delete using ((autor = auth.uid() and status <> 'aprovado') or public.eh_admin());

drop policy if exists "comentarios: ler" on public.comments;
create policy "comentarios: ler" on public.comments for select using (status = 'aprovado' or autor = auth.uid() or public.eh_admin());
drop policy if exists "comentarios: logado cria" on public.comments;
create policy "comentarios: logado cria" on public.comments for insert with check (autor = auth.uid());
drop policy if exists "comentarios: admin modera" on public.comments;
create policy "comentarios: admin modera" on public.comments for update using (public.eh_admin());
drop policy if exists "comentarios: autor ou admin apaga" on public.comments;
create policy "comentarios: autor ou admin apaga" on public.comments for delete using (autor = auth.uid() or public.eh_admin());

drop policy if exists "favoritos: só o dono" on public.favorites;
create policy "favoritos: só o dono" on public.favorites for all using (usuario = auth.uid()) with check (usuario = auth.uid());

-- ---------- excluir a própria conta (LGPD) ----------
create or replace function public.excluir_minha_conta() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  delete from auth.users where id = auth.uid();   -- apaga perfil, artigos, comentários e favoritos em cascata
end $$;
revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;

-- ---------- tornar o João administrador ----------
-- Depois de entrar no site pela primeira vez com joaohhp2003@gmail.com, rode:
-- update public.profiles set papel = 'admin' where id = (select id from auth.users where email = 'joaohhp2003@gmail.com');
