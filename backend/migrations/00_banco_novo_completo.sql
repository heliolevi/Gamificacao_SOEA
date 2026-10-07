-- =====================================================================
-- SOEA · Caça QR — banco de dados COMPLETO, criado do zero
--
-- Funciona em qualquer Postgres 14+ (Neon, Supabase, Railway, Docker, local).
-- Cole o arquivo inteiro no editor SQL e rode UMA vez. Não há ALTER: tudo nasce pronto.
-- Cria só os objetos do SOEA; não mexe em nenhuma outra tabela que exista no banco.
--
-- Cria: 10 tabelas, gatilhos de pontos, funções de autenticação e RLS ligado
-- (só o backend acessa os dados).
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. JOGO
-- =====================================================================

-- Participantes
create table public.users (
  id_user            uuid primary key default gen_random_uuid(),
  nome               text not null,
  data_nasc          date,
  email              text not null,
  senha_hash         text,
  telefone           text,
  escola             text,             -- não é pedido no cadastro; fica para uso futuro
  curso_interesse    text,
  status_academico   text,
  pontos             integer not null default 0,
  xp                 integer not null default 0,
  is_admin           boolean not null default false,
  data_registro      timestamptz not null default now(),
  personal_code_hash text unique,      -- QR pessoal de networking
  email_verified_at  timestamptz,      -- preenchido quando o código do e-mail é confirmado
  token_version      integer not null default 0  -- muda para derrubar todas as sessões
);
create unique index users_email_lower_key on public.users (lower(email));
create index users_ranking_idx on public.users (pontos desc, data_registro asc) where not is_admin;

-- Perguntas bônus
create table public.perguntas (
  id_pergunta      uuid primary key default gen_random_uuid(),
  enunciado        text not null,
  tipo             text not null check (tipo in ('multipla_escolha', 'verdadeiro_falso')),
  alternativas     jsonb not null,
  resposta_correta text not null,
  pontos_rapido    integer not null default 0 check (pontos_rapido >= 0),
  pontos_lento     integer not null default 0 check (pontos_lento >= 0),
  criado_em        timestamptz not null default now()
);

-- QR Codes do evento
create table public.qrcodes (
  code_hash   text primary key,
  pontos      integer not null check (pontos >= 0),
  local       text not null,
  ativo       boolean not null default true,
  id_pergunta uuid references public.perguntas (id_pergunta) on delete set null,
  criado_em   timestamptz not null default now()
);

-- Capturas (cada QR vale uma vez por pessoa)
create table public.catch (
  id_catch   uuid primary key default gen_random_uuid(),
  id_user    uuid not null references public.users (id_user) on delete cascade,
  code_hash  text not null references public.qrcodes (code_hash) on delete cascade,
  catch_time timestamptz not null default now(),
  constraint catch_unico unique (id_user, code_hash)
);

-- Respostas às perguntas (uma por pessoa)
create table public.user_perguntas (
  id             uuid primary key default gen_random_uuid(),
  id_user        uuid not null references public.users (id_user) on delete cascade,
  id_pergunta    uuid not null references public.perguntas (id_pergunta) on delete cascade,
  resposta       text not null,
  tempo_segundos integer not null check (tempo_segundos >= 0),
  respondido_em  timestamptz not null default now(),
  constraint resposta_unica unique (id_user, id_pergunta)
);

-- Networking: QR de amigo (uma vez por dupla)
create table public.friend_scans (
  id         uuid primary key default gen_random_uuid(),
  scanner_id uuid not null references public.users (id_user) on delete cascade,
  scanned_id uuid not null references public.users (id_user) on delete cascade,
  created_at timestamptz not null default now(),
  constraint no_self_scan check (scanner_id <> scanned_id),
  constraint unique_pair unique (scanner_id, scanned_id)
);

-- =====================================================================
-- 2. AUTENTICAÇÃO
-- =====================================================================

-- Cadastros esperando o código do e-mail (a conta só existe depois dele)
create table public.pending_registrations (
  email       text primary key check (email = lower(email)),
  attempt_id  uuid not null default gen_random_uuid(),
  payload     jsonb not null,             -- dados do cadastro (senha já com hash)
  otp_hash    text not null,              -- HMAC do código, nunca o código
  attempts    smallint not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index pending_registrations_expires_idx on public.pending_registrations (expires_at);

-- Códigos de uso único de uma conta (senha nova, 2FA do admin, verificação)
create table public.auth_codes (
  id_user     uuid not null references public.users (id_user) on delete cascade,
  purpose     text not null check (purpose in ('reset_password', 'login_2fa', 'verify_email')),
  otp_hash    text not null,
  attempts    smallint not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (id_user, purpose)
);

-- Sessões (refresh token rotativo; só o hash fica salvo)
create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  id_user        uuid not null references public.users (id_user) on delete cascade,
  family_id      uuid not null,
  refresh_hash   text not null unique,
  token_version  integer not null,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  user_agent     text,
  ip             text
);
create index sessions_user_idx   on public.sessions (id_user);
create index sessions_family_idx on public.sessions (family_id);

