-- ============================================================================
-- Na Mira · Controle de Pragas — endurece as funções do banco contra
-- "search_path" mutável (achado do Security Advisor do Supabase: "Function
-- Search Path Mutable"). Sem `search_path` fixo, uma função `security
-- definer`/chamada por outra role pode ser enganada por um schema malicioso
-- na frente do `search_path` da sessão — aqui nenhuma delas era realmente
-- explorável (todas as referências já eram a tipos/funções nativos do
-- Postgres ou totalmente qualificadas), mas fixar é a prática recomendada.
--
-- Rodar no SQL Editor do Supabase a qualquer momento (não depende de nenhum
-- outro script). Depois, rode db/rls.sql de novo — já vem com o mesmo fix
-- pras funções auth_org_id/auth_role/auth_user_id, mais a política nova de
-- trap_inspections (RLS estava ligado ali sem nenhuma política — bloqueava
-- tudo). Idempotente.
-- ============================================================================

create or replace function public.set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
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
    claims := jsonb_set(claims, '{app_role}', to_jsonb(app_user.role));
    claims := jsonb_set(claims, '{user_id}', to_jsonb(app_user.user_id::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;
