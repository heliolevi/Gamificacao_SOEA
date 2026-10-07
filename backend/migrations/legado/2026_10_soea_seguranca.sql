-- =====================================================================
-- SOEA · Endurecimento de autenticação e banco
-- Rode inteiro no SQL Editor do Supabase (é idempotente: pode rodar de novo).
--
-- O que este arquivo faz:
--   1. users: email_verified_at, token_version e e-mail único (case-insensitive)
--   2. pending_registrations: cadastro só vira conta depois do código do e-mail
--   3. auth_codes: códigos de redefinição de senha, 2FA de admin e verificação
--   4. sessions: refresh tokens opacos (só o hash fica salvo) com rotação
--   5. rate_limits: contador de tentativas NO BANCO (vale entre instâncias serverless)
--   6. Funções atômicas usadas pelo backend (rl_hit, consume_registration, ...)
--   7. RLS em TODAS as tabelas do schema public, sem nenhuma política para anon/authenticated
--
-- PRÉ-REQUISITO: o backend precisa usar a chave service_role (ou sb_secret_...).
-- Com a chave anon, depois deste script o backend não lê mais nada (é o objetivo).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------
alter table public.users add column if not exists email_verified_at timestamptz;
alter table public.users add column if not exists token_version integer not null default 0;

-- E-mail único sem diferenciar maiúsculas. Se já houver duplicados, o índice não é
-- criado e um aviso aparece: limpe os duplicados e rode o script de novo.
do $$
begin
  create unique index if not exists users_email_lower_key on public.users (lower(email));
exception when unique_violation then
  raise warning 'Há e-mails duplicados em users (ignorando maiúsculas). Índice único NÃO criado.';
end $$;

-- Contas antigas NÃO são marcadas como verificadas: no próximo login o usuário
-- recebe um código por e-mail e só então a conta passa a valer.

-- ---------------------------------------------------------------------
-- 2. Cadastros pendentes (a conta só existe depois do código)
-- ---------------------------------------------------------------------
create table if not exists public.pending_registrations (
  email       text primary key check (email = lower(email)),
  attempt_id  uuid not null default gen_random_uuid(),  -- muda a cada /iniciar
  payload     jsonb not null,                            -- dados do cadastro (senha já com hash)
  otp_hash    text not null,                             -- HMAC do código, nunca o código
  attempts    smallint not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists pending_registrations_expires_idx on public.pending_registrations (expires_at);

-- ---------------------------------------------------------------------
-- 3. Códigos de uso único ligados a uma conta
-- ---------------------------------------------------------------------
create table if not exists public.auth_codes (
  id_user     uuid not null references public.users (id_user) on delete cascade,
  purpose     text not null check (purpose in ('reset_password', 'login_2fa', 'verify_email')),
  otp_hash    text not null,
  attempts    smallint not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (id_user, purpose)
);

-- ---------------------------------------------------------------------
-- 4. Sessões (refresh token rotativo)
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
  id             uuid primary key default gen_random_uuid(),
  id_user        uuid not null references public.users (id_user) on delete cascade,
  family_id      uuid not null,
  refresh_hash   text not null unique,      -- sha256 do token; o token em si só existe no cookie
  token_version  integer not null,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  user_agent     text,
  ip             text
);
create index if not exists sessions_user_idx   on public.sessions (id_user);
create index if not exists sessions_family_idx on public.sessions (family_id);

-- ---------------------------------------------------------------------
-- 5. Rate limit no banco
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------
-- 6. Funções atômicas
-- ---------------------------------------------------------------------