-- Limite de tentativas (vale entre várias instâncias do servidor)
create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);

-- =====================================================================
-- 3. PONTOS (somados pelo banco, na mesma transação)
-- =====================================================================

create function public.trg_soma_pontos_captura() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update users set pontos = pontos + coalesce((select pontos from qrcodes where code_hash = new.code_hash), 0)
  where id_user = new.id_user;
  return new;
end $$;

create trigger trg_atualiza_pontos after insert on public.catch
  for each row execute function public.trg_soma_pontos_captura();

create function public.trg_soma_pontos_resposta() returns trigger
language plpgsql security definer set search_path = public as $$
declare p perguntas;
begin
  select * into p from perguntas where id_pergunta = new.id_pergunta;
  if found and upper(new.resposta) = upper(p.resposta_correta) then
    update users
       set pontos = pontos + case when new.tempo_segundos <= 10 then p.pontos_rapido else p.pontos_lento end
     where id_user = new.id_user;
  end if;
  return new;
end $$;

create trigger trg_pontos_resposta after insert on public.user_perguntas
  for each row execute function public.trg_soma_pontos_resposta();

-- Opções de listas (rota /opcoes); devolve vazio se o tipo não existir
create function public.get_enum_values(enum_name text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(e.enumlabel order by e.enumsortorder), '{}')
  from pg_type t join pg_enum e on e.enumtypid = t.oid
  where t.typname = enum_name;
$$;

-- =====================================================================
-- 4. FUNÇÕES DE AUTENTICAÇÃO (atômicas)
-- =====================================================================

-- Conta uma tentativa na janela fixa atual. Retorna true se ainda está dentro do limite.
create function public.rl_hit(p_key text, p_window_seconds integer, p_limit integer)
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
create function public.consume_registration(
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

  -- jsonb_populate_record converte o texto do payload para date etc.
  insert into users (nome, data_nasc, email, senha_hash, telefone,
                     pontos, data_registro, email_verified_at, token_version)
  select nome, data_nasc, email, senha_hash, telefone,
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
create function public.consume_auth_code(
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
create function public.rotate_session(
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
create function public.bump_token_version(p_id_user uuid)
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

-- =====================================================================
-- 5. SEGURANÇA: RLS em tudo, nada para anon/authenticated
-- =====================================================================

alter table public.users                 enable row level security;
alter table public.perguntas             enable row level security;
alter table public.qrcodes               enable row level security;
alter table public.catch                 enable row level security;
alter table public.user_perguntas        enable row level security;
alter table public.friend_scans          enable row level security;
alter table public.pending_registrations enable row level security;
alter table public.auth_codes            enable row level security;
alter table public.sessions              enable row level security;
alter table public.rate_limits           enable row level security;
-- (nenhuma policy é criada de propósito: o app web nunca fala direto com o banco)

-- Permissões SÓ nos objetos do SOEA. Nada global no schema: outros sistemas no mesmo
-- banco continuam como estão. Os papéis anon/authenticated/service_role só existem no
-- Supabase; em outro Postgres (Neon, Railway, local…) este bloco simplesmente pula.
do $$
declare
  tabelas text := 'public.users, public.perguntas, public.qrcodes, public.catch, public.user_perguntas, '
               || 'public.friend_scans, public.pending_registrations, public.auth_codes, public.sessions, public.rate_limits';
  funcoes text[] := array[
    'public.trg_soma_pontos_captura()', 'public.trg_soma_pontos_resposta()', 'public.get_enum_values(text)',
    'public.rl_hit(text, integer, integer)', 'public.consume_registration(text, uuid, text, boolean, integer)',
    'public.consume_auth_code(uuid, text, text, integer, text)', 'public.rotate_session(text, text, integer, text, text)',
    'public.bump_token_version(uuid)'];
  f text;
begin
  foreach f in array funcoes loop
    execute format('revoke all on function %s from public', f);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on ' || tabelas || ' from anon';
    foreach f in array funcoes loop execute format('revoke all on function %s from anon', f); end loop;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on ' || tabelas || ' from authenticated';
    foreach f in array funcoes loop execute format('revoke all on function %s from authenticated', f); end loop;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on ' || tabelas || ' to service_role';
    foreach f in array funcoes loop execute format('grant execute on function %s to service_role', f); end loop;
  end if;
end $$;

-- Conferência: deve listar as 10 tabelas do SOEA, todas com rls = true
select tablename, rowsecurity as rls from pg_tables
where schemaname = 'public'
  and tablename in ('users','perguntas','qrcodes','catch','user_perguntas','friend_scans',
                    'pending_registrations','auth_codes','sessions','rate_limits')
order by 1;
