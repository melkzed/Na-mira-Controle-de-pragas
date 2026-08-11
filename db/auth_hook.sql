-- ============================================================================
-- Na Mira · Controle de Pragas — Custom Access Token Hook (Supabase Auth)
-- Aplicar após db/schema.sql e db/rls.sql.
-- ----------------------------------------------------------------------------
-- As políticas de RLS (db/rls.sql) dependem de claims org_id/role/user_id no
-- JWT emitido pelo Supabase Auth. Por padrão o Auth não sabe nada sobre
-- public.users — este hook injeta esses claims a cada login/refresh, lendo o
-- vínculo auth_user_id já existente em public.users.
--
-- Depois de rodar este arquivo, ainda é preciso registrar o hook no painel:
--   Authentication → Hooks → Custom Access Token → selecionar
--   public.custom_access_token_hook.
-- Sem esse passo no painel, o hook existe no banco mas não é chamado.
-- ============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  app_user record;
begin
  claims := event->'claims';

  select u.id as user_id, u.org_id, u.role::text as role
    into app_user
    from public.users u
    where u.auth_user_id = (event->>'user_id')::uuid
      and u.is_active
    limit 1;

  if app_user is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(app_user.org_id::text));
    claims := jsonb_set(claims, '{role}', to_jsonb(app_user.role));
    claims := jsonb_set(claims, '{user_id}', to_jsonb(app_user.user_id::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Só o serviço de Auth pode chamar o hook — nunca o cliente diretamente.
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- O hook consulta public.users, então o role de Auth precisa enxergar a tabela
-- (RLS continua valendo para todo o resto — isto não abre acesso ao cliente).
grant select on public.users to supabase_auth_admin;