-- Conta uma tentativa na janela fixa atual. Retorna true se ainda está dentro do limite.
create or replace function public.rl_hit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into rate_limits (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = rate_limits.hits + 1
  returning hits into n;

  -- limpeza oportunista de janelas velhas
  if random() < 0.02 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return n <= p_limit;
end $$;

-- Valida o código do cadastro e cria a conta na MESMA transação.
-- p_password_ok: o backend confere a senha digitada contra o hash do payload antes
-- (impede que alguém troque o payload entre o envio do código e a confirmação).
create or replace function public.consume_registration(
  p_email text, p_attempt_id uuid, p_otp_hash text, p_password_ok boolean, p_max_attempts integer
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  r pending_registrations%rowtype;
  novo_id uuid;
begin
  select * into r from pending_registrations where email = p_email for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if r.attempt_id <> p_attempt_id then
    return jsonb_build_object('status', 'stale');
  end if;
  if r.expires_at < now() then
    delete from pending_registrations where email = p_email;
    return jsonb_build_object('status', 'expired');
  end if;

  if not p_password_ok or r.otp_hash <> p_otp_hash then
    if r.attempts + 1 >= p_max_attempts then
      delete from pending_registrations where email = p_email;
      return jsonb_build_object('status', 'locked');
    end if;
    update pending_registrations set attempts = attempts + 1 where email = p_email;
    return jsonb_build_object('status', 'invalid', 'restantes', p_max_attempts - (r.attempts + 1));
  end if;

  delete from pending_registrations where email = p_email;

  if exists (select 1 from users where lower(email) = p_email) then
    return jsonb_build_object('status', 'exists');
  end if;

  -- jsonb_populate_record converte texto → enum/date sem precisar saber o nome dos tipos
  insert into users (nome, data_nasc, email, senha_hash, telefone, escola,
                     pontos, data_registro, email_verified_at, token_version)
  select nome, data_nasc, email, senha_hash, telefone, escola,
         0, now(), now(), 0
  from jsonb_populate_record(null::users, r.payload || jsonb_build_object('email', p_email))
  returning id_user into novo_id;

  return jsonb_build_object('status', 'ok', 'id_user', novo_id);
exception when unique_violation then
  return jsonb_build_object('status', 'exists');
end $$;

-- Valida um código ligado a uma conta. Efeitos colaterais conforme o propósito:
--   verify_email   → marca email_verified_at
--   reset_password → troca a senha, marca e-mail verificado, derruba todas as sessões
create or replace function public.consume_auth_code(
  p_id_user uuid, p_purpose text, p_otp_hash text, p_max_attempts integer,
  p_new_senha_hash text default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  c auth_codes%rowtype;
begin
  select * into c from auth_codes where id_user = p_id_user and purpose = p_purpose for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if c.expires_at < now() then
    delete from auth_codes where id_user = p_id_user and purpose = p_purpose;
    return jsonb_build_object('status', 'expired');
  end if;
  if c.otp_hash <> p_otp_hash then
    if c.attempts + 1 >= p_max_attempts then
      delete from auth_codes where id_user = p_id_user and purpose = p_purpose;
      return jsonb_build_object('status', 'locked');
    end if;
    update auth_codes set attempts = attempts + 1 where id_user = p_id_user and purpose = p_purpose;
    return jsonb_build_object('status', 'invalid', 'restantes', p_max_attempts - (c.attempts + 1));
  end if;

  delete from auth_codes where id_user = p_id_user and purpose = p_purpose;

  if p_purpose = 'verify_email' or p_purpose = 'login_2fa' then
    update users set email_verified_at = coalesce(email_verified_at, now()) where id_user = p_id_user;
  elsif p_purpose = 'reset_password' then
    if p_new_senha_hash is null then
      raise exception 'p_new_senha_hash obrigatório para reset_password';
    end if;
    update users
       set senha_hash = p_new_senha_hash,
           email_verified_at = coalesce(email_verified_at, now()),
           token_version = token_version + 1
     where id_user = p_id_user;
    update sessions set revoked_at = now() where id_user = p_id_user and revoked_at is null;
  end if;

  return jsonb_build_object('status', 'ok');
end $$;

-- Troca um refresh token por outro (rotação). Reuso de token já trocado = roubo
-- provável → a família inteira de sessões é derrubada.
create or replace function public.rotate_session(
  p_old_hash text, p_new_hash text, p_ttl_seconds integer,
  p_user_agent text default null, p_ip text default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  s sessions%rowtype;
  tv integer;
begin
  select * into s from sessions where refresh_hash = p_old_hash for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if s.revoked_at is not null then
    -- Duas abas renovando ao mesmo tempo: a segunda chega com o token que acabou
    -- de ser trocado. Dentro de 30 s tratamos como corrida, não como roubo.
    if s.revoked_at > now() - interval '30 seconds'
       and exists (select 1 from sessions where family_id = s.family_id and revoked_at is null) then
      return jsonb_build_object('status', 'race');
    end if;
    update sessions set revoked_at = coalesce(revoked_at, now()) where family_id = s.family_id;
    return jsonb_build_object('status', 'reuse', 'id_user', s.id_user);
  end if;

  if s.expires_at < now() then
    update sessions set revoked_at = now() where id = s.id;
    return jsonb_build_object('status', 'expired');
  end if;

  select token_version into tv from users where id_user = s.id_user;
  if not found or tv <> s.token_version then
    update sessions set revoked_at = coalesce(revoked_at, now()) where family_id = s.family_id;
    return jsonb_build_object('status', 'revoked');
  end if;

  update sessions set revoked_at = now() where id = s.id;
  insert into sessions (id_user, family_id, refresh_hash, token_version, expires_at, user_agent, ip)
  values (s.id_user, s.family_id, p_new_hash, s.token_version,
          now() + make_interval(secs => p_ttl_seconds), p_user_agent, p_ip);

  return jsonb_build_object('status', 'ok', 'id_user', s.id_user, 'token_version', s.token_version);
end $$;

-- Derruba todas as sessões de um usuário (sair de todos os aparelhos, conta comprometida…)
create or replace function public.bump_token_version(p_id_user uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  tv integer;
begin
  update users set token_version = token_version + 1 where id_user = p_id_user returning token_version into tv;
  update sessions set revoked_at = now() where id_user = p_id_user and revoked_at is null;
  return tv;
end $$;

-- ---------------------------------------------------------------------
-- 7. RLS e privilégios
-- ---------------------------------------------------------------------

-- 7a. RLS ligado em todas as tabelas do schema public
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- 7b. Remove qualquer política que valha para anon/authenticated/public
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and roles && array['anon', 'authenticated', 'public']::name[]
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice 'Política removida: %.%', p.tablename, p.policyname;
  end loop;
end $$;

-- 7c. Sem privilégios diretos para anon/authenticated (defesa em profundidade além do RLS)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables    in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'revoke all on all functions in schema public from anon';
    execute 'alter default privileges in schema public revoke all on tables    from anon';
    execute 'alter default privileges in schema public revoke all on sequences from anon';
    execute 'alter default privileges in schema public revoke all on functions from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables    in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'revoke all on all functions in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables    from authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from authenticated';
    execute 'alter default privileges in schema public revoke all on functions from authenticated';
  end if;
end $$;

-- Funções de auth: só o backend (service_role) executa.
revoke all on function public.rl_hit(text, integer, integer)                                   from public;
revoke all on function public.consume_registration(text, uuid, text, boolean, integer)         from public;
revoke all on function public.consume_auth_code(uuid, text, text, integer, text)               from public;
revoke all on function public.rotate_session(text, text, integer, text, text)                  from public;
revoke all on function public.bump_token_version(uuid)                                         from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables    in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant execute on all functions in schema public to service_role';
  end if;
end $$;

-- Conferência rápida: deve listar todas as tabelas com rls = true
-- select tablename, rowsecurity as rls from pg_tables where schemaname = 'public' order by 1;
