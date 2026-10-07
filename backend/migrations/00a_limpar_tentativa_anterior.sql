-- =====================================================================
-- SOEA · Apaga SÓ as tabelas do SOEA criadas na tentativa anterior
-- (users, perguntas, qrcodes, catch, user_perguntas, friend_scans e as de login).
-- Não toca em nenhuma outra tabela do projeto.
-- Trava de segurança: se alguma delas tiver dados, nada é apagado.
-- Rode ANTES de 00_banco_novo_completo.sql.
-- =====================================================================
do $$
declare t text; n bigint;
begin
  foreach t in array array['users','perguntas','qrcodes','catch','user_perguntas','friend_scans',
                           'pending_registrations','auth_codes','sessions','rate_limits'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'A tabela % tem % linha(s). Nada foi apagado.', t, n;
      end if;
    end if;
  end loop;
end $$;

drop table if exists public.user_perguntas, public.catch, public.friend_scans, public.qrcodes,
  public.perguntas, public.auth_codes, public.sessions, public.pending_registrations,
  public.rate_limits, public.users cascade;

drop function if exists public.trg_soma_pontos_captura();
drop function if exists public.trg_soma_pontos_resposta();
drop function if exists public.get_enum_values(text);
drop function if exists public.rl_hit(text, integer, integer);
drop function if exists public.consume_registration(text, uuid, text, boolean, integer);
drop function if exists public.consume_auth_code(uuid, text, text, integer, text);
drop function if exists public.rotate_session(text, text, integer, text, text);
drop function if exists public.bump_token_version(uuid);
