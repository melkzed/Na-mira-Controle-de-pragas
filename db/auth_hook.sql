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
    -- "role" no topo do JWT é reservado pelo PostgREST (define a role do
    -- Postgres da conexão: anon/authenticated/service_role). Usar esse nome
    -- aqui faz o PostgREST tentar "SET ROLE admin" e falhar (role não existe
    -- no Postgres) — por isso o papel da aplicação vai em app_role.
    claims := jsonb_set(claims, '{app_role}', to_jsonb(app_user.role));
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

-- IMPORTANTE: supabase_auth_admin NÃO ignora RLS por padrão — o grant acima
-- sozinho não basta, porque public.users tem "force row level security"
-- (db/rls.sql). Sem esta política, a consulta do hook acima sempre retorna
-- zero linhas (roda fora de um request autenticado, sem JWT — auth_org_id()
-- é nulo), nenhum claim é injetado, e todas as políticas de RLS do app negam
-- tudo mesmo com o vínculo auth_user_id correto.
drop policy if exists auth_admin_read_users on public.users;
create policy auth_admin_read_users on public.users
  as permissive for select
  to supabase_auth_admin
  using (true);
