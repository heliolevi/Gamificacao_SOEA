-- =====================================================================
-- SOEA · Caça QR — 01: vínculo do participante no cadastro
--
-- Para bancos que JÁ existem (criados com o 00_banco_novo_completo.sql antigo).
-- Bancos novos não precisam disto: o 00 já inclui tudo.
--
-- É ADITIVA e segura de rodar mais de uma vez:
--   • cria users.vinculo (nulo para quem já tinha conta);
--   • mantém users.data_nasc (dados antigos não são apagados);
--   • atualiza consume_registration para gravar o vínculo.
-- O código antigo continua funcionando depois desta migração.
-- =====================================================================

alter table public.users add column if not exists vinculo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_vinculo_check') then
    alter table public.users add constraint users_vinculo_check check (
      vinculo is null or vinculo in (
        'comunidade', 'empresa', 'empresa_do_sistema', 'entidade',
        'instituicao_ensino_superior', 'startup_do_sistema'));
  end if;
end $$;

-- Valida o código do cadastro e cria a conta na MESMA transação (agora com o vínculo).
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

  -- jsonb_populate_record converte o texto do payload para date etc.
  insert into users (nome, vinculo, email, senha_hash, telefone,
                     pontos, data_registro, email_verified_at, token_version)
  select nome, vinculo, email, senha_hash, telefone,
         0, now(), now(), 0
  from jsonb_populate_record(null::users, r.payload || jsonb_build_object('email', p_email))
  returning id_user into novo_id;

  return jsonb_build_object('status', 'ok', 'id_user', novo_id);
exception when unique_violation then
  return jsonb_build_object('status', 'exists');
end $$;
